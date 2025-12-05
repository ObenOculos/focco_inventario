-- 1. Função para calcular estoque teórico de um vendedor ATÉ UMA DATA ESPECÍFICA
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
AS $$
BEGIN
  RETURN QUERY
  WITH movimentacoes_pedidos AS (
    -- Entradas (remessas) e Saídas (vendas) da tabela de pedidos
    SELECT 
      ip.codigo_auxiliar,
      SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE 0 END) as entradas,
      SUM(CASE WHEN p.codigo_tipo = 2 THEN ip.quantidade ELSE 0 END) as saidas
    FROM public.itens_pedido ip
    JOIN public.pedidos p ON ip.pedido_id = p.id
    WHERE p.codigo_vendedor = p_codigo_vendedor AND p.data_emissao <= p_data_limite
    GROUP BY ip.codigo_auxiliar
  ),
  movimentacoes_ajustes AS (
    -- Movimentações avulsas (ajustes, perdas, devoluções)
    SELECT
      me.codigo_auxiliar,
      SUM(
        CASE
          WHEN me.tipo_movimentacao IN ('ajuste_entrada', 'devolucao_cliente') THEN me.quantidade
          WHEN me.tipo_movimentacao IN ('ajuste_saida', 'devolucao_empresa', 'perda_avaria') THEN -me.quantidade
          ELSE 0
        END
      ) as ajustes
    FROM public.movimentacoes_estoque me
    WHERE me.codigo_vendedor = p_codigo_vendedor AND me.data_movimentacao <= p_data_limite
    GROUP BY me.codigo_auxiliar
  ),
  produtos_vendedor AS (
      -- Garante que todos os produtos que já tiveram movimentação para o vendedor apareçam
      SELECT codigo_auxiliar, MAX(nome_produto) as nome_produto FROM (
          SELECT codigo_auxiliar, nome_produto FROM public.itens_pedido ip JOIN public.pedidos p ON ip.pedido_id = p.id WHERE p.codigo_vendedor = p_codigo_vendedor AND p.data_emissao <= p_data_limite
          UNION ALL
          SELECT codigo_auxiliar, nome_produto FROM public.movimentacoes_estoque WHERE codigo_vendedor = p_codigo_vendedor AND data_movimentacao <= p_data_limite
      ) as produtos
      GROUP BY codigo_auxiliar
  )
  -- Combina todos os dados
  SELECT 
    pv.codigo_auxiliar,
    pv.nome_produto,
    (COALESCE(mp.entradas, 0) - COALESCE(mp.saidas, 0) + COALESCE(ma.ajustes, 0)) AS estoque_teorico
  FROM produtos_vendedor pv
  LEFT JOIN movimentacoes_pedidos mp ON pv.codigo_auxiliar = mp.codigo_auxiliar
  LEFT JOIN movimentacoes_ajustes ma ON pv.codigo_auxiliar = ma.codigo_auxiliar;

END;
$$;


-- 2. Função para comparar o estoque de um inventário específico
CREATE OR REPLACE FUNCTION public.comparar_estoque_inventario(p_inventario_id uuid)
RETURNS TABLE (
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric,
  quantidade_fisica numeric,
  divergencia numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_codigo_vendedor text;
    v_data_inventario timestamptz;
BEGIN
    -- Obter os detalhes do inventário
    SELECT codigo_vendedor, data_inventario INTO v_codigo_vendedor, v_data_inventario
    FROM public.inventarios
    WHERE id = p_inventario_id;

    -- Se não encontrar o inventário, retorna tabela vazia
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Retornar a comparação
    RETURN QUERY
    WITH 
    teorico AS (
        -- Calcula o estoque teórico até a data do inventário
        SELECT * FROM public.calcular_estoque_vendedor_ate_data(v_codigo_vendedor, v_data_inventario)
    ),
    fisico AS (
        -- Busca a contagem física do inventário
        SELECT 
            ii.codigo_auxiliar,
            MAX(ii.nome_produto) as nome_produto, -- Usa MAX para agregar, já que o nome deve ser o mesmo
            SUM(ii.quantidade_fisica) as quantidade_fisica
        FROM public.itens_inventario ii
        WHERE ii.inventario_id = p_inventario_id
        GROUP BY ii.codigo_auxiliar
    ),
    produtos_unificados AS (
        -- Garante que todos os produtos (teóricos e físicos) apareçam no resultado
        SELECT codigo_auxiliar FROM teorico
        UNION
        SELECT codigo_auxiliar FROM fisico
    )
    SELECT
        pu.codigo_auxiliar,
        COALESCE(t.nome_produto, f.nome_produto, pu.codigo_auxiliar) as nome_produto,
        COALESCE(t.estoque_teorico, 0) as estoque_teorico,
        COALESCE(f.quantidade_fisica, 0) as quantidade_fisica,
        (COALESCE(f.quantidade_fisica, 0) - COALESCE(t.estoque_teorico, 0)) as divergencia
    FROM produtos_unificados pu
    LEFT JOIN teorico t ON pu.codigo_auxiliar = t.codigo_auxiliar
    LEFT JOIN fisico f ON pu.codigo_auxiliar = f.codigo_auxiliar
    ORDER BY pu.codigo_auxiliar;

END;
$$;
