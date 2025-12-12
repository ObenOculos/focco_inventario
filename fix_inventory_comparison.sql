-- Função comparar_estoque_inventario - VERSÃO ORIGINAL
-- Calcula divergências para todos os produtos (contados e não contados)
-- Produtos não contados geram ajustes automáticos de saída

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
    SELECT inv.codigo_vendedor, inv.data_inventario
    INTO v_codigo_vendedor, v_data_inventario
    FROM public.inventarios inv
    WHERE inv.id = p_inventario_id;

    -- Se não encontrar o inventário, retorna tabela vazia
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Retornar a comparação (versão original)
    RETURN QUERY
    WITH
    teorico AS (
        -- Calcula o estoque teórico até a data do inventário
        SELECT
            t.codigo_auxiliar,
            t.nome_produto,
            t.estoque_teorico
        FROM public.calcular_estoque_vendedor_ate_data(v_codigo_vendedor, v_data_inventario) t
    ),
    fisico AS (
        -- Busca a contagem física do inventário
        SELECT
            ii.codigo_auxiliar,
            MAX(ii.nome_produto) as nome_produto,
            SUM(ii.quantidade_fisica) as quantidade_fisica
        FROM public.itens_inventario ii
        WHERE ii.inventario_id = p_inventario_id
        GROUP BY ii.codigo_auxiliar
    ),
    produtos_unificados AS (
        -- Garante que todos os produtos (teóricos e físicos) apareçam no resultado
        SELECT t.codigo_auxiliar as cod_aux FROM teorico t
        UNION
        SELECT f.codigo_auxiliar as cod_aux FROM fisico f
    )
    SELECT
        pu.cod_aux as codigo_auxiliar,
        COALESCE(t.nome_produto, f.nome_produto, pu.cod_aux) as nome_produto,
        COALESCE(t.estoque_teorico, 0) as estoque_teorico,
        COALESCE(f.quantidade_fisica, 0) as quantidade_fisica,
        (COALESCE(f.quantidade_fisica, 0) - COALESCE(t.estoque_teorico, 0)) as divergencia
    FROM produtos_unificados pu
    LEFT JOIN teorico t ON pu.cod_aux = t.codigo_auxiliar
    LEFT JOIN fisico f ON pu.cod_aux = f.codigo_auxiliar
    ORDER BY pu.cod_aux;

END;
$$;