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
import threading
import time
from contextlib import contextmanager
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

# Importado DEPOIS dos módulos do Ciclone: `panorama` importa `db` e `regras`, que
# só existem no import path depois de `_carregar_modulos_ciclone()`.
import panorama  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("erp-gateway")


def _log_em_arquivo() -> None:
    """Espelha os logs num arquivo, incluindo os do uvicorn.

    Existe para a tarefa agendada poder chamar o python DIRETO, sem um .cmd
    intermediário que redirecione a saída. O .cmd anterior criava um processo pai
    que o Agendador matava sozinho, deixando o python órfão segurando a porta —
    e órfão sob token S4U não se mata sem elevação. Com o python como processo da
    própria tarefa, um Stop-ScheduledTask basta.
    """
    caminho = Path(os.getenv("GATEWAY_LOG", AQUI / "servico" / "gateway.log"))
    try:
        caminho.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(caminho, encoding="utf-8")
    except OSError as exc:  # disco cheio, permissão: não é motivo para não subir
        log.warning("Não foi possível abrir o log em '%s': %s", caminho, exc)
        return
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    # Só o logger raiz: os do uvicorn propagam para ele, e anexar nos dois fazia
    # cada linha sair duplicada no arquivo. `uvicorn.access` é a exceção — ele não
    # propaga, então precisa do handler próprio.
    logging.getLogger().addHandler(handler)
    logging.getLogger("uvicorn.access").addHandler(handler)


_log_em_arquivo()

SEGREDO = os.getenv("GATEWAY_SECRET", "")

# Teto de consultas simultâneas ao Ciclone.
#
# `db.conectar()` abre uma conexão POR REQUISIÇÃO, e o FastAPI roda endpoints
# síncronos num threadpool de dezenas de threads. Uma rajada de cliques na tela
# vira uma dezena de conexões simultâneas atravessando a VPN, que se atropelam:
# medimos a mesma consulta indo de 1,5 s para 30 s sob concorrência. O limite
# enfileira em vez de degradar todas ao mesmo tempo.
_LIMITE_ERP = threading.Semaphore(int(os.getenv("GATEWAY_MAX_CONCORRENTES", 3)))
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


@contextmanager
def _fila_erp(rota: str):
    """Serializa o acesso ao ERP dentro do teto de concorrência.

    A espera é registrada quando passa de 1 s: uma fila longa aparecendo no log é
    o sinal de que o teto está apertado demais (ou de que a tela está disparando
    consultas a mais).
    """
    inicio = time.monotonic()
    _LIMITE_ERP.acquire()
    espera = time.monotonic() - inicio
    if espera > 1:
        log.info("%s esperou %.1fs na fila do ERP", rota, espera)
    try:
        yield
    finally:
        _LIMITE_ERP.release()


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


def _unificar_por_codigo(df: pd.DataFrame) -> list[dict]:
    """Colapsa descrições que compartilham o mesmo código.

    O Ciclone tem códigos com mais de uma descrição — o tipo 13 aparece como
    'MALA RN' e 'MALA RODRIGO'. Para a conciliação o que existe é o CÓDIGO: é por
    ele que `movimentos.py` filtra, e o próprio comentário de lá já trata os dois
    como um só ('venda-mala Rodrigo/RN'). Entregar as duas linhas faria a tela
    exibir um item repetido em que marcar um marca o outro.

    As descrições são juntadas em vez de descartadas para não esconder do usuário
    que aquele código cobre mais de uma coisa.
    """
    juntos: dict[int, list[str]] = {}
    for r in df.itertuples(index=False):
        codigo = int(r.codigo)
        descricao = str(r.descricao or "").strip()
        if descricao and descricao not in juntos.setdefault(codigo, []):
            juntos[codigo].append(descricao)
    return [
        {"codigo": c, "descricao": " / ".join(d)} for c, d in sorted(juntos.items())
    ]


# Tipos de produto que são ÓCULOS — o que entra no inventário do representante.
# É allowlist de propósito: um tipo novo no Ciclone (uma "cordinha", um brinde)
# fica de fora por padrão. A lista de acessórios de `movimentos.py` é denylist e
# deixou passar 16 itens quando conferida contra este campo — expositores, brinde
# e cadastros genéricos de faturamento.
TIPOS_OCULOS = (2, 3)  # 2=OCULOS RECEITUARIO, 3=OCULOS SOLAR

