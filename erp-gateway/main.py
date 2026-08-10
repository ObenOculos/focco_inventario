"""
ERP Gateway — camada HTTP fina sobre os módulos de consulta ao Ciclone.

Este serviço NÃO tem regra de negócio própria. Ele expõe, sob autenticação, as
funções que já existem em `db.py` / `regras.py` / `movimentos.py` — os mesmos
módulos usados pela ferramenta tkinter, sem cópia e sem alteração. Se a regra
mudar lá (tipos de pedido, operações fiscais), muda aqui junto.

A postura de rede importa mais que o código:

  - Escuta SOMENTE em 127.0.0.1. Quem publica é o `cloudflared`, que abre
    conexão de SAÍDA para a Cloudflare. Nenhuma porta é aberta nesta máquina.
  - Não há CORS de propósito: o browser nunca fala com este serviço. Quem
    chama é a Edge Function `erp-consulta`, que já validou o JWT do Supabase
    e exigiu `role='gerente'`.
  - As credenciais do ERP ficam no `.env` local e nunca trafegam.
"""

import logging
import os
import secrets
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

AQUI = Path(__file__).resolve().parent

# O .env DESTE serviço é carregado explicitamente e ANTES de importar os módulos
# do Ciclone. `config.py` lê as credenciais com os.getenv no momento do import,
# e o load_dotenv() dele resolve o caminho a partir do arquivo que chama —
# ou seja, a pasta da ferramenta tkinter, não esta. Preenchendo os.environ aqui,
# o resultado deixa de depender dessa sutileza.
load_dotenv(AQUI / ".env")

# Teto de tempo por consulta, aplicado pelo próprio Postgres. libpq lê PGOPTIONS
# do ambiente, então isso vale sem tocar em `config.py`/`db.py`. Sem ele, uma
# consulta ampla poderia segurar um worker até o timeout do túnel.
os.environ.setdefault(
    "PGOPTIONS", f"-c statement_timeout={int(os.getenv('ERP_STATEMENT_TIMEOUT_MS', 30000))}"
)


def _carregar_modulos_ciclone() -> Path:
    """Coloca os módulos de consulta ao Ciclone no import path.

    Hoje eles moram na pasta da ferramenta tkinter, na mesma máquina: apontar
    para lá evita cópia e mantém gateway e ferramenta com a MESMA regra de
    negócio. Ao migrar para o servidor (onde a ferramenta tkinter não vai),
    copie `config.py`, `db.py`, `regras.py` e `movimentos.py` para `./ciclone`
    e não defina CICLONE_MODULES — o padrão já aponta para lá.
    """
    caminho = Path(os.getenv("CICLONE_MODULES", AQUI / "ciclone")).expanduser()
    if not caminho.is_dir():
        raise RuntimeError(
            f"Módulos do Ciclone não encontrados em '{caminho}'. Defina CICLONE_MODULES "
            "no .env apontando para a pasta que contém db.py, regras.py e movimentos.py."
        )
    faltando = [m for m in ("config.py", "db.py", "regras.py", "movimentos.py")
                if not (caminho / m).is_file()]
    if faltando:
        raise RuntimeError(f"Faltam módulos em '{caminho}': {', '.join(faltando)}")
    sys.path.insert(0, str(caminho))
    return caminho


CAMINHO_CICLONE = _carregar_modulos_ciclone()

# As credenciais do ERP também são aceitas do .env da própria ferramenta tkinter,
# para não existirem duas cópias da mesma senha em máquinas onde as duas rodam.
# `override=False`: o .env do gateway, já carregado, continua tendo precedência.
load_dotenv(CAMINHO_CICLONE / ".env", override=False)

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from fastapi import Depends, FastAPI, Header, HTTPException, Query  # noqa: E402

import db  # noqa: E402
import movimentos  # noqa: E402
import regras  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("erp-gateway")

SEGREDO = os.getenv("GATEWAY_SECRET", "")
# Teto de linhas por resposta. Diferente do timeout, protege a rede e o browser:
# `consultar_pedidos` aceita vendedor nulo (= todos), e um intervalo largo pode
# devolver centenas de milhares de linhas.
LIMITE_LINHAS = int(os.getenv("GATEWAY_MAX_LINHAS", 20000))

app = FastAPI(
    title="ERP Gateway — Ciclone",
    description="Consulta somente-leitura ao ERP Ciclone. Uso interno.",
    version="1.0",
    # Documentação interativa desligada por padrão. Ela não vaza dado, mas
    # publica o mapa da API — e `redoc_url` precisa ser desligado junto, senão
    # continua servindo o mesmo esquema por outra rota.
    docs_url=os.getenv("GATEWAY_DOCS_URL") or None,
    redoc_url=None,
)


# ── Autenticação ─────────────────────────────────────────────────────────────
def exigir_segredo(x_gateway_secret: str = Header(default="", alias="X-Gateway-Secret")):
    """Segredo compartilhado com a Edge Function.

    Não é autenticação de usuário — quem identifica e autoriza a pessoa é a Edge
    Function, contra `profiles.role`. Aqui só se responde: 'quem chama é o nosso
    backend?'. compare_digest evita vazar o segredo por tempo de resposta.
    """
    if not SEGREDO:
        raise HTTPException(500, "GATEWAY_SECRET não configurado no servidor.")
    if not secrets.compare_digest(x_gateway_secret, SEGREDO):
        raise HTTPException(401, "Segredo do gateway inválido ou ausente.")


PROTEGIDO = [Depends(exigir_segredo)]


