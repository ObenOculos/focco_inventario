-- Dropar a função existente e recriar com campos completos
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor_paginado(text, integer, integer);

CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor_paginado(
  p_codigo_vendedor text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  -- Busca a data do último inventário aprovado
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado';

  RETURN QUERY
  WITH 
  base_inventario AS (
    SELECT DISTINCT ON (er.codigo_auxiliar)
      er.codigo_auxiliar as cod, 
      er.quantidade_real as base
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
      AND er.data_atualizacao = v_data_ultimo_inventario
    ORDER BY er.codigo_auxiliar
  ),
  entradas AS (
    SELECT e.codigo_auxiliar as cod, e.nome_produto as nome, e.quantidade as qtd
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) e
  ),
  saidas AS (
    SELECT s.codigo_auxiliar as cod, s.nome_produto as nome, s.quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) s
  ),
  todos_produtos AS (
    SELECT DISTINCT bi.cod FROM base_inventario bi
    UNION SELECT DISTINCT e.cod FROM entradas e
    UNION SELECT DISTINCT s.cod FROM saidas s
  ),
  estoque_final AS (
    SELECT
      tp.cod,
      COALESCE(e.nome, s.nome, p.nome_produto, tp.cod) as nome,
      COALESCE(b.base, 0) as base,
      COALESCE(e.qtd, 0) as ent,
      COALESCE(s.qtd, 0) as sai
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT
    ef.cod,
    ef.nome,
    SPLIT_PART(ef.cod, ' ', 1),
    COALESCE(NULLIF(SPLIT_PART(ef.cod, ' ', 2), ''), 'N/A'),
    ef.ent,
    ef.sai,
    (ef.base + ef.ent - ef.sai)::numeric
  FROM estoque_final ef
  ORDER BY ef.cod
  LIMIT p_limit OFFSET p_offset;
END;
$function$;