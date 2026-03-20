-- ============================================================================
-- SQL RECONSTRUÍDO DO ZERO - RELATÓRIO 3008
-- Listagem de Baixas de Títulos a Receber x Formas de Pagamento
-- ============================================================================

SELECT
    TO_CHAR(fncrb.fncrb_databaixa, 'DD/MM/YYYY') AS "DATA DA BAIXA",
    fncrb.fncrb_numerobaixa AS "NÚMERO DA BAIXA",
    fncrt.fncrt_numerotitulo AS "TÍTULO",
    fncrt.fncrt_parcela AS "PARCELA",
    pgcln.pgcln_codigo AS "CÓDIGO CLIENTE",
    pgcln.pgcln_nomefantasia AS "CLIENTE",
    TO_CHAR(fncrt.fncrt_datavencimento, 'DD/MM/YYYY') AS "DATAVENC.",
    fncrt.fncrt_valor::NUMERIC(12,2) AS "VALORTÍTULO",
    fncrt.fncrt_saldo::NUMERIC(12,2) AS "VALORSALDO",
    
    -- Valores consolidados por título/baixa para evitar duplicidade de componentes
    COALESCE(fntbd.fntbd_valorjuro, 0)::NUMERIC(12,2) AS "VALOR JURO",
    COALESCE(fntbd.fntbd_valormulta, 0)::NUMERIC(12,2) AS "VALORMULTA",
    COALESCE(fntbd.fntbd_valordesconto, 0)::NUMERIC(12,2) AS "VALORDESC.",
    COALESCE(fntbd.fntbd_valorbaixa, 0)::NUMERIC(12,2) AS "VALOR BAIXA",
    
    -- Subconsulta correlacionada para as formas de pagamento
    -- Isso garante que a linha do título não seja multiplicada pelas formas
    (
        SELECT STRING_AGG(DISTINCT f.fnfpt_descricao, ' / ')
        FROM fn_crbaixaformapagamento bfp
        INNER JOIN fn_formapagamento f ON bfp.fnfpt_codigo = f.fnfpt_codigo
        WHERE bfp.fncrb_numerobaixa = fncrb.fncrb_numerobaixa
          AND f.fnfpt_codigo NOT IN (100, 14)
    ) AS "FORMA DE PAGAMENTO"

FROM fn_crbaixa fncrb
INNER JOIN fn_crtitulobaixado fntbd ON fncrb.fncrb_numerobaixa = fntbd.fncrb_numerobaixa
INNER JOIN fn_crtitulo fncrt ON fntbd.fncrt_sequenciatitulo = fncrt.fncrt_sequenciatitulo
INNER JOIN pg_cliente pgcln ON fncrt.pgcln_codigo = pgcln.pgcln_codigo

WHERE 
    -- Filtro de Filial: 1
    fncrb.pgfll_codigo = 1
    
    -- Filtro de Datas da Baixa
    AND fncrb.fncrb_databaixa >= '2025-01-01'::DATE
    AND fncrb.fncrb_databaixa <= '2025-01-02'::DATE
    
    -- Filtro de Tipo: Apenas Títulos a Receber
    AND fncrt.fntti_codigo = 1
    
    -- Garante que a baixa tenha alguma forma de pagamento válida (não 100 nem 14)
    AND EXISTS (
        SELECT 1 
        FROM fn_crbaixaformapagamento bfp2 
        WHERE bfp2.fncrb_numerobaixa = fncrb.fncrb_numerobaixa 
          AND bfp2.fnfpt_codigo NOT IN (100, 14)
    )

GROUP BY 
    fncrb.fncrb_databaixa,
    fncrb.fncrb_numerobaixa,
    fncrt.fncrt_numerotitulo,
    fncrt.fncrt_parcela,
    pgcln.pgcln_codigo,
    pgcln.pgcln_nomefantasia,
    fncrt.fncrt_datavencimento,
    fncrt.fncrt_valor,
    fncrt.fncrt_saldo,
    fntbd.fntbd_valorjuro,
    fntbd.fntbd_valormulta,
    fntbd.fntbd_valordesconto,
    fntbd.fntbd_valorbaixa

ORDER BY 
    fncrb.fncrb_databaixa ASC,
    fncrt.fncrt_numerotitulo,
    fncrt.fncrt_parcela;