SQL_CATALOGO = """
SELECT
    gen.eqpdg_codigo                                          AS codigo_produto,
    gen.eqpdg_nome                                            AS nome_produto,
    est.eqpee_cor                                             AS cor,
    COALESCE(est.eqpee_referenciaauxiliargrade,
             CASE WHEN est.eqpee_cor IS NOT NULL AND est.eqpee_cor <> ''
                       AND est.eqpee_cor <> 'COR'
                  THEN CONCAT(gen.eqpdg_codigo, ' ', est.eqpee_cor)
                  ELSE gen.eqpdg_codigo END)                  AS codigo_auxiliar,
    COALESCE(prod.eqpde_valorvendaatacado,
             prod.eqpde_valorvendavarejo, 0)                  AS valor_produto,
    COALESCE(prod.eqpde_valorvendaatacado, prod.eqpde_valorvendavarejo, 0)
      - (COALESCE(prod.eqpde_valorvendaatacado, prod.eqpde_valorvendavarejo, 0)
         * COALESCE(remessa.preco_remessa_atacado,
                    remessa.preco_remessa_varejo, 0) / 100)   AS valor_remessa,
    -- A situação da GRADE manda quando existe: no Ciclone o OB1190 pode estar
    -- ativo enquanto a cor A02 já foi inativada.
    COALESCE(est.eqpee_situacao, gen.eqpdg_situacao)           AS situacao,
    -- ---- Atributos de categoria -------------------------------------------
    -- Só ASCII e Latin-1 nos comentários DESTE SQL: a conexão com o Ciclone é
    -- cp1252, e um caractere fora dessa tabela (um traço de caixa, por exemplo)
    -- estoura na codificação da query, antes mesmo de sair da máquina.
    --
    -- MARCA vem da COLEÇÃO: no Ciclone não existe cadastro de marca, e as marcas
    -- da casa (OBEN, POWER, CORE EYES) estão como coleção — é por isso que o
    -- relatório do próprio ERP se chama "Análise de Estoque por Coleção Marca".
    col.eqcol_descricao                                        AS marca,
    tpr.eqtpr_descricao                                        AS tipo,
    -- No Ciclone o grupo GENÉRICO é o material (ACETATO/METAL) e o ESPECÍFICO é o
    -- público (FEMININO/MASCULINO). Os nomes das tabelas sugerem hierarquia de
    -- mesma natureza; os dados dizem que são dimensões diferentes.
    gru.eqgru_descricao                                        AS subtipo,
    grg.eqgrg_descricao                                        AS grupo,
    cor_esp.eqcor_nome                                         AS cor_nome
FROM eq_produtogenerico gen
LEFT JOIN eq_produtoespecifico prod
       ON prod.pgemp_codigo = gen.pgemp_codigo
      AND prod.eqpdg_codigo = gen.eqpdg_codigo
LEFT JOIN eq_produtoespecificoestoque est
       ON est.pgemp_codigo = prod.pgemp_codigo
      AND est.pgfll_codigo = prod.pgfll_codigo
      AND est.eqpdg_codigo = prod.eqpdg_codigo
      AND COALESCE(est.eqpee_cor, '') <> 'COR'
-- Todos LEFT: hoje os cinco atributos estão preenchidos em todos os óculos, mas um
-- INNER faria um cadastro futuro sem coleção SUMIR do catálogo do app — o produto
-- desapareceria da tela de inventário por causa de um campo de classificação.
--
-- Nada de sinal de porcentagem em comentário DESTE SQL: psycopg2 interpola a query
-- antes de enviá-la, e um sinal solto vira placeholder malformado ("dict is not a
-- sequence") sem nenhuma pista de que a causa está num comentário.
LEFT JOIN eq_colecao        col ON col.eqcol_codigo = gen.eqcol_codigo
LEFT JOIN eq_tipoproduto    tpr ON tpr.eqtpr_codigo = gen.eqtpr_codigo
LEFT JOIN eq_grupoespecifico gru ON gru.eqgru_codigo = gen.eqgru_codigo
LEFT JOIN eq_grupogenerico   grg ON grg.eqgrg_codigo = gru.eqgrg_codigo
LEFT JOIN eq_corespecifica cor_esp ON cor_esp.eqcor_codigo = est.eqpee_cor
LEFT JOIN (SELECT eqpdg_codigo,
                  MAX(vdtvp_valorreajusteatacado) AS preco_remessa_atacado,
                  MAX(vdtvp_valorreajustevarejo)  AS preco_remessa_varejo
           FROM vd_tabelavendaproduto
           WHERE vdtbv_codigo = 3 AND vdtvp_situacao = 'A'
           GROUP BY eqpdg_codigo) remessa
       ON remessa.eqpdg_codigo = prod.eqpdg_codigo
WHERE gen.pgemp_codigo = ANY(%(empresas)s)
  AND gen.eqtpr_codigo = ANY(%(tipos)s)
  AND est.eqpee_cor IS NOT NULL
"""


