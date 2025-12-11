-- Função para obter o estoque real de um vendedor
CREATE OR REPLACE FUNCTION public.get_estoque_real_vendedor(p_codigo_vendedor text)
RETURNS TABLE (
  codigo_auxiliar text,
  quantidade_real numeric,
  data_atualizacao timestamptz,
  inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    er.codigo_auxiliar,
    er.quantidade_real,
    er.data_atualizacao,
    er.inventario_id
  FROM public.estoque_real er
  WHERE er.codigo_vendedor = p_codigo_vendedor
  ORDER BY er.data_atualizacao DESC, er.codigo_auxiliar;
END;
$$;

-- Função para comparar estoque teórico vs real
CREATE OR REPLACE FUNCTION public.comparar_estoque_teorico_vs_real(p_codigo_vendedor text)
RETURNS TABLE (
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
      t.codigo_auxiliar,
      t.nome_produto,
      t.estoque_teorico
    FROM public.calcular_estoque_teorico_pos_inventario(p_codigo_vendedor) t
  ),
  real AS (
    SELECT
      er.codigo_auxiliar,
      er.quantidade_real,
      er.data_atualizacao
    FROM public.estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
  ),
  produtos_unificados AS (
    SELECT t.codigo_auxiliar FROM teorico t
    UNION
    SELECT r.codigo_auxiliar FROM real r
  )
  SELECT
    pu.codigo_auxiliar,
    COALESCE(t.nome_produto, pu.codigo_auxiliar) as nome_produto,
    COALESCE(t.estoque_teorico, 0) as estoque_teorico,
    COALESCE(r.quantidade_real, 0) as estoque_real,
    (COALESCE(t.estoque_teorico, 0) - COALESCE(r.quantidade_real, 0)) as diferenca,
    r.data_atualizacao as data_atualizacao_real
  FROM produtos_unificados pu
  LEFT JOIN teorico t ON pu.codigo_auxiliar = t.codigo_auxiliar
  LEFT JOIN real r ON pu.codigo_auxiliar = r.codigo_auxiliar
  ORDER BY pu.codigo_auxiliar;
END;
$$;
