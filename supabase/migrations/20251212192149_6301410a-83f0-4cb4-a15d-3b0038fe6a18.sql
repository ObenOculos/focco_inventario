-- Atualiza função para mostrar TODOS os itens com divergência
-- Inclui itens não contados (quantidade física = 0) que têm estoque teórico

DROP FUNCTION IF EXISTS comparar_estoque_inventario(uuid);

CREATE OR REPLACE FUNCTION comparar_estoque_inventario(p_inventario_id uuid)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric,
  quantidade_fisica numeric,
  divergencia numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo_vendedor text;
  v_data_inventario timestamptz;
BEGIN
  -- Obtém dados do inventário
  SELECT inv.codigo_vendedor, inv.data_inventario 
  INTO v_codigo_vendedor, v_data_inventario
  FROM inventarios inv
  WHERE inv.id = p_inventario_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH 
  contagem AS (
    SELECT
      ii.codigo_auxiliar as cod,
      MAX(COALESCE(ii.nome_produto, p.nome_produto, ii.codigo_auxiliar)) as nome,
      SUM(ii.quantidade_fisica) as fisica
    FROM itens_inventario ii
    LEFT JOIN produtos p ON ii.codigo_auxiliar = p.codigo_auxiliar
    WHERE ii.inventario_id = p_inventario_id
    GROUP BY ii.codigo_auxiliar
  ),
  teorico AS (
    SELECT t.codigo_auxiliar as cod, t.nome_produto as nome, t.estoque_teorico as teorico
    FROM calcular_estoque_vendedor_ate_data(v_codigo_vendedor, v_data_inventario) t
  ),
  todos_produtos AS (
    -- União de todos os produtos: contados + teóricos
    SELECT c.cod FROM contagem c
    UNION
    SELECT t.cod FROM teorico t
  )
  SELECT
    tp.cod,
    COALESCE(c.nome, t.nome, tp.cod) as nome,
    COALESCE(t.teorico, 0::numeric) as est_teorico,
    COALESCE(c.fisica, 0::numeric) as qtd_fisica,
    (COALESCE(c.fisica, 0) - COALESCE(t.teorico, 0))::numeric as div
  FROM todos_produtos tp
  LEFT JOIN contagem c ON tp.cod = c.cod
  LEFT JOIN teorico t ON tp.cod = t.cod
  ORDER BY tp.cod;
END;
$$;