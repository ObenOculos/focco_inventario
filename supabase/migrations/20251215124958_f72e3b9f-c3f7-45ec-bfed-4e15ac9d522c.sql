-- 1. Dropar função existente para poder alterar retorno
DROP FUNCTION IF EXISTS public.comparar_estoque_inventario(uuid);

-- 2. Criar função comparar_estoque_inventario com foi_contado
CREATE OR REPLACE FUNCTION public.comparar_estoque_inventario(p_inventario_id uuid)
 RETURNS TABLE(
   codigo_auxiliar text, 
   nome_produto text, 
   estoque_teorico numeric, 
   quantidade_fisica numeric, 
   divergencia numeric,
   foi_contado boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo_vendedor text;
  v_data_inventario timestamptz;
BEGIN
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
    SELECT c.cod FROM contagem c
    UNION
    SELECT t.cod FROM teorico t
  )
  SELECT
    tp.cod,
    COALESCE(c.nome, t.nome, tp.cod) as nome,
    COALESCE(t.teorico, 0::numeric) as est_teorico,
    COALESCE(c.fisica, 0::numeric) as qtd_fisica,
    (COALESCE(c.fisica, 0) - COALESCE(t.teorico, 0))::numeric as div,
    (c.cod IS NOT NULL) as contado
  FROM todos_produtos tp
  LEFT JOIN contagem c ON tp.cod = c.cod
  LEFT JOIN teorico t ON tp.cod = t.cod
  ORDER BY tp.cod;
END;
$function$;

-- 3. Atualizar calcular_estoque_vendedor (sem movimentacoes)
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor(p_codigo_vendedor text)
 RETURNS TABLE(codigo_auxiliar text, nome_produto text, modelo text, cor text, quantidade_remessa numeric, quantidade_venda numeric, estoque_teorico numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado';

  RETURN QUERY
  WITH 
  base_inventario AS (
    SELECT er.codigo_auxiliar as cod, er.quantidade_real as base
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
$function$;

-- 4. Atualizar calcular_estoque_vendedor_ate_data (sem movimentacoes)
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor_ate_data(p_codigo_vendedor text, p_data_limite timestamp with time zone)
 RETURNS TABLE(codigo_auxiliar text, nome_produto text, estoque_teorico numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_data_ultimo_inventario timestamptz;
BEGIN
  SELECT MAX(i.data_inventario)
  INTO v_data_ultimo_inventario
  FROM inventarios i
  WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado'
    AND i.data_inventario <= p_data_limite;

  RETURN QUERY
  WITH 
  base_inventario AS (
    SELECT er.codigo_auxiliar as cod, er.quantidade_real as base
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
$function$;

-- 5. Atualizar calcular_estoque_teorico_pos_inventario (sem movimentacoes)
CREATE OR REPLACE FUNCTION public.calcular_estoque_teorico_pos_inventario(p_codigo_vendedor text)
 RETURNS TABLE(codigo_auxiliar text, nome_produto text, estoque_teorico numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_ultimo_inventario_id uuid;
    v_data_ultimo_inventario timestamptz;
BEGIN
    SELECT id, data_inventario
    INTO v_ultimo_inventario_id, v_data_ultimo_inventario
    FROM public.inventarios
    WHERE codigo_vendedor = p_codigo_vendedor AND status = 'aprovado'
    ORDER BY data_inventario DESC
    LIMIT 1;

    IF v_ultimo_inventario_id IS NULL THEN
        RETURN QUERY
        SELECT t.codigo_auxiliar, t.nome_produto, t.estoque_teorico
        FROM public.calcular_estoque_vendedor_ate_data(p_codigo_vendedor, now());
        RETURN;
    END IF;

    RETURN QUERY
    WITH
    base_stock AS (
        SELECT ii.codigo_auxiliar, MAX(p.nome_produto) as nome_produto, SUM(ii.quantidade_fisica) as quantidade
        FROM public.itens_inventario ii
        JOIN public.produtos p ON ii.codigo_auxiliar = p.codigo_auxiliar
        WHERE ii.inventario_id = v_ultimo_inventario_id
        GROUP BY ii.codigo_auxiliar
    ),
    movimentos_posteriores AS (
        SELECT m.codigo_auxiliar, SUM(m.quantidade) as delta
        FROM (
            SELECT ip.codigo_auxiliar,
                SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE -ip.quantidade END) as quantidade
            FROM public.itens_pedido ip
            JOIN public.pedidos p ON ip.pedido_id = p.id
            WHERE p.codigo_vendedor = p_codigo_vendedor
            AND p.codigo_tipo IN (2, 7, 99)
            AND p.data_emissao > v_data_ultimo_inventario
            GROUP BY ip.codigo_auxiliar
        ) as m
        GROUP BY m.codigo_auxiliar
    ),
    produtos_unificados AS (
        SELECT b.codigo_auxiliar FROM base_stock b
        UNION
        SELECT m.codigo_auxiliar FROM movimentos_posteriores m
    )
    SELECT
        pu.codigo_auxiliar,
        COALESCE(b.nome_produto, p.nome_produto, pu.codigo_auxiliar) as nome_produto,
        (COALESCE(b.quantidade, 0) + COALESCE(mp.delta, 0)) as estoque_teorico
    FROM produtos_unificados pu
    LEFT JOIN base_stock b ON pu.codigo_auxiliar = b.codigo_auxiliar
    LEFT JOIN movimentos_posteriores mp ON pu.codigo_auxiliar = mp.codigo_auxiliar
    LEFT JOIN public.produtos p ON pu.codigo_auxiliar = p.codigo_auxiliar
    WHERE (COALESCE(b.quantidade, 0) + COALESCE(mp.delta, 0)) != 0
    ORDER BY pu.codigo_auxiliar;
END;
$function$;

-- 6. Remover função get_saldo_movimentacoes
DROP FUNCTION IF EXISTS public.get_saldo_movimentacoes(text, timestamp with time zone, timestamp with time zone);

-- 7. Remover tabela movimentacoes_estoque
DROP TABLE IF EXISTS public.movimentacoes_estoque;

-- 8. Remover enum movimentacao_tipo
DROP TYPE IF EXISTS public.movimentacao_tipo;