@app.get("/produtos", dependencies=PROTEGIDO)
def catalogo_produtos(
    empresas: list[int] | None = Query(None),
    incluir_inativos: bool = Query(True, description="Inativos sobem marcados."),
):
    """Catálogo de óculos para sincronizar com o Supabase.

    Traz ativos e inativos: produto inativado no Ciclone continua existindo no
    histórico de inventários, e some do catálogo do app perderia o nome e o valor
    de contagens antigas. Quem decide o que fazer com a situação é o app.

    Acessórios saem por DOIS filtros que se cobrem: o tipo de produto (allowlist)
    e a regra de texto de `movimentos.py` (rede para os miscadastros — há estojos
    cadastrados como "OCULOS SOLAR" no Ciclone).
    """
    if empresas is None:
        empresas = db.EMPRESAS_PADRAO
    try:
        with _fila_erp("/produtos"):
            conn = db.conectar()
            try:
                df = pd.read_sql_query(
                    SQL_CATALOGO, conn,
                    params={"empresas": list(empresas), "tipos": list(TIPOS_OCULOS)},
                )
            finally:
                conn.close()
    except Exception as exc:
        raise _erro_erp(exc)

    if df.empty:
        return {"total": 0, "dados": []}

    df["codigo_auxiliar"] = df["codigo_auxiliar"].fillna("").astype(str).str.strip()

    # Produto sem código auxiliar não sobe: o código é a chave do catálogo no app e
    # de todo item de inventário. Hoje isso não descarta nada — a consulta deriva o
    # código de `produto + cor` quando o Ciclone não tem a referência registrada,
    # e não há grade sem cor. É guarda contra dado futuro, não filtro ativo.
    sem_codigo = int((df["codigo_auxiliar"] == "").sum())
    if sem_codigo:
        log.warning("/produtos: %d linhas descartadas por não terem código auxiliar", sem_codigo)
        df = df[df["codigo_auxiliar"] != ""]

    df = df[~df["codigo_auxiliar"].map(movimentos.eh_acessorio)]
    df["ativo"] = df["situacao"].astype(str).str.upper().str.strip() == "A"

    if not incluir_inativos:
        df = df[df["ativo"]]

    # O mesmo código auxiliar existe nas duas empresas. Fica UMA linha por código,
    # preferindo a ativa e, entre ativas, a de maior valor — que é a regra que
    # `comparativo.py` já usa ao consolidar valores por chave.
    df = (
        df.sort_values(["ativo", "valor_produto"], ascending=[False, False])
        .drop_duplicates("codigo_auxiliar", keep="first")
        .reset_index(drop=True)
    )
    df["modelo"] = df["codigo_produto"].astype(str).str.strip()
    df["cor"] = df["cor"].astype(str).str.strip()

    # Atributos de categoria: sobem como o Ciclone os escreve (caixa alta, sem
    # acento). Traduzir para um vocabulário "bonito" aqui criaria um segundo nome
    # para cada categoria, e o gestor confere a tela contra o relatório do ERP.
    # O que se normaliza é só o que atrapalha o AGRUPAMENTO: espaço nas pontas, e
    # vazio virando ausência — '' e NULL seriam dois grupos com o mesmo sentido.
    for atributo in ("marca", "tipo", "subtipo", "grupo", "cor_nome"):
        df[atributo] = df[atributo].fillna("").astype(str).str.strip()
        df.loc[df[atributo] == "", atributo] = None

    colunas = ["codigo_auxiliar", "codigo_produto", "nome_produto",
               "modelo", "cor", "valor_produto", "valor_remessa", "ativo",
               "marca", "tipo", "subtipo", "grupo", "cor_nome"]
    _conferir_limite(df, "/produtos")
    return {"total": len(df), "dados": _para_json(df[colunas])}


