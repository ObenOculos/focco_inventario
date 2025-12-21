-- Corrige ambiguidade de coluna na função calcular_estoque_vendedor_ate_data
DROP FUNCTION IF EXISTS calcular_estoque_vendedor_ate_data(text, timestamptz);

CREATE OR REPLACE FUNCTION calcular_estoque_vendedor_ate_data(p_codigo_vendedor text, p_data_limite timestamptz)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  -- Busca o último inventário ANTES da data limite
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado'
    AND i.data_inventario <= p_data_limite;

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
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite) e
  ),
  saidas AS (
    SELECT s.codigo_auxiliar as cod, s.nome_produto as nome, s.quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite) s
  ),
  movimentacoes AS (
    SELECT m.codigo_auxiliar as cod, m.nome_produto as nome, m.saldo
    FROM get_saldo_movimentacoes(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite) m
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
      COALESCE(b.base, 0) + COALESCE(e.qtd, 0) - COALESCE(s.qtd, 0) + COALESCE(mov.saldo, 0) as estoque
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN movimentacoes mov ON tp.cod = mov.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT ef.cod, ef.nome, ef.estoque
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;