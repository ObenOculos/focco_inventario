"""
Panorama gerencial — agregacoes do Ciclone para a visao do gestor.

POR QUE ESTE MODULO EXISTE, e por que ele nao esta em `db.py`:

`db.py`, `regras.py` e `movimentos.py` sao compartilhados com a ferramenta tkinter
e servem a AUDITORIA — linha a linha, para achar nota emitida com operacao errada.
O Panorama responde outra pergunta ("quanto saiu, de que, para onde") e por isso
precisa do oposto: o `GROUP BY` acontece no Postgres e o que atravessa a VPN sao
centenas de linhas, nao dezenas de milhares. Colocar isso em `db.py` obrigaria a
ferramenta tkinter a carregar consulta que ela nunca usa; deixar no `main.py`
misturaria SQL com transporte HTTP. Mesmo precedente do `SQL_CATALOGO`, que ja
mora no gateway pelo mesmo motivo (e so o app precisa dele).

O que NAO se repete aqui: a CLASSIFICACAO. `classif_operacao` (VENDA, REMESSA,
BONIFICACAO...) continua saindo de `regras.classificar_operacao`, importado. Ela e
funcao pura do CFOP, entao aplica-la DEPOIS do `GROUP BY` da exatamente o mesmo
resultado que aplicar linha a linha — e mantem uma definicao so de "o que e uma
venda" para a tela de auditoria e para a do gestor.

Teto de linhas: quem confere e o `main.py`, com `_conferir_limite`, igual as demais
rotas.
"""

from typing import Any

import pandas as pd

import db
import regras

# Dimensoes de categoria do produto, na hierarquia do Ciclone.
#
# Sao as MESMAS quatro do `SQL_CATALOGO` (marca/tipo/subtipo/grupo) e do
# `categoriasProduto.ts` no app, com os mesmos joins — a tela cruza este resultado
# com o catalogo sincronizado, e um vocabulario diferente dos dois lados produziria
# categorias que nao se encontram.
#
# Lembrete de leitura, porque os nomes do Ciclone enganam: MARCA e a "colecao"
# (OBEN, POWER, CORE EYES); TIPO e o tipo de produto (OCULOS RECEITUARIO, OCULOS
# SOLAR); SUBTIPO e o grupo ESPECIFICO, que na pratica e o publico (MASCULINO,
# FEMININO); GRUPO e o grupo GENERICO, que e o material (ACETATO, METAL).
CATEGORIAS = {
    "marca": "col.eqcol_descricao",
    "tipo": "tpr.eqtpr_descricao",
    "subtipo": "gru.eqgru_descricao",
    "grupo": "grg.eqgrg_descricao",
}

# Categoria ausente vira string VAZIA, nunca NULL.
#
# Duas razoes, e a segunda e a que morde: (1) NULL e '' seriam dois grupos com o
# mesmo sentido, como ja se resolveu no `/produtos`; (2) `= ANY(array)` NUNCA casa
# com NULL, entao um recorte por categoria simplesmente perderia essas linhas em
# silencio ao descer para o nivel de produto. Com '' os dois lados usam a mesma
# expressao, e o app traduz para "Sem categoria" com a definicao que ja tem.
def _categoria(coluna: str) -> str:
    return f"COALESCE(NULLIF(TRIM({coluna}), ''), '')"