@app.get("/regras", dependencies=PROTEGIDO)
def regras_conciliacao():
    """Vocabulário e padrões das regras de conciliação, numa viagem só.

    A tela precisa das três coisas juntas para montar os checkboxes: a lista de
    tipos de pedido, a de operações fiscais, e quais vêm marcados por padrão.
    Separar em três rotas faria a tela pedir três vezes o que nunca é usado em
    separado.

    Os padrões saem de `movimentos.py` — não são repetidos aqui. É o mesmo módulo
    que a ferramenta local usa, então tela e tkinter partem da mesma base.
    """
    try:
        with _fila_erp("/regras"):
            tipos = db.listar_tipos_pedido()
            operacoes = db.listar_operacoes()
    except Exception as exc:
        raise _erro_erp(exc)
    return {
        "tipos_pedido": _unificar_por_codigo(tipos),
        "operacoes": _unificar_por_codigo(operacoes),
        "padroes": {
            "tipos_remessa": sorted(movimentos.TIPOS_REMESSA),
            "tipos_venda": sorted(movimentos.TIPOS_VENDA),
            # Estas vêm DESMARCADAS: não movimentam estoque físico, então não
            # devem entrar na conciliação. Todas as demais entram.
            "operacoes_sem_movimento_estoque": sorted(
                movimentos.OPERACOES_SEM_MOVIMENTO_ESTOQUE
            ),
        },
    }


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
        with _fila_erp("/pedidos"):
            bruto = db.consultar_pedidos(vendedores, de, ate, empresas, base_data=base_data)
            codigos = db.listar_vendedores()["codigo"].tolist()
        _conferir_limite(bruto, "/pedidos")
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
    tipos_venda: list[int] | None = Query(
        None, description="Tipos de pedido que saem da mala. Omitido = padrão."
    ),
    tipos_remessa: list[int] | None = Query(
        None, description="Tipos de pedido que entram na mala. Omitido = padrão."
    ),
    operacoes: list[int] | None = Query(
        None, description="Operações fiscais a considerar. Omitido = todas."
    ),
):
    """Vendas e remessas agregadas por código auxiliar, para a reconciliação.

    Devolve o FATO do ERP e para por aí. A conta `q2_esperado = q1 + remessa −
    venda` fica no app, junto dos inventários — uma cópia só da fórmula.

    As regras de conciliação são as mesmas de `movimentos.py`, com override por
    consulta: omitir um parâmetro usa o padrão do módulo, que é o que a ferramenta
    local usa. Nenhuma regra é redefinida aqui.
    """
    if de > ate:
        raise HTTPException(422, "A data inicial não pode ser posterior à final.")
    try:
        with _fila_erp("/movimentos"):
            df = movimentos.movimentos_por_produto(
                vendedor,
                str(de),
                str(ate),
                empresas,
                tipos_venda=tipos_venda,
                tipos_remessa=tipos_remessa,
                operacoes=operacoes,
                base_data=base_data,
            )
        _conferir_limite(df, "/movimentos")
    except HTTPException:
        raise
    except Exception as exc:
        raise _erro_erp(exc)
    return {"total": len(df), "vendedor": vendedor,
            "de": de.isoformat(), "ate": ate.isoformat(),
            "dados": _para_json(df)}


@app.get("/saidas", dependencies=PROTEGIDO)
def saidas(
    de: date = Query(..., description="Data inicial (AAAA-MM-DD)"),
    ate: date = Query(..., description="Data final (AAAA-MM-DD)"),
    nivel: str = Query("categoria", pattern="^(categoria|produto)$"),
    empresas: list[int] | None = Query(None, description="Padrão: EMPRESAS_PADRAO"),
    base_data: str = Query("movimento", pattern="^(movimento|emissao)$"),
    incluir_canceladas: bool = Query(False, description="Canceladas ficam fora por padrão."),
    marcas: list[str] | None = Query(None, description="Recorte; '' = sem categoria."),
    tipos: list[str] | None = Query(None),
    subtipos: list[str] | None = Query(None),
    grupos: list[str] | None = Query(None),
    tipos_pedido: list[int] | None = Query(None),
    operacoes: list[int] | None = Query(None),
    cfops: list[str] | None = Query(None),
):
    """Saídas agregadas — a lente gerencial, oposta à auditoria do `/pedidos`.

    `/pedidos` devolve LINHA; esta rota devolve SOMA. É a diferença que faz a
    consulta de um ano caber: a mesma janela que estoura o teto de linhas em
    `/pedidos` sai daqui com algumas centenas de grupos, porque quem agrega é o
    Postgres.

    `nivel=categoria` é a resposta de entrada, com o mês na chave — a tela recebe
    uma vez e faz todo o drill-down e a série temporal localmente.
    `nivel=produto` é a FOLHA, pedida só quando o gestor abre uma categoria; os
    recortes chegam nos parâmetros para o produto não voltar por inteiro.

    As classificações continuam vindo de `regras.py`, as mesmas da tela de
    auditoria — ver o cabeçalho de `panorama.py` para por que aplicá-las depois do
    GROUP BY dá o mesmo resultado.
    """
    if de > ate:
        raise HTTPException(422, "A data inicial não pode ser posterior à final.")

    recortes = {
        "marcas": marcas,
        "tipos": tipos,
        "subtipos": subtipos,
        "grupos": grupos,
        "tipos_pedido": tipos_pedido,
        "operacoes": operacoes,
        "cfops": cfops,
    }
    consulta = (
        panorama.saidas_por_produto if nivel == "produto" else panorama.saidas_por_categoria
    )
    try:
        with _fila_erp(f"/saidas[{nivel}]"):
            df = consulta(
                str(de),
                str(ate),
                empresas=empresas,
                base_data=base_data,
                incluir_canceladas=incluir_canceladas,
                **recortes,
            )
        _conferir_limite(df, f"/saidas[{nivel}]")
    except HTTPException:
        raise
    except Exception as exc:
        raise _erro_erp(exc)

    return {
        "total": len(df),
        "nivel": nivel,
        "de": de.isoformat(),
        "ate": ate.isoformat(),
        "base_data": base_data,
        "dados": _para_json(df),
    }


