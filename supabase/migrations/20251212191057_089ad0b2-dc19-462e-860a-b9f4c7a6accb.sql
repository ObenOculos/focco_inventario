-- Corrige ambiguidade de coluna na função comparar_estoque_teorico_vs_real
DROP FUNCTION IF EXISTS comparar_estoque_teorico_vs_real(text);

CREATE OR REPLACE FUNCTION comparar_estoque_teorico_vs_real(p_codigo_vendedor text)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric,
  estoque_real numeric,
  diferenca numeric,
  data_atualizacao_real timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH teorico AS (
    SELECT
      t.codigo_auxiliar as cod_aux,
      t.nome_produto as nome_prod,
      t.estoque_teorico as est_teorico
    FROM calcular_estoque_vendedor(p_codigo_vendedor) t
  ),
  real_stock AS (
    SELECT DISTINCT ON (er.codigo_auxiliar)
      er.codigo_auxiliar as cod_aux,
      er.quantidade_real as qtd_real,
      er.data_atualizacao as dt_atualizacao
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
    ORDER BY er.codigo_auxiliar, er.data_atualizacao DESC
  ),
  todos_produtos AS (
    SELECT t.cod_aux as cod FROM teorico t
    UNION
    SELECT r.cod_aux as cod FROM real_stock r
  )
  SELECT
    tp.cod,
    COALESCE(t.nome_prod, tp.cod),
    COALESCE(t.est_teorico, 0::numeric),
    COALESCE(r.qtd_real, 0::numeric),
    (COALESCE(t.est_teorico, 0) - COALESCE(r.qtd_real, 0))::numeric,
    r.dt_atualizacao
  FROM todos_produtos tp
  LEFT JOIN teorico t ON tp.cod = t.cod_aux
  LEFT JOIN real_stock r ON tp.cod = r.cod_aux
  ORDER BY tp.cod;
END;
$$;