# Blocos de JOIN compartilhados pelos dois niveis.
#
# Sao os mesmos de `SQL_PEDIDOS` mais os tres joins de categoria que o catalogo usa.
# Todos LEFT pelo motivo ja registrado no `SQL_CATALOGO`: um INNER faria um produto
# sem colecao cadastrada SUMIR do total, e um total que esconde linha e pior que um
# total com uma categoria vazia.
#
# Sem sinal de porcentagem nos comentarios DESTE SQL (psycopg2 interpola antes de
# enviar) e so ASCII/Latin-1 (a conexao com o Ciclone e WIN1252).
_SQL_FROM = """
FROM vd_notafiscalsaida n
JOIN vd_notafiscalsaidaproduto prod
      ON  n.pgemp_codigo = prod.pgemp_codigo
      AND n.pgfll_codigo = prod.pgfll_codigo
      AND n.vdnfs_sequencianotafiscal = prod.vdnfs_sequencianotafiscal
LEFT JOIN vd_pedidovenda p
      ON  n.pgemp_codigo = p.pgemp_codigo
      AND n.pgfll_codigo = p.pgfll_codigo
      AND n.vdpdv_codigo = p.vdpdv_codigo
LEFT JOIN eq_produtogenerico gen
      ON  gen.pgemp_codigo = n.pgemp_codigo
      AND gen.eqpdg_codigo = prod.eqpdg_codigo
LEFT JOIN eq_colecao         col ON col.eqcol_codigo = gen.eqcol_codigo
LEFT JOIN eq_tipoproduto     tpr ON tpr.eqtpr_codigo = gen.eqtpr_codigo
LEFT JOIN eq_grupoespecifico gru ON gru.eqgru_codigo = gen.eqgru_codigo
LEFT JOIN eq_grupogenerico   grg ON grg.eqgrg_codigo = gru.eqgrg_codigo
LEFT JOIN pg_operacaofiscal  opr ON opr.pgopr_codigo = n.pgopr_codigo
LEFT JOIN pg_naturezaoperacao nat ON nat.pgnat_codigo = prod.pgnat_codigo
LEFT JOIN vd_tipopedidovendaorcamento tp
      ON  tp.vdtpo_codigo = p.vdtpo_codigo
      AND tp.pgemp_codigo = p.pgemp_codigo
      AND tp.pgfll_codigo = p.pgfll_codigo
"""

# Dimensoes que descrevem O QUE a saida foi. Vao nos dois niveis: e por elas que a
# tela monta "tipo de saida", e o CFOP e o insumo da classificacao de `regras.py`.
_DIMENSOES_SAIDA = """
    p.vdtpo_codigo                        AS tipo_pedido_cod,
    tp.vdtpo_descricao                    AS tipo_pedido_desc,
    n.pgopr_codigo                        AS operacao_cod,
    opr.pgopr_descricao                   AS operacao_desc,
    prod.pgnat_codigo                     AS cfop,
    nat.pgnat_descricao                   AS cfop_desc
"""

# Codigo auxiliar da grade, so no nivel de produto: e um subselect correlacionado e
# nao vale pagar por ele quando a resposta e por categoria. Mesma derivacao do
# `SQL_PEDIDOS` — cai para "produto cor" quando o Ciclone nao registrou a referencia.
#
# O TRIM externo e por causa da ENTRADA: la ha item sem cor (os codigos genericos de
# faturamento, tipo 'ESTOJO PW'), e `CONCAT` trata NULL como vazio — sem o TRIM a
# chave sairia com um espaco no fim e o mesmo produto viraria dois grupos.
_SQL_CODIGO_AUXILIAR = """
    TRIM(COALESCE(
        (SELECT est.eqpee_referenciaauxiliargrade
         FROM eq_produtoespecificoestoque est
         WHERE est.eqpdg_codigo = prod.eqpdg_codigo
           AND est.eqpee_cor    = prod.eqcor_codigo
           AND est.pgemp_codigo = n.pgemp_codigo
         LIMIT 1),
        CONCAT(prod.eqpdg_codigo, ' ', prod.eqcor_codigo)
    ))
"""

# As duas medidas, sempre juntas e sempre separadas.
#
# `linhas` viaja junto de proposito: e o unico jeito de a tela dizer "este numero
# saiu de 3 notas" sem uma segunda consulta, e e o que denuncia um agregado inflado
# por join errado.
_MEDIDAS = """
    SUM(COALESCE(prod.vdnfp_quantidade, 0))        AS quantidade,
    SUM(COALESCE(prod.vdnfp_valorliquidoreal, 0))  AS valor,
    COUNT(*)                                       AS linhas
"""


