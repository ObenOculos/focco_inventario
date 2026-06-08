-- Remove a constraint UNIQUE para permitir múltiplos registros por vendedor/produto
ALTER TABLE public.estoque_real 
DROP CONSTRAINT IF EXISTS estoque_real_codigo_vendedor_codigo_auxiliar_key;

-- Atualiza a função get_estoque_real_vendedor para retornar apenas o registro mais recente de cada produto
CREATE OR REPLACE FUNCTION public.get_estoque_real_vendedor(p_codigo_vendedor text)
RETURNS TABLE(codigo_auxiliar text, quantidade_real numeric, data_atualizacao timestamp with time zone, inventario_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT 
      er.codigo_auxiliar,
      er.quantidade_real,
      er.data_atualizacao,
      er.inventario_id,
      ROW_NUMBER() OVER (
        PARTITION BY er.codigo_auxiliar 
        ORDER BY er.data_atualizacao DESC
      ) as rn
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
  )
  SELECT r.codigo_auxiliar, r.quantidade_real, r.data_atualizacao, r.inventario_id
  FROM ranked r
  WHERE r.rn = 1
  ORDER BY r.codigo_auxiliar;
END;
$$;

-- Atualiza a função calcular_estoque_vendedor_ate_data para usar o estoque real mais recente até a data limite
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor_ate_data(p_codigo_vendedor text, p_data_limite timestamp with time zone)
RETURNS TABLE(codigo_auxiliar text, nome_produto text, estoque_teorico numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  -- Busca a data do último inventário aprovado ATÉ a data limite
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado'
    AND i.data_inventario <= p_data_limite;

  RETURN QUERY
  WITH 
  -- Busca o estoque real mais recente até a data do último inventário (antes da data limite)
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
    FROM get_entradas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite) e
  ),
  saidas AS (
    SELECT s.codigo_auxiliar as cod, s.nome_produto as nome, s.quantidade as qtd
    FROM get_saidas_pedidos(p_codigo_vendedor, v_data_ultimo_inventario, p_data_limite) s
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
      COALESCE(b.base, 0) + COALESCE(e.qtd, 0) - COALESCE(s.qtd, 0) as estoque
    FROM todos_produtos tp
    LEFT JOIN base_inventario b ON tp.cod = b.cod
    LEFT JOIN entradas e ON tp.cod = e.cod
    LEFT JOIN saidas s ON tp.cod = s.cod
    LEFT JOIN produtos p ON tp.cod = p.codigo_auxiliar
  )
  SELECT ef.cod, ef.nome, ef.estoque
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;

-- Atualiza a função calcular_estoque_vendedor para usar o estoque real mais recente
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor(p_codigo_vendedor text)
RETURNS TABLE(codigo_auxiliar text, nome_produto text, modelo text, cor text, quantidade_remessa numeric, quantidade_venda numeric, estoque_teorico numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  -- Busca o estoque real mais recente na data do último inventário
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
    ef.cod, ef.nome,
    SPLIT_PART(ef.cod, ' ', 1),
    COALESCE(NULLIF(SPLIT_PART(ef.cod, ' ', 2), ''), 'N/A'),
    ef.ent, ef.sai,
    (ef.base + ef.ent - ef.sai)::numeric
  FROM estoque_final ef
  ORDER BY ef.cod;
END;
$$;

-- Atualiza comparar_estoque_teorico_vs_real para usar o registro mais recente de estoque_real
CREATE OR REPLACE FUNCTION public.comparar_estoque_teorico_vs_real(p_codigo_vendedor text)
RETURNS TABLE(codigo_auxiliar text, nome_produto text, estoque_teorico numeric, estoque_real numeric, diferenca numeric, data_atualizacao_real timestamp with time zone)
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
  ORDER BY tp.cod;
END;
$$;