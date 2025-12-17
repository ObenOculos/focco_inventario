-- Atualizar função get_saidas_pedidos para incluir tipo 3 (Retorno)
CREATE OR REPLACE FUNCTION public.get_saidas_pedidos(p_codigo_vendedor text, p_data_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_data_fim timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(codigo_auxiliar text, nome_produto text, quantidade numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    ip.codigo_auxiliar,
    MAX(ip.nome_produto) as nome_produto,
    SUM(ip.quantidade) as quantidade
  FROM itens_pedido ip
  INNER JOIN pedidos p ON p.id = ip.pedido_id
  WHERE p.codigo_vendedor = p_codigo_vendedor
    AND p.codigo_tipo IN (2, 3) -- Vendas + Retornos
    AND (p_data_inicio IS NULL OR p.data_emissao > p_data_inicio)
    AND (p_data_fim IS NULL OR p.data_emissao <= p_data_fim)
  GROUP BY ip.codigo_auxiliar;
$function$;

-- Atualizar função calcular_estoque_teorico_pos_inventario para incluir tipo 3 como saída
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
            AND p.codigo_tipo IN (2, 3, 7, 99) -- Vendas + Retornos + Remessas
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