def _where(
    filtros: dict[str, Any],
    col_data: str,
    incluir_canceladas: bool,
) -> tuple[list[str], dict[str, Any]]:
    """Monta o WHERE e os parametros. Tudo por `= ANY(array)`, nunca por concatenacao."""
    condicoes = [
        "n.pgemp_codigo = ANY(%(empresas)s)",
        f"{col_data} BETWEEN %(data_inicio)s AND %(data_fim)s",
    ]
    params = {
        "empresas": list(filtros["empresas"]),
        "data_inicio": str(filtros["data_inicio"]),
        "data_fim": str(filtros["data_fim"]),
    }

    # Nota cancelada fica FORA por padrao. Ela ja foi anulada: mante-la infla
    # quantidade e valor com documento que nao existe mais, e o total do Panorama
    # e justamente o numero que o gestor confere contra o ERP. Mesmo padrao do
    # refino da Consulta ao ERP, que nasce com "ocultar canceladas" ligado.
    if not incluir_canceladas:
        condicoes.append("COALESCE(n.vdnfs_situacao, '') <> 'C'")

    # Recorte por categoria. A chave e PLURAL (`marcas`, `tipos`...) porque carrega
    # uma lista; o singular do dicionario `CATEGORIAS` nomeia a COLUNA.
    for nome, coluna in CATEGORIAS.items():
        chave = f"{nome}s"
        valores = filtros.get(chave)
        if valores:
            condicoes.append(f"{_categoria(coluna)} = ANY(%({chave})s)")
            params[chave] = [str(v) for v in valores]

    for chave, coluna in (
        ("tipos_pedido", "p.vdtpo_codigo"),
        ("operacoes", "n.pgopr_codigo"),
    ):
        valores = filtros.get(chave)
        if valores:
            condicoes.append(f"{coluna} = ANY(%({chave})s)")
            params[chave] = [int(v) for v in valores]

    # CFOP compara como TEXTO. O tipo de `pgnat_codigo` nao e o mesmo em todo lugar
    # do Ciclone (o proprio relatorio de entrada o concatena com `||`), e um
    # `= ANY(integer[])` contra coluna textual estoura o operador em vez de nao casar
    # — falha barulhenta numa consulta que so deveria filtrar. O cliente devolve o
    # valor que ESTE modulo emitiu, entao os dois lados falam a mesma string.
    if filtros.get("cfops"):
        condicoes.append("CAST(prod.pgnat_codigo AS TEXT) = ANY(%(cfops)s)")
        params["cfops"] = [str(c).strip() for c in filtros["cfops"]]

    return condicoes, params


def _consultar(sql: str, params: dict[str, Any]) -> pd.DataFrame:
    conn = db.conectar()
    try:
        return pd.read_sql_query(sql, conn, params=params)
    finally:
        conn.close()


