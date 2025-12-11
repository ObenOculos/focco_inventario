-- Função para calcular estoque teórico agregado por vendedor até uma data específica
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
BEGIN
  RETURN QUERY
  WITH itens_agregados AS (
    -- Agrega itens de pedidos por codigo_auxiliar até a data limite
    SELECT 
      ip.codigo_auxiliar,
      ip.nome_produto,
      SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE 0 END) as qtd_remessa,
      SUM(CASE WHEN p.codigo_tipo = 2 THEN ip.quantidade ELSE 0 END) as qtd_venda
    FROM itens_pedido ip
    INNER JOIN pedidos p ON p.id = ip.pedido_id
    WHERE p.codigo_vendedor = p_codigo_vendedor
      AND p.data_emissao <= p_data_limite
    GROUP BY ip.codigo_auxiliar, ip.nome_produto
  ),
  movimentacoes_agregadas AS (
    -- Agrega movimentações avulsas até a data limite
    SELECT 
      me.codigo_auxiliar,
      me.nome_produto,
      SUM(CASE 
            WHEN me.tipo_movimentacao IN ('ajuste_entrada'::public.movimentacao_tipo, 'devolucao_cliente'::public.movimentacao_tipo) THEN me.quantidade
            WHEN me.tipo_movimentacao IN ('ajuste_saida'::public.movimentacao_tipo, 'devolucao_empresa'::public.movimentacao_tipo, 'perda_avaria'::public.movimentacao_tipo) THEN -me.quantidade
            ELSE 0 
          END) as qtd_movimentacao
    FROM movimentacoes_estoque me
    WHERE me.codigo_vendedor = p_codigo_vendedor
      AND me.data_movimentacao <= p_data_limite
    GROUP BY me.codigo_auxiliar, me.nome_produto
  ),
  estoque_final AS (
    -- Combina itens e movimentações
    SELECT 
      COALESCE(ia.codigo_auxiliar, ma.codigo_auxiliar) as codigo_auxiliar,
      COALESCE(ia.nome_produto, ma.nome_produto) as nome_produto,
      COALESCE(ia.qtd_remessa, 0) as qtd_remessa,
      COALESCE(ia.qtd_venda, 0) as qtd_venda,
      COALESCE(ma.qtd_movimentacao, 0) as qtd_movimentacao
    FROM itens_agregados ia
    FULL OUTER JOIN movimentacoes_agregadas ma 
      ON ia.codigo_auxiliar = ma.codigo_auxiliar
  )
  SELECT 
    ef.codigo_auxiliar,
    ef.nome_produto,
    (ef.qtd_remessa - ef.qtd_venda + ef.qtd_movimentacao) as estoque_teorico
  FROM estoque_final ef;
END;
$$;

-- Altera a função original para usar a nova, mantendo a compatibilidade
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor(p_codigo_vendedor text)
RETURNS TABLE (
  codigo_auxiliar text,
  nome_produto text,
  modelo text,
  cor text,
  quantidade_remessa numeric, -- Esta coluna não pode ser calculada pela nova função
  quantidade_venda numeric,   -- Esta coluna não pode ser calculada pela nova função
  estoque_teorico numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ATENÇÃO: As colunas `quantidade_remessa` e `quantidade_venda` não são mais
  -- diretamente calculadas ou retornadas. Elas são parte do cálculo do estoque teórico.
  -- Para manter a assinatura da função, elas serão retornadas como 0.
  -- A view/query que consome esta função deve ser ajustada se precisar desses valores.
  RETURN QUERY
  SELECT 
    t.codigo_auxiliar,
    t.nome_produto,
    SPLIT_PART(t.codigo_auxiliar, ' ', 1) as modelo,
    SPLIT_PART(t.codigo_auxiliar, ' ', 2) as cor,
    0::numeric as quantidade_remessa,
    0::numeric as quantidade_venda,
    t.estoque_teorico
  FROM public.calcular_estoque_vendedor_ate_data(p_codigo_vendedor, now()) t
  WHERE t.estoque_teorico != 0
  ORDER BY t.codigo_auxiliar;
END;
$$;
