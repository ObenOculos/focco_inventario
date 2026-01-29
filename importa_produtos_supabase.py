import os
from typing import Any, Dict, List, Tuple, Optional, Generator, cast
from collections import OrderedDict
import psycopg2
from psycopg2.extensions import connection as Connection, cursor as Cursor
from supabase import create_client, Client
from dotenv import load_dotenv


def carregar_configuracoes() -> Tuple[str, str, str, str, str, str]:
    """Carrega e valida as variáveis de ambiente necessárias."""
    load_dotenv()

    # Configurações do ERP
    erp_host = os.getenv("ERP_HOST", "SEU_HOST")
    erp_db = os.getenv("ERP_DB", "SEU_DB")
    erp_user = os.getenv("ERP_USER", "SEU_USER")
    erp_password = os.getenv("ERP_PASSWORD", "SUA_SENHA")

    # Configurações do Supabase
    supabase_url: Optional[str] = os.getenv("VITE_SUPABASE_URL")
    supabase_key: Optional[str] = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise ValueError("VITE_SUPABASE_URL não configurada no arquivo .env")
    if not supabase_key:
        raise ValueError(
            "VITE_SUPABASE_SERVICE_ROLE_KEY não configurada no arquivo .env"
        )

    return erp_host, erp_db, erp_user, erp_password, supabase_url, supabase_key


def obter_produtos_erp(
    host: str, dbname: str, user: str, password: str
) -> List[Tuple[Any, ...]]:
    """Conecta ao ERP e retorna a lista de produtos ativos."""
    query: str = """
        SELECT * FROM (
            SELECT DISTINCT
                gen.eqpdg_codigo AS codigo_produto,
                COALESCE(
                    est.eqpee_referenciaauxiliargrade,
                    CASE
                        WHEN est.eqpee_cor IS NOT NULL 
                            AND est.eqpee_cor != '' 
                            AND est.eqpee_cor != 'COR'
                        THEN CONCAT(gen.eqpdg_codigo, ' ', est.eqpee_cor)
                        ELSE gen.eqpdg_codigo
                    END
                ) AS codigo_auxiliar,
                COALESCE(gen.eqpdg_nome, 'SEM DESCRICAO') AS nome_produto,
                'R$ ' || REPLACE(
                    TO_CHAR(
                        COALESCE(
                            prod.eqpde_valorvendaatacado, 
                            prod.eqpde_valorvendavarejo, 
                            0
                        ), 
                        'FM999G999G990D90'
                    ), 
                    '.', 
                    ','
                ) AS valor_produto
            FROM
                public.eq_produtogenerico gen
            LEFT JOIN public.eq_produtoespecifico prod ON
                prod.pgemp_codigo = gen.pgemp_codigo 
                AND prod.eqpdg_codigo = gen.eqpdg_codigo
            LEFT JOIN public.eq_produtoespecificoestoque est ON
                est.pgemp_codigo = prod.pgemp_codigo 
                AND est.pgfll_codigo = prod.pgfll_codigo 
                AND est.eqpdg_codigo = prod.eqpdg_codigo 
                AND COALESCE(est.eqpee_cor, '') != 'COR'
            WHERE
                gen.eqpdg_situacao = 'A'
                AND COALESCE(prod.eqpde_controlaestoque, 'S') = 'S'
                AND EXISTS (
                    SELECT 1 
                    FROM public.eq_produtoespecifico prod_check
                    WHERE prod_check.pgemp_codigo = gen.pgemp_codigo
                        AND prod_check.eqpdg_codigo = gen.eqpdg_codigo
                        AND prod_check.eqpde_controlaestoque = 'S'
                )
        ) AS sub
        WHERE sub.codigo_auxiliar LIKE 'OB%' 
            OR sub.codigo_auxiliar LIKE 'PW%'
        ORDER BY sub.codigo_produto
    """

    conn: Optional[Connection] = None
    cur: Optional[Cursor] = None

    try:
        conn = psycopg2.connect(host=host, dbname=dbname, user=user, password=password)
        cur = conn.cursor()
        cur.execute(query)
        produtos: List[Tuple[Any, ...]] = cur.fetchall()
        return produtos
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def obter_codigos_existentes(supabase_client: Client) -> set[str]:
    """Busca códigos auxiliares já existentes no Supabase."""
    existing_codes: set[str] = set()
    offset = 0

    while True:
        batch = (
            supabase_client.table("produtos")
            .select("codigo_auxiliar")
            .range(offset, offset + 999)
            .execute()
            .data
        )
        if not batch:
            break
        for row in batch:
            existing_codes.add(
                str(cast(Dict[str, Any], row).get("codigo_auxiliar", ""))
            )
        offset += 1000
        if len(batch) < 1000:
            break

    return existing_codes