# ── Serialização ─────────────────────────────────────────────────────────────
def _para_json(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> lista de dicts serializável.

    Resolve o que `to_dict` cru não resolve e que estouraria na hora de gerar o
    JSON: NaN/NaT viram null, Timestamp vira ISO-8601, e os numéricos voltam a
    ser tipos nativos — psycopg2 devolve Decimal em colunas numeric, e o pandas
    devolve np.int64/np.float64.
    """
    if df is None or df.empty:
        return []
    limpo = df.astype(object).where(pd.notna(df), None)
    registros = limpo.to_dict(orient="records")
    for linha in registros:
        for chave, valor in linha.items():
            if isinstance(valor, (pd.Timestamp, datetime, date)):
                linha[chave] = valor.isoformat()
            elif isinstance(valor, Decimal):
                linha[chave] = float(valor)
            elif isinstance(valor, np.integer):
                linha[chave] = int(valor)
            elif isinstance(valor, np.floating):
                linha[chave] = float(valor)
            elif isinstance(valor, np.bool_):
                linha[chave] = bool(valor)
    return registros


def _conferir_limite(df: pd.DataFrame, rota: str) -> None:
    if len(df) > LIMITE_LINHAS:
        raise HTTPException(
            413,
            f"A consulta devolveu {len(df):,} linhas (teto: {LIMITE_LINHAS:,}). "
            "Reduza o período ou informe um vendedor.".replace(",", "."),
        )
    log.info("%s -> %d linhas", rota, len(df))


def _erro_erp(exc: Exception) -> HTTPException:
    """Falha de banco vira 503, não 500.

    A distinção é o que permite a tela dizer 'ERP indisponível' em vez de 'erro
    inesperado' — o caso comum aqui é a VPN cair ou a máquina do escritório
    perder rede, e isso não é bug do app.
    """
    log.error("Falha ao consultar o ERP: %s", exc)
    return HTTPException(503, f"ERP indisponível: {exc}")


# ── Rotas ────────────────────────────────────────────────────────────────────
@app.get("/saude")
def saude():
    """Liveness do processo. Sem autenticação e sem tocar no ERP — é o que o
    túnel e o supervisor consultam, e precisa continuar barato.

    Não devolve nada além disso: é a ÚNICA rota aberta, e do outro lado do túnel
    está a internet. Caminho de disco e configuração vão em /saude/erp, atrás do
    segredo.
    """
    return {"ok": True, "servico": "erp-gateway"}


@app.get("/saude/erp", dependencies=PROTEGIDO)
def saude_erp():
    """Testa a conexão com o Ciclone de verdade (VPN + credenciais)."""
    try:
        conn = db.conectar()
        conn.close()
    except Exception as exc:
        raise _erro_erp(exc)
    return {"ok": True, "erp": "acessível", "modulos": str(CAMINHO_CICLONE)}


@app.get("/vendedores", dependencies=PROTEGIDO)
def vendedores():
    """[codigo, nome, situacao] — alimenta o seletor da tela."""
    try:
        df = db.listar_vendedores()
    except Exception as exc:
        raise _erro_erp(exc)
    return {"total": len(df), "dados": _para_json(df)}


@app.get("/pedidos", dependencies=PROTEGIDO)
def pedidos(
    de: date = Query(..., description="Data inicial (AAAA-MM-DD)"),
    ate: date = Query(..., description="Data final (AAAA-MM-DD)"),
    vendedores: list[int] | None = Query(None, description="Códigos; vazio = todos"),
    empresas: list[int] | None = Query(None, description="Padrão: EMPRESAS_PADRAO"),
    base_data: str = Query("movimento", pattern="^(movimento|emissao)$"),
):
    """Linhas de pedido/nota já classificadas — é a tela de auditoria do tkinter.

    Mesmo caminho de código da ferramenta: consulta bruta, `enriquecer` para as
    classificações e sinais de divergência, `marcar_papel` para o vínculo. O
    sinal S2 ('venda endereçada a representante') precisa da lista completa de
    vendedores, por isso ela é buscada aqui.
    """
    if de > ate:
        raise HTTPException(422, "A data inicial não pode ser posterior à final.")
    try:
        bruto = db.consultar_pedidos(vendedores, de, ate, empresas, base_data=base_data)
        _conferir_limite(bruto, "/pedidos")
        codigos = db.listar_vendedores()["codigo"].tolist()
        df = regras.enriquecer(bruto, vendedores_codigos=codigos)
        if vendedores:
            df = regras.marcar_papel(df, vendedores)
    except HTTPException:
        raise
    except Exception as exc:
        raise _erro_erp(exc)
    return {"total": len(df), "dados": _para_json(df)}


@app.get("/movimentos", dependencies=PROTEGIDO)
def movimentos_(
    vendedor: int = Query(..., description="Código do vendedor"),
    de: date = Query(..., description="Data do inventário inicial"),
    ate: date = Query(..., description="Data do inventário final"),
    empresas: list[int] | None = Query(None),
    base_data: str = Query("movimento", pattern="^(movimento|emissao)$"),
):
    """Vendas e remessas agregadas por código auxiliar, para a reconciliação.

    Devolve o FATO do ERP e para por aí. A conta `q2_esperado = q1 + remessa −
    venda` fica no app, junto dos inventários — uma cópia só da fórmula.
    """
    if de > ate:
        raise HTTPException(422, "A data inicial não pode ser posterior à final.")
    try:
        df = movimentos.movimentos_por_produto(
            vendedor, str(de), str(ate), empresas, base_data=base_data
        )
        _conferir_limite(df, "/movimentos")
    except HTTPException:
        raise
    except Exception as exc:
        raise _erro_erp(exc)
    return {"total": len(df), "vendedor": vendedor,
            "de": de.isoformat(), "ate": ate.isoformat(),
            "dados": _para_json(df)}


if __name__ == "__main__":
    import uvicorn

    # host fixo em 127.0.0.1: a exposição é responsabilidade do cloudflared.
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("GATEWAY_PORT", 8000)))
