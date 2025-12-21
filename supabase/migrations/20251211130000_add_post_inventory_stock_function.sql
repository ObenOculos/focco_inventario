CREATE OR REPLACE FUNCTION public.calcular_estoque_teorico_pos_inventario(p_codigo_vendedor text)
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
    v_ultimo_inventario_id uuid;
    v_data_ultimo_inventario timestamptz;
BEGIN
    -- 1. Encontra o último inventário aprovado para o vendedor
    SELECT id, data_inventario
    INTO v_ultimo_inventario_id, v_data_ultimo_inventario
    FROM public.inventarios
    WHERE codigo_vendedor = p_codigo_vendedor AND status = 'aprovado'
    ORDER BY data_inventario DESC
    LIMIT 1;

    -- 2. Se não houver inventário aprovado, usa a função de cálculo completo desde o início
    IF v_ultimo_inventario_id IS NULL THEN
        RETURN QUERY
        SELECT t.codigo_auxiliar, t.nome_produto, t.estoque_teorico
        FROM public.calcular_estoque_vendedor_ate_data(p_codigo_vendedor, now());
        RETURN;
    END IF;

    -- 3. Se houver, calcula o estoque a partir da contagem física do último inventário
    RETURN QUERY
    WITH
    base_stock AS (
        -- Estoque físico contado no último inventário aprovado
        SELECT
            ii.codigo_auxiliar,
            MAX(p.nome_produto) as nome_produto, -- Pega o nome mais recente da tabela de produtos
            SUM(ii.quantidade_fisica) as quantidade
        FROM public.itens_inventario ii
        JOIN public.produtos p ON ii.codigo_auxiliar = p.codigo_auxiliar
        WHERE ii.inventario_id = v_ultimo_inventario_id
        GROUP BY ii.codigo_auxiliar
    ),
    movimentos_posteriores AS (
        -- Agrega todas as entradas e saídas que ocorreram APÓS a data do inventário
        SELECT
            m.codigo_auxiliar,
            SUM(m.quantidade) as delta
        FROM (
            -- Pedidos: Remessas (entrada) e Vendas (saída)
            SELECT
                ip.codigo_auxiliar,
                SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE -ip.quantidade END) as quantidade
            FROM public.itens_pedido ip
            JOIN public.pedidos p ON ip.pedido_id = p.id
            WHERE p.codigo_vendedor = p_codigo_vendedor
            AND p.codigo_tipo IN (2, 7, 99) -- 2=Venda, 7/99=Remessa
            AND p.data_emissao > v_data_ultimo_inventario
            GROUP BY ip.codigo_auxiliar
            
            UNION ALL

            -- Movimentações avulsas: entradas e saídas manuais
            SELECT
                me.codigo_auxiliar,
                SUM(CASE
                    WHEN me.tipo_movimentacao IN ('ajuste_entrada'::public.movimentacao_tipo, 'devolucao_cliente'::public.movimentacao_tipo) THEN me.quantidade
                    ELSE -me.quantidade
                END) as quantidade
            FROM public.movimentacoes_estoque me
            WHERE me.codigo_vendedor = p_codigo_vendedor
            AND me.data_movimentacao > v_data_ultimo_inventario
            GROUP BY me.codigo_auxiliar
        ) as m
        GROUP BY m.codigo_auxiliar
    ),
    produtos_unificados AS (
        -- Garante que todos os produtos (da base e dos movimentos) sejam considerados
        SELECT b.codigo_auxiliar FROM base_stock b
        UNION
        SELECT m.codigo_auxiliar FROM movimentos_posteriores m
    )
    -- Junta o estoque base com os movimentos para obter o estoque teórico atual
    SELECT
        pu.codigo_auxiliar,
        COALESCE(b.nome_produto, p.nome_produto, pu.codigo_auxiliar) as nome_produto,
        (COALESCE(b.quantidade, 0) + COALESCE(mp.delta, 0)) as estoque_teorico
    FROM produtos_unificados pu
    LEFT JOIN base_stock b ON pu.codigo_auxiliar = b.codigo_auxiliar
    LEFT JOIN movimentos_posteriores mp ON pu.codigo_auxiliar = mp.codigo_auxiliar
    LEFT JOIN public.produtos p ON pu.codigo_auxiliar = p.codigo_auxiliar -- Para pegar nomes de produtos que só existem em movimentos
    WHERE (COALESCE(b.quantidade, 0) + COALESCE(mp.delta, 0)) != 0
    ORDER BY pu.codigo_auxiliar;

END;
$$;
