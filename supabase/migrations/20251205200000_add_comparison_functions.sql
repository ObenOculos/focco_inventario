-- Fixed function with proper column aliasing
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

    -- Retornar a comparação
    RETURN QUERY
    WITH
    fisico AS (
        -- Busca a contagem física do inventário (só produtos que foram contados)
        SELECT
            ii.codigo_auxiliar,
            MAX(ii.nome_produto) as nome_produto,
            SUM(ii.quantidade_fisica) as quantidade_fisica
        FROM public.itens_inventario ii
        WHERE ii.inventario_id = p_inventario_id
        GROUP BY ii.codigo_auxiliar
    ),
    teorico AS (
        -- Calcula o estoque teórico até a data do inventário APENAS para produtos contados
        SELECT
            t.codigo_auxiliar,
            t.nome_produto,
            t.estoque_teorico
        FROM public.calcular_estoque_vendedor_ate_data(v_codigo_vendedor, v_data_inventario) t
        WHERE t.codigo_auxiliar IN (SELECT codigo_auxiliar FROM fisico)
    )
    SELECT
        f.codigo_auxiliar,
        COALESCE(f.nome_produto, t.nome_produto, f.codigo_auxiliar) as nome_produto,
        COALESCE(t.estoque_teorico, 0) as estoque_teorico,
        COALESCE(f.quantidade_fisica, 0) as quantidade_fisica,
        (COALESCE(f.quantidade_fisica, 0) - COALESCE(t.estoque_teorico, 0)) as divergencia
    FROM fisico f
    LEFT JOIN teorico t ON f.codigo_auxiliar = t.codigo_auxiliar
    ORDER BY f.codigo_auxiliar;

END;
$$;