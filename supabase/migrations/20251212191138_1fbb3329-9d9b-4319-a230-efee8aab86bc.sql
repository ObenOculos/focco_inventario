-- Corrige ambiguidade de coluna na função calcular_estoque_vendedor
DROP FUNCTION IF EXISTS calcular_estoque_vendedor(text);

CREATE OR REPLACE FUNCTION calcular_estoque_vendedor(p_codigo_vendedor text)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  modelo text,
  cor text,
  quantidade_remessa numeric,
  quantidade_venda numeric,
  estoque_teorico numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  -- Busca data do último inventário aprovado
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado';

  RETURN QUERY
  WITH 
  base_inventario AS (
    SELECT 
      er.codigo_auxiliar as cod,
      er.quantidade_real as base
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
      AND er.data_atualizacao = v_data_ultimo_inventario
  ),
  entradas AS (
    SELECT e.codigo_auxiliar as cod, e.nome_produto as nome, e.quantidade as qtd
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) e
  ),
  saidas AS (
    SELECT s.codigo_auxiliar as cod, s.nome_produto as nome, s.quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) s
  ),
  movimentacoes AS (
    SELECT m.codigo_auxiliar as cod, m.nome_produto as nome, m.saldo
    FROM get_saldo_movimentacoes(p_codigo_vendedor, v_data_ultimo_inventario, NULL) m
  ),
  todos_produtos AS (
    SELECT DISTINCT bi.cod FROM base_inventario bi
    UNION SELECT DISTINCT e.cod FROM entradas e
    UNION SELECT DISTINCT s.cod FROM saidas s
    UNION SELECT DISTINCT mov.cod FROM movimentacoes mov
  ),
  estoque_final AS (
    SELECT
      tp.cod,
      COALESCE(e.nome, s.nome, mov.nome, p.nome_produto, tp.cod) as nome,
      COALESCE(b.base, 0) as base,
      COALESCE(e.qtd, 0) as ent,
      COALESCE(s.qtd, 0) as sai,
      COALESCE(mov.saldo, 0) as mov_saldo
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN movimentacoes mov ON tp.cod = mov.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT
    ef.cod,
    ef.nome,
    SPLIT_PART(ef.cod, ' ', 1),
    COALESCE(NULLIF(SPLIT_PART(ef.cod, ' ', 2), ''), 'N/A'),
    ef.ent,
    ef.sai,
    (ef.base + ef.ent - ef.sai + ef.mov_saldo)::numeric
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;