def processar_produto(produto_raw: Tuple[Any, ...]) -> Dict[str, Any]:
    """Processa os dados brutos do produto e retorna um dicionário formatado."""
    codigo_produto: Any = produto_raw[0]
    codigo_auxiliar: Any = produto_raw[1]
    nome_produto: Any = produto_raw[2]
    valor_produto_str: str = (
        str(produto_raw[3]).replace("R$ ", "").replace(".", "").replace(",", ".")
    )

    valor_produto: float
    try:
        valor_produto = float(valor_produto_str)
    except (ValueError, AttributeError):
        valor_produto = 0.0

    # Extração de modelo e cor a partir do código auxiliar
    partes: List[str] = str(codigo_auxiliar).split()
    modelo: str = partes[0] if len(partes) > 0 else ""
    cor: str = " ".join(partes[1:]) if len(partes) > 1 else ""

    return {
        "codigo_produto": codigo_produto,
        "codigo_auxiliar": codigo_auxiliar,
        "nome_produto": nome_produto,
        "modelo": modelo,
        "cor": cor,
        "valor_produto": valor_produto,
    }


def chunked(
    iterable: List[Dict[str, Any]], size: int
) -> Generator[List[Dict[str, Any]], None, None]:
    """Divide uma lista em chunks de tamanho especificado."""
    for i in range(0, len(iterable), size):
        yield iterable[i : i + size]


def sincronizar_produtos(
    supabase_client: Client, produtos_para_importar: List[Dict[str, Any]]
) -> int:
    """Sincroniza os produtos com o Supabase em lotes."""
    total_lotes = (len(produtos_para_importar) + 999) // 1000

    if total_lotes > 0:
        print(
            f"\nEnviando {len(produtos_para_importar)} produtos em {total_lotes} lote(s)..."
        )
        print("-" * 60)

    for i, batch in enumerate(chunked(produtos_para_importar, 1000), 1):
        print(f"Lote {i}/{total_lotes}: enviando {len(batch)} produtos...")
        supabase_client.table("produtos").upsert(
            batch, on_conflict="codigo_auxiliar"
        ).execute()

    return len(produtos_para_importar)


def exibir_resultado_importacao(
    erp_total: int,
    supabase_existentes: int,
    apos_deduplicacao: int,
    novos_para_importar: int,
    inseridos: int,
) -> None:
    """Exibe o resultado da importação de forma formatada e elegante."""

    print("\n")
    print("  IMPORTAÇÃO DE PRODUTOS")
    print("  " + "─" * 50)
    print()
    print("  Análise:")
    print(f"    • Produtos no ERP ................. {erp_total:>6}")
    print(f"    • Existentes no Supabase .......... {supabase_existentes:>6}")
    print(f"    • Após deduplicação ............... {apos_deduplicacao:>6}")
    print(f"    • Novos para importar ............. {novos_para_importar:>6}")
    print()
    print("  Resultado:")
    print(f"    • Inseridos ....................... {inseridos:>6}")
    print(f"    • Total processado ................ {inseridos:>6}")
    print()

    if inseridos == 0:
        print("  ✓ Base de dados já está atualizada")
    else:
        print("  ✓ Importação concluída com sucesso")
    print("  " + "─" * 50)
    print()


def main() -> None:
    """Função principal que coordena o processo de sincronização."""
    try:
        # Carregar configurações
        print("\n[1/4] Carregando configurações...")
        erp_host, erp_db, erp_user, erp_password, supabase_url, supabase_key = (
            carregar_configuracoes()
        )
        print("Configurações carregadas com sucesso.")

        # Conectar ao ERP e obter produtos
        print("\n[2/4] Conectando ao ERP e obtendo produtos...")
        produtos: List[Tuple[Any, ...]] = obter_produtos_erp(
            erp_host, erp_db, erp_user, erp_password
        )
        print(f"Total de {len(produtos)} produtos encontrados no ERP.")

        # Conectar ao Supabase
        print("\n[3/4] Conectando ao Supabase e verificando produtos existentes...")
        supabase: Client = create_client(supabase_url, supabase_key)
        existing_codes: set[str] = obter_codigos_existentes(supabase)
        print(f"Total de {len(existing_codes)} produtos já existentes no Supabase.")

        # Processar produtos
        print("\n[4/4] Processando e preparando dados...")
        produtos_dicts: List[Dict[str, Any]] = []
        for p in produtos:
            produtos_dicts.append(processar_produto(p))

        # Remove duplicatas por codigo_auxiliar, mantendo a ordem
        produtos_deduplicados = list(
            OrderedDict((d["codigo_auxiliar"], d) for d in produtos_dicts).values()
        )

        # Filtra apenas produtos que não existem no Supabase
        produtos_para_importar = [
            d
            for d in produtos_deduplicados
            if d["codigo_auxiliar"] not in existing_codes
        ]

        # Sincronizar produtos
        inseridos = sincronizar_produtos(supabase, produtos_para_importar)

        # Exibir resultado
        exibir_resultado_importacao(
            erp_total=len(produtos),
            supabase_existentes=len(existing_codes),
            apos_deduplicacao=len(produtos_deduplicados),
            novos_para_importar=len(produtos_para_importar),
            inseridos=inseridos,
        )

    except Exception as e:
        print("\n" + "=" * 60)
        print("ERRO CRÍTICO")
        print("=" * 60)
        print(f"Falha na execução: {str(e)}")
        print("=" * 60)
        raise


if __name__ == "__main__":
    main()