def _classificar(df: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta as classificacoes de `regras.py` ao AGREGADO.

    Aplicar depois do GROUP BY e equivalente a aplicar linha a linha porque as duas
    funcoes sao puras: `classificar_operacao` so olha o CFOP e `classificar_pedido`
    so olha o tipo de pedido — ambos fazem parte da chave do agrupamento, entao toda
    linha somada num grupo teria recebido o mesmo rotulo.
    """
    if df.empty:
        df["classif_operacao"] = pd.Series(dtype="object")
        df["classif_pedido"] = pd.Series(dtype="object")
        return df

    df = df.copy()
    df["classif_operacao"] = df["cfop"].apply(regras.classificar_operacao)
    df["classif_pedido"] = df["tipo_pedido_cod"].apply(regras.classificar_pedido)
    for col in ("quantidade", "valor"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def saidas_por_categoria(
    data_inicio,
    data_fim,
    empresas=None,
    base_data="movimento",
    incluir_canceladas=False,
    **recortes,
) -> pd.DataFrame:
    """Uma linha por mes x empresa x categoria x tipo de saida.

    E o grao de ENTRADA do modulo: a tela recebe isto uma vez e faz todo o
    drill-down, o filtro e a serie temporal no cliente, sem voltar ao ERP. O mes
    entra na chave porque "quanto saiu em cada mes" e pergunta de primeira ordem e
    calcula-la depois exigiria trazer a data crua de volta.

    Nenhum tipo de produto e excluido aqui, e isso e deliberado: o `TIPO` e uma das
    dimensoes devolvidas, entao acessorio e expositor aparecem com nome proprio e o
    gestor decide se olha. A allowlist de oculos do `/produtos` existe para o
    CATALOGO do app, onde um cadastro novo entrando sozinho seria um problema; aqui
    esconder linha faria o total nao fechar com o ERP, que e pior.
    """
    if empresas is None:
        empresas = db.EMPRESAS_PADRAO
    col_data = db.COLUNAS_DATA.get(base_data, db.COLUNAS_DATA["movimento"])

    filtros = {"empresas": empresas, "data_inicio": data_inicio, "data_fim": data_fim}
    filtros.update(recortes)
    condicoes, params = _where(filtros, col_data, incluir_canceladas)

    categorias = ",\n".join(
        f"    {_categoria(coluna)} AS {nome}" for nome, coluna in CATEGORIAS.items()
    )
    # `date_trunc` sobre a MESMA coluna que delimita o periodo: com `base_data`
    # em 'emissao', o mes precisa ser o da emissao, senao a serie temporal usaria
    # uma data e o filtro outra, e as barras nao somariam o total da tela.
    sql = f"""
SELECT
    date_trunc('month', {col_data})::date AS mes,
    n.pgemp_codigo                        AS empresa,
{categorias},
    {_DIMENSOES_SAIDA.strip()},
{_MEDIDAS.strip()}
{_SQL_FROM.strip()}
WHERE {" AND ".join(condicoes)}
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
ORDER BY mes, marca, tipo_pedido_cod
"""
    return _classificar(_consultar(sql, params))


def saidas_por_produto(
    data_inicio,
    data_fim,
    empresas=None,
    base_data="movimento",
    incluir_canceladas=False,
    **recortes,
) -> pd.DataFrame:
    """A folha do drill-down: uma linha por produto x empresa x tipo de saida.

    Chamada so quando o gestor abre uma categoria, e com o recorte dela nos
    parametros. Sem o mes na chave — no fim do caminho a pergunta e "quais
    produtos", nao "em que mes".

    A EMPRESA precisa estar na chave, e nao e escolha estetica: o subselect que
    deriva o codigo auxiliar se correlaciona por `n.pgemp_codigo`, entao sem a
    empresa agrupada o Postgres recusa a consulta inteira ("must appear in the
    GROUP BY clause"). Deixa-la de fora exigiria descorrelacionar o subselect, o
    que faria o codigo auxiliar de uma empresa vazar para a outra. Somar as duas
    empresas, quando for o caso, e trabalho do cliente.
    """
    if empresas is None:
        empresas = db.EMPRESAS_PADRAO
    col_data = db.COLUNAS_DATA.get(base_data, db.COLUNAS_DATA["movimento"])

    filtros = {"empresas": empresas, "data_inicio": data_inicio, "data_fim": data_fim}
    filtros.update(recortes)
    condicoes, params = _where(filtros, col_data, incluir_canceladas)

    categorias = ",\n".join(
        f"    {_categoria(coluna)} AS {nome}" for nome, coluna in CATEGORIAS.items()
    )
    # `nome_produto` sai por MIN de proposito: e o nome COMO FOI ESCRITO NA NOTA, e a
    # mesma grade pode ter sido faturada com grafias diferentes ao longo do periodo.
    # Agrupar por ele quebraria o produto em varias linhas por causa de um espaco.
    sql = f"""
SELECT
    {_SQL_CODIGO_AUXILIAR.strip()} AS codigo_auxiliar,
    n.pgemp_codigo                        AS empresa,
    prod.eqpdg_codigo                     AS codigo_produto,
    prod.eqcor_codigo                     AS cor,
    MIN(prod.vdnfp_nomeproduto)           AS nome_produto,
{categorias},
    {_DIMENSOES_SAIDA.strip()},
{_MEDIDAS.strip()}
{_SQL_FROM.strip()}
WHERE {" AND ".join(condicoes)}
GROUP BY 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
ORDER BY quantidade DESC
"""
    return _classificar(_consultar(sql, params))


# ===========================================================================
# ENTRADAS — o que a Focco Brasil recebeu
# ===========================================================================
#
# Fonte: `eq_notafiscalentrada` + `eq_notafiscalentradaproduto`, as tabelas do
# relatorio 6001 do proprio Ciclone ("Documento Fiscal de Entrada c/ Produto").
# Nada disso e alcancado pelo `/pedidos`, que so le nota de SAIDA.

# Naturezas de entrada, pelos 3 ultimos digitos do CFOP.
#
# POR QUE ISTO NAO USA `regras.classificar_operacao`: aquele mapa e de CFOP de
# SAIDA (5xxx/6xxx) e daria a resposta ERRADA aqui com cara de certa. O sufixo 102
# la significa VENDA; numa nota de entrada, 2102 e COMPRA. O 904 la e REMESSA;
# aqui e o RETORNO da remessa — mercadoria voltando, sinal oposto. Reaproveitar
# aquele dicionario rotularia compra como venda em silencio.
#
# Os rotulos sao os do proprio Ciclone, so encurtados: o que se colapsa e a
# distincao dentro/fora do estado (1904 e 2904 sao a mesma coisa em UFs
# diferentes), que nao e pergunta gerencial. O CFOP completo e a descricao original
# viajam junto para quem quiser conferir.
CFOP_NATUREZA_ENTRADA = {
    "102": "COMPRA",
    "101": "COMPRA",
    "401": "COMPRA",
    "403": "COMPRA",
    "409": "COMPRA",
    "415": "COMPRA",
    "551": "COMPRA ATIVO IMOBILIZADO",
    "556": "COMPRA USO E CONSUMO",
    "904": "RETORNO DE REMESSA",
    "902": "RETORNO DE REMESSA",
    "903": "RETORNO DE REMESSA",
    "202": "DEVOLUCAO DE VENDA",
    "201": "DEVOLUCAO DE VENDA",
    "410": "DEVOLUCAO DE VENDA",
    "411": "DEVOLUCAO DE VENDA",
    "912": "DEMONSTRACAO",
    "913": "RETORNO DE DEMONSTRACAO",
    "917": "CONSIGNACAO",
    "910": "BONIFICACAO/BRINDE",
    "911": "AMOSTRA GRATIS",
    "949": "ACERTO DE ESTOQUE",
}


def classificar_entrada(cfop) -> str:
    """Natureza da entrada a partir do CFOP. Desconhecido ganha rotulo proprio."""
    if cfop is None or (isinstance(cfop, float) and pd.isna(cfop)):
        return "SEM CFOP"
    s = str(int(cfop)) if not isinstance(cfop, str) else cfop.strip()
    natureza = s[-3:] if len(s) >= 3 else s
    return CFOP_NATUREZA_ENTRADA.get(natureza, f"OUTRA ENTRADA ({s})")


# Colunas que delimitam o periodo. Proprias, e nao as de `db.COLUNAS_DATA`: aquelas
# apontam para a nota de saida e para a emissao do PEDIDO, que nao existem aqui.
COLUNAS_DATA_ENTRADA = {
    "movimento": "n.eqnfe_datamovimento",
    "emissao": "n.eqnfe_dataemissao",
}

# A nota de entrada e VERSIONADA POR CANCELAMENTO: o Ciclone guarda as versoes
# anteriores na mesma tabela, e sem ficar so com a ultima a mesma nota aparece
# varias vezes e TODO total infla. Esta clausula e do proprio relatorio 6001 — nao e
# invencao nossa, e nao e opcional.
_SQL_ULTIMA_VERSAO = """
    n.eqnfe_sequenciacancelamento = (
        SELECT MAX(t2.eqnfe_sequenciacancelamento)
        FROM eq_notafiscalentrada t2
        WHERE t2.pgemp_codigo           = n.pgemp_codigo
          AND t2.pgfll_codigo           = n.pgfll_codigo
          AND t2.pgopr_codigo           = n.pgopr_codigo
          AND t2.pgfor_codigo           = n.pgfor_codigo
          AND t2.eqnfe_numeronotafiscal = n.eqnfe_numeronotafiscal
          AND t2.eqnfe_serienotafiscal  = n.eqnfe_serienotafiscal)
"""

_SQL_FROM_ENTRADA = """
FROM eq_notafiscalentrada n
JOIN eq_notafiscalentradaproduto prod
      ON  n.pgemp_codigo = prod.pgemp_codigo
      AND n.pgfll_codigo = prod.pgfll_codigo
      AND n.eqnfe_sequencianotafiscal = prod.eqnfe_sequencianotafiscal
LEFT JOIN eq_produtogenerico gen
      ON  gen.pgemp_codigo = n.pgemp_codigo
      AND gen.eqpdg_codigo = prod.eqpdg_codigo
LEFT JOIN eq_colecao         col ON col.eqcol_codigo = gen.eqcol_codigo
LEFT JOIN eq_tipoproduto     tpr ON tpr.eqtpr_codigo = gen.eqtpr_codigo
LEFT JOIN eq_grupoespecifico gru ON gru.eqgru_codigo = gen.eqgru_codigo
LEFT JOIN eq_grupogenerico   grg ON grg.eqgrg_codigo = gru.eqgrg_codigo
LEFT JOIN pg_operacaofiscal  opr ON opr.pgopr_codigo = n.pgopr_codigo
LEFT JOIN pg_naturezaoperacao nat ON nat.pgnat_codigo = prod.pgnat_codigo
LEFT JOIN pg_view_relacionaclnforfun forn ON forn.pgview_codigo = n.pgfor_codigo
"""

# Quem mandou, e sob que natureza.
#
# "FORNECEDOR" AQUI NAO E SO FORNECEDOR. Em RETORNO DE REMESSA o remetente e o
# proprio REPRESENTANTE devolvendo o que sobrou da mala — medido em 2026: dos 13
# remetentes do ano, cinco sao vendedores. Quem separa os dois casos e a
# CLASSIFICACAO, nunca o nome; por isso as duas viajam juntas e a tela abre por
# classificacao antes de fornecedor.
_DIMENSOES_ENTRADA = """
    n.pgfor_codigo                        AS fornecedor_cod,
    COALESCE(NULLIF(TRIM(forn.pgview_nome), ''), '')   AS fornecedor,
    COALESCE(NULLIF(TRIM(forn.pgview_estado), ''), '') AS uf,
    n.pgopr_codigo                        AS operacao_cod,
    opr.pgopr_descricao                   AS operacao_desc,
    prod.pgnat_codigo                     AS cfop,
    nat.pgnat_descricao                   AS cfop_desc
"""

_MEDIDAS_ENTRADA = """
    SUM(COALESCE(prod.eqnfp_quantidade, 0))        AS quantidade,
    SUM(COALESCE(prod.eqnfp_valorliquidoreal, 0))  AS valor,
    COUNT(*)                                       AS linhas
"""


def _where_entrada(
    filtros: dict[str, Any],
    col_data: str,
    incluir_canceladas: bool,
    incluir_sem_movimento: bool,
) -> tuple[list[str], dict[str, Any]]:
    condicoes = [
        "n.pgemp_codigo = ANY(%(empresas)s)",
        f"{col_data} BETWEEN %(data_inicio)s AND %(data_fim)s",
        _SQL_ULTIMA_VERSAO.strip(),
    ]
    params: dict[str, Any] = {
        "empresas": list(filtros["empresas"]),
        "data_inicio": str(filtros["data_inicio"]),
        "data_fim": str(filtros["data_fim"]),
    }

    if not incluir_canceladas:
        condicoes.append("COALESCE(n.eqnfe_situacao, '') <> 'C'")

    # ESTE FILTRO E O QUE IMPEDE A COMPRA DE CONTAR EM DOBRO, e por isso vem ligado.
    # Medido em 2026-08-24, fornecedor INDCASE, jun a ago: toda compra entra como
    # DUAS notas com o MESMO numero e series diferentes —
    #   serie 0, operacao 21021, movimenta='N': codigo generico ('ARM DE OCULOS
    #            ACET', 'ESTOJO PW'), valor baixo (R$ 381,60);
    #   serie 1, operacao 21022, movimenta='S': o SKU de verdade, valor cheio
    #            (R$ 6.263,59), e e esta que entra no estoque.
    # As quantidades sao praticamente iguais nas duas, entao somar ambas dobra as
    # unidades e mistura duas bases de valor. Onze notas conferidas, onze com o par.
    #
    # O teste e CONTRA 'N', e nao a favor de 'S', porque o campo nao e um sim/nao: o
    # retorno de remessa usa 'E' e 'A', e a demonstracao usa 'D'. Exigir 'S' apagaria
    # o retorno inteiro — que e justamente a mercadoria voltando da mala.
    if not incluir_sem_movimento:
        condicoes.append("COALESCE(prod.eqnfp_movimentaestoque, '') <> 'N'")

    for nome, coluna in CATEGORIAS.items():
        chave = f"{nome}s"
        valores = filtros.get(chave)
        if valores:
            condicoes.append(f"{_categoria(coluna)} = ANY(%({chave})s)")
            params[chave] = [str(v) for v in valores]

    for chave, coluna in (
        ("fornecedores", "n.pgfor_codigo"),
        ("operacoes", "n.pgopr_codigo"),
    ):
        valores = filtros.get(chave)
        if valores:
            condicoes.append(f"{coluna} = ANY(%({chave})s)")
            params[chave] = [int(v) for v in valores]

    if filtros.get("cfops"):
        condicoes.append("CAST(prod.pgnat_codigo AS TEXT) = ANY(%(cfops)s)")
        params["cfops"] = [str(c).strip() for c in filtros["cfops"]]

    return condicoes, params


def _classificar_entrada(df: pd.DataFrame) -> pd.DataFrame:
    """Mesma equivalencia do `_classificar`: `classificar_entrada` e pura e o CFOP
    esta na chave do agrupamento, entao aplica-la ao agregado da o mesmo resultado."""
    if df.empty:
        df["classif_entrada"] = pd.Series(dtype="object")
        return df
    df = df.copy()
    df["classif_entrada"] = df["cfop"].apply(classificar_entrada)
    for col in ("quantidade", "valor"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def entradas_por_categoria(
    data_inicio,
    data_fim,
    empresas=None,
    base_data="movimento",
    incluir_canceladas=False,
    incluir_sem_movimento=False,
    **recortes,
) -> pd.DataFrame:
    """Uma linha por mes x empresa x categoria x fornecedor x natureza da entrada.

    O espelho do `saidas_por_categoria`, e de proposito com a mesma forma: as duas
    lentes do Panorama compartilham medida, categoria e drill-down, e so mudam de
    eixo proprio (tipo de saida la, fornecedor aqui).

    Fornecedor cabe na chave porque sao poucos — 13 em oito meses de 2026. Se um dia
    passarem de algumas centenas, ele sai daqui e vira nivel pedido sob demanda,
    como o produto.
    """
    if empresas is None:
        empresas = db.EMPRESAS_PADRAO
    col_data = COLUNAS_DATA_ENTRADA.get(base_data, COLUNAS_DATA_ENTRADA["movimento"])

    filtros = {"empresas": empresas, "data_inicio": data_inicio, "data_fim": data_fim}
    filtros.update(recortes)
    condicoes, params = _where_entrada(
        filtros, col_data, incluir_canceladas, incluir_sem_movimento
    )

    categorias = ",\n".join(
        f"    {_categoria(coluna)} AS {nome}" for nome, coluna in CATEGORIAS.items()
    )
    sql = f"""
SELECT
    date_trunc('month', {col_data})::date AS mes,
    n.pgemp_codigo                        AS empresa,
{categorias},
    {_DIMENSOES_ENTRADA.strip()},
    {_MEDIDAS_ENTRADA.strip()}
{_SQL_FROM_ENTRADA.strip()}
WHERE {" AND ".join(condicoes)}
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
ORDER BY mes, fornecedor
"""
    return _classificar_entrada(_consultar(sql, params))


def entradas_por_produto(
    data_inicio,
    data_fim,
    empresas=None,
    base_data="movimento",
    incluir_canceladas=False,
    incluir_sem_movimento=False,
    **recortes,
) -> pd.DataFrame:
    """A folha da lente de entradas: produto x empresa x fornecedor x natureza.

    `nome_produto` sai por MIN pelo mesmo motivo da saida: e o nome COMO FOI ESCRITO
    NA NOTA, e agrupar por ele partiria o produto por causa de uma grafia.
    """
    if empresas is None:
        empresas = db.EMPRESAS_PADRAO
    col_data = COLUNAS_DATA_ENTRADA.get(base_data, COLUNAS_DATA_ENTRADA["movimento"])

    filtros = {"empresas": empresas, "data_inicio": data_inicio, "data_fim": data_fim}
    filtros.update(recortes)
    condicoes, params = _where_entrada(
        filtros, col_data, incluir_canceladas, incluir_sem_movimento
    )

    categorias = ",\n".join(
        f"    {_categoria(coluna)} AS {nome}" for nome, coluna in CATEGORIAS.items()
    )
    sql = f"""
SELECT
    {_SQL_CODIGO_AUXILIAR.strip()} AS codigo_auxiliar,
    n.pgemp_codigo                        AS empresa,
    prod.eqpdg_codigo                     AS codigo_produto,
    COALESCE(prod.eqcor_codigo, '')       AS cor,
    MIN(prod.eqnfp_nomeproduto)           AS nome_produto,
{categorias},
    {_DIMENSOES_ENTRADA.strip()},
    {_MEDIDAS_ENTRADA.strip()}
{_SQL_FROM_ENTRADA.strip()}
WHERE {" AND ".join(condicoes)}
GROUP BY 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
ORDER BY quantidade DESC
"""
    return _classificar_entrada(_consultar(sql, params))