@app.get("/entradas", dependencies=PROTEGIDO)
def entradas(
    de: date = Query(..., description="Data inicial (AAAA-MM-DD)"),
    ate: date = Query(..., description="Data final (AAAA-MM-DD)"),
    nivel: str = Query("categoria", pattern="^(categoria|produto)$"),
    empresas: list[int] | None = Query(None, description="Padrão: EMPRESAS_PADRAO"),
    base_data: str = Query("movimento", pattern="^(movimento|emissao)$"),
    incluir_canceladas: bool = Query(False),
    incluir_sem_movimento: bool = Query(
        False, description="Liga as notas 'N' — DOBRA a compra. Ver panorama.py."
    ),
    marcas: list[str] | None = Query(None, description="Recorte; '' = sem categoria."),
    tipos: list[str] | None = Query(None),
    subtipos: list[str] | None = Query(None),
    grupos: list[str] | None = Query(None),
    fornecedores: list[int] | None = Query(None),
    operacoes: list[int] | None = Query(None),
    cfops: list[str] | None = Query(None),
):
    """Entradas agregadas — mercadoria que a Focco Brasil recebeu.

    Espelho do `/saidas`, sobre `eq_notafiscalentrada`. Duas coisas que não têm
    equivalente do outro lado e que mudam o número na tela:

      1. **A nota é versionada por cancelamento.** Sem ficar só com a última
         versão, a mesma nota conta várias vezes.
      2. **`incluir_sem_movimento` vem DESLIGADO, e ligá-lo dobra a compra.** Toda
         compra entra como duas notas de mesmo número — uma com código genérico que
         não movimenta estoque, outra com o SKU real que movimenta. Ele existe para
         conferência fiscal, não para leitura gerencial.

    `fornecedor` não é só fornecedor: em RETORNO DE REMESSA o remetente é o próprio
    representante devolvendo o que sobrou da mala. Quem separa é `classif_entrada`.
    """
    if de > ate:
        raise HTTPException(422, "A data inicial não pode ser posterior à final.")

    recortes = {
        "marcas": marcas,
        "tipos": tipos,
        "subtipos": subtipos,
        "grupos": grupos,
        "fornecedores": fornecedores,
        "operacoes": operacoes,
        "cfops": cfops,
    }
    consulta = (
        panorama.entradas_por_produto if nivel == "produto" else panorama.entradas_por_categoria
    )
    try:
        with _fila_erp(f"/entradas[{nivel}]"):
            df = consulta(
                str(de),
                str(ate),
                empresas=empresas,
                base_data=base_data,
                incluir_canceladas=incluir_canceladas,
                incluir_sem_movimento=incluir_sem_movimento,
                **recortes,
            )
        _conferir_limite(df, f"/entradas[{nivel}]")
    except HTTPException:
        raise
    except Exception as exc:
        raise _erro_erp(exc)

    return {
        "total": len(df),
        "nivel": nivel,
        "de": de.isoformat(),
        "ate": ate.isoformat(),
        "base_data": base_data,
        "dados": _para_json(df),
    }


if __name__ == "__main__":
    import uvicorn

    # host fixo em 127.0.0.1: a exposição é responsabilidade do cloudflared.
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("GATEWAY_PORT", 8000)))
