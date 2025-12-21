-- ========================================
-- NOVA LÓGICA DE ESTOQUE - VERSÃO SIMPLIFICADA
-- ========================================

-- 1. Função auxiliar: Calcula entradas de pedidos (remessas)
CREATE OR REPLACE FUNCTION public.get_entradas_pedidos(
  p_codigo_vendedor text,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS TABLE (codigo_auxiliar text, nome_produto text, quantidade numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ip.codigo_auxiliar,
    MAX(ip.nome_produto) as nome_produto,
    SUM(ip.quantidade) as quantidade
  FROM itens_pedido ip
  INNER JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.codigo_vendedor = p_codigo_vendedor
    AND p.codigo_tipo IN (7, 99) -- Remessas
    AND (p_data_inicio IS NULL OR p.data_emissao > p_data_inicio)
    AND (p_data_fim IS NULL OR p.data_emissao <= p_data_fim)
  GROUP BY ip.codigo_auxiliar;
$$;

-- 2. Função auxiliar: Calcula saídas de pedidos (vendas)
CREATE OR REPLACE FUNCTION public.get_saidas_pedidos(
  p_codigo_vendedor text,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS TABLE (codigo_auxiliar text, nome_produto text, quantidade numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ip.codigo_auxiliar,
    MAX(ip.nome_produto) as nome_produto,
    SUM(ip.quantidade) as quantidade
  FROM itens_pedido ip
  INNER JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.codigo_vendedor = p_codigo_vendedor
    AND p.codigo_tipo = 2 -- Vendas
    AND (p_data_inicio IS NULL OR p.data_emissao > p_data_inicio)
    AND (p_data_fim IS NULL OR p.data_emissao <= p_data_fim)
  GROUP BY ip.codigo_auxiliar;
$$;

-- 3. Função auxiliar: Calcula saldo de movimentações avulsas
CREATE OR REPLACE FUNCTION public.get_saldo_movimentacoes(
  p_codigo_vendedor text,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS TABLE (codigo_auxiliar text, nome_produto text, saldo numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    me.codigo_auxiliar,
    MAX(me.nome_produto) as nome_produto,
    SUM(CASE
      WHEN me.tipo_movimentacao IN ('ajuste_entrada', 'devolucao_cliente') THEN me.quantidade
      WHEN me.tipo_movimentacao IN ('ajuste_saida', 'devolucao_empresa', 'perda_avaria') THEN -me.quantidade
      ELSE 0
    END) as saldo
  FROM movimentacoes_estoque me
  WHERE me.codigo_vendedor = p_codigo_vendedor
    AND (p_data_inicio IS NULL OR me.data_movimentacao > p_data_inicio)
    AND (p_data_fim IS NULL OR me.data_movimentacao <= p_data_fim)
  GROUP BY me.codigo_auxiliar;
$$;

-- 4. FUNÇÃO PRINCIPAL: Calcula estoque teórico de um vendedor
-- Considera: último inventário aprovado como base + movimentos posteriores
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor(text);
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor(p_codigo_vendedor text)
RETURNS TABLE (
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
  -- Base: estoque real do último inventário (se existir)
  base_inventario AS (
    SELECT 
      er.codigo_auxiliar as cod,
      er.quantidade_real as base
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
      AND er.data_atualizacao = v_data_ultimo_inventario
  ),
  -- Entradas após o inventário (ou todas se não houver inventário)
  entradas AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, quantidade as qtd
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL)
  ),
  -- Saídas após o inventário (ou todas se não houver inventário)
  saidas AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, NULL)
  ),
  -- Movimentações após o inventário (ou todas se não houver inventário)
  movimentacoes AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, saldo
    FROM get_saldo_movimentacoes(p_codigo_vendedor, v_data_ultimo_inventario, NULL)
  ),
  -- Unifica todos os códigos de produtos
  todos_produtos AS (
    SELECT DISTINCT cod FROM base_inventario
    UNION SELECT DISTINCT cod FROM entradas
    UNION SELECT DISTINCT cod FROM saidas
    UNION SELECT DISTINCT cod FROM movimentacoes
  ),
  -- Calcula o estoque final
  estoque_final AS (
    SELECT
      tp.cod,
      COALESCE(e.nome, s.nome, m.nome, p.nome_produto, tp.cod) as nome,
      COALESCE(b.base, 0) as base,
      COALESCE(e.qtd, 0) as entradas,
      COALESCE(s.qtd, 0) as saidas,
      COALESCE(m.saldo, 0) as mov_saldo
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN movimentacoes m ON tp.cod = m.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT
    ef.cod as codigo_auxiliar,
    ef.nome as nome_produto,
    SPLIT_PART(ef.cod, ' ', 1) as modelo,
    COALESCE(NULLIF(SPLIT_PART(ef.cod, ' ', 2), ''), 'N/A') as cor,
    ef.entradas as quantidade_remessa,
    ef.saidas as quantidade_venda,
    (ef.base + ef.entradas - ef.saidas + ef.mov_saldo) as estoque_teorico
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;

-- 5. FUNÇÃO: Calcula estoque teórico ATÉ uma data específica
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor_ate_data(text, timestamptz);
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor_ate_data(
  p_codigo_vendedor text, 
  p_data_limite timestamptz
)
RETURNS TABLE (
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
  -- Base: estoque real do inventário (se existir)
  base_inventario AS (
    SELECT 
      er.codigo_auxiliar as cod,
      er.quantidade_real as base
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
      AND er.data_atualizacao = v_data_ultimo_inventario
  ),
  -- Entradas no período
  entradas AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, quantidade as qtd
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite)
  ),
  -- Saídas no período
  saidas AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite)
  ),
  -- Movimentações no período
  movimentacoes AS (
    SELECT codigo_auxiliar as cod, nome_produto as nome, saldo
    FROM get_saldo_movimentacoes(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite)
  ),
  -- Unifica todos os produtos
  todos_produtos AS (
    SELECT DISTINCT cod FROM base_inventario
    UNION SELECT DISTINCT cod FROM entradas
    UNION SELECT DISTINCT cod FROM saidas
    UNION SELECT DISTINCT cod FROM movimentacoes
  ),
  -- Calcula estoque
  estoque_final AS (
    SELECT
      tp.cod,
      COALESCE(e.nome, s.nome, m.nome, p.nome_produto, tp.cod) as nome,
      COALESCE(b.base, 0) + COALESCE(e.qtd, 0) - COALESCE(s.qtd, 0) + COALESCE(m.saldo, 0) as estoque
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN movimentacoes m ON tp.cod = m.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT ef.cod, ef.nome, ef.estoque
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;

-- 6. FUNÇÃO: Compara inventário físico com estoque teórico
-- Retorna APENAS os itens que foram contados no inventário
DROP FUNCTION IF EXISTS public.comparar_estoque_inventario(uuid);
CREATE OR REPLACE FUNCTION public.comparar_estoque_inventario(p_inventario_id uuid)
RETURNS TABLE (
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
  -- Itens contados fisicamente
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
  -- Estoque teórico na data do inventário
  teorico AS (
    SELECT cod.codigo_auxiliar as cod, cod.nome_produto as nome, cod.estoque_teorico as teorico
    FROM calcular_estoque_vendedor_ate_data(v_codigo_vendedor, v_data_inventario) cod
  )
  SELECT
    c.cod as codigo_auxiliar,
    c.nome as nome_produto,
    COALESCE(t.teorico, 0) as estoque_teorico,
    c.fisica as quantidade_fisica,
    (c.fisica - COALESCE(t.teorico, 0)) as divergencia
  FROM contagem c
  LEFT JOIN teorico t ON c.cod = t.cod
  ORDER BY c.cod;
END;
$$;