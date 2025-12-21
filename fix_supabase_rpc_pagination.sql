-- =====================================================
-- SOLUÇÃO PARA LIMITE DE 1000 LINHAS EM RPCs DO SUPABASE
-- =====================================================
-- Problema: RPCs via PostgREST têm limite hardcoded de 1000 linhas
-- Solução: Adicionar parâmetros p_limit e p_offset às funções

-- =====================================================
-- 1. CRIAR VERSÃO PAGINADA DE comparar_estoque_teorico_vs_real
-- =====================================================

CREATE OR REPLACE FUNCTION public.comparar_estoque_teorico_vs_real_paginado(
  p_codigo_vendedor text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric,
  estoque_real numeric,
  diferenca numeric,
  data_atualizacao_real timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    -- Usa DISTINCT ON para pegar apenas o registro mais recente de cada produto
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
  ORDER BY tp.cod
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- 2. CRIAR VERSÃO PAGINADA DE calcular_estoque_vendedor
-- =====================================================

CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor_paginado(
  p_codigo_vendedor text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_data_ultimo_inventario timestamp with time zone;
BEGIN
  -- Buscar data do último inventário aprovado
  SELECT i.data_inventario INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.status = 'aprovado'
  ORDER BY i.data_inventario DESC
  LIMIT 1;

  -- Se não há inventário aprovado, usar uma data antiga
  IF v_data_ultimo_inventario IS NULL THEN
    v_data_ultimo_inventario := '1900-01-01'::timestamp with time zone;
  END IF;

  RETURN QUERY
  WITH entradas AS (
    SELECT
      e.codigo_auxiliar,
      SUM(e.quantidade) as qtd_entrada
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) e
    GROUP BY e.codigo_auxiliar
  ),
  saidas AS (
    SELECT
      s.codigo_auxiliar,
      SUM(s.quantidade) as qtd_saida
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL) s
    GROUP BY s.codigo_auxiliar
  ),
  inventario_base AS (
    SELECT
      i.codigo_auxiliar,
      i.quantidade as qtd_inventario,
      p.nome as nome_produto
    FROM inventario i
    LEFT JOIN produtos p ON i.codigo_auxiliar = p.codigo_auxiliar
    WHERE i.inventario_id = (
      SELECT id FROM inventarios
      WHERE status = 'aprovado'
      ORDER BY data_inventario DESC
      LIMIT 1
    )
  ),
  todos_produtos AS (
    SELECT DISTINCT codigo_auxiliar FROM (
      SELECT codigo_auxiliar FROM entradas
      UNION
      SELECT codigo_auxiliar FROM saidas
      UNION
      SELECT codigo_auxiliar FROM inventario_base
    ) t
  )
  SELECT
    tp.codigo_auxiliar,
    COALESCE(ib.nome_produto, tp.codigo_auxiliar),
    COALESCE(ib.qtd_inventario, 0) +
    COALESCE(e.qtd_entrada, 0) -
    COALESCE(s.qtd_saida, 0) as estoque_teorico
  FROM todos_produtos tp
  LEFT JOIN inventario_base ib ON tp.codigo_auxiliar = ib.codigo_auxiliar
  LEFT JOIN entradas e ON tp.codigo_auxiliar = e.codigo_auxiliar
  LEFT JOIN saidas s ON tp.codigo_auxiliar = s.codigo_auxiliar
  ORDER BY tp.codigo_auxiliar
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- 3. CRIAR VERSÃO PAGINADA DE comparar_estoque_inventario
-- =====================================================

CREATE OR REPLACE FUNCTION public.comparar_estoque_inventario_paginado(
  p_inventario_id uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  quantidade_inventario numeric,
  quantidade_contada numeric,
  diferenca numeric,
  foi_contado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.codigo_auxiliar,
    COALESCE(p.nome, i.codigo_auxiliar),
    i.quantidade as quantidade_inventario,
    COALESCE(c.quantidade, 0) as quantidade_contada,
    (i.quantidade - COALESCE(c.quantidade, 0)) as diferenca,
    CASE WHEN c.quantidade IS NOT NULL THEN true ELSE false END as foi_contado
  FROM inventario i
  LEFT JOIN contagem c ON i.id = c.inventario_item_id
  LEFT JOIN produtos p ON i.codigo_auxiliar = p.codigo_auxiliar
  WHERE i.inventario_id = p_inventario_id
  ORDER BY i.codigo_auxiliar
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- 4. CRIAR VERSÃO PAGINADA DE get_entradas_pedidos
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_entradas_pedidos_paginado(
  p_codigo_vendedor text,
  p_data_inicio timestamp with time zone,
  p_data_fim timestamp with time zone DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  quantidade numeric,
  data_pedido timestamp with time zone,
  numero_pedido text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pi.codigo_auxiliar,
    pi.quantidade,
    p.data_pedido,
    p.numero_pedido
  FROM pedidos p
  JOIN pedido_itens pi ON p.id = pi.pedido_id
  WHERE p.tipo = 'entrada'
    AND p.codigo_vendedor = p_codigo_vendedor
    AND p.data_pedido >= p_data_inicio
    AND (p_data_fim IS NULL OR p.data_pedido <= p_data_fim)
  ORDER BY p.data_pedido, p.numero_pedido, pi.codigo_auxiliar
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- 5. CRIAR VERSÃO PAGINADA DE get_saidas_pedidos
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_saidas_pedidos_paginado(
  p_codigo_vendedor text,
  p_data_inicio timestamp with time zone,
  p_data_fim timestamp with time zone DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  quantidade numeric,
  data_pedido timestamp with time zone,
  numero_pedido text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pi.codigo_auxiliar,
    pi.quantidade,
    p.data_pedido,
    p.numero_pedido
  FROM pedidos p
  JOIN pedido_itens pi ON p.id = pi.pedido_id
  WHERE p.tipo = 'saida'
    AND p.codigo_vendedor = p_codigo_vendedor
    AND p.data_pedido >= p_data_inicio
    AND (p_data_fim IS NULL OR p.data_pedido <= p_data_fim)
  ORDER BY p.data_pedido, p.numero_pedido, pi.codigo_auxiliar
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =====================================================
-- INSTRUÇÕES PARA USO NO FRONTEND
-- =====================================================
/*
Para usar as novas funções paginadas no frontend, implemente funções similares ao fetchAllInBatches:

async function fetchComparacaoInBatches(vendorCode: string): Promise<ComparacaoItem[]> {
  const allData: ComparacaoItem[] = [];
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.rpc('comparar_estoque_teorico_vs_real_paginado', {
      p_codigo_vendedor: vendorCode,
      p_limit: batchSize,
      p_offset: offset
    });

    if (error) throw error;
    if (data && data.length > 0) {
      allData.push(...data);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}
*/