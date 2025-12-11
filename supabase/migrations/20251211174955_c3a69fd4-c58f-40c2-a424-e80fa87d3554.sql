
CREATE OR REPLACE FUNCTION public.calcular_estoque_vendedor(p_codigo_vendedor text)
 RETURNS TABLE(codigo_auxiliar text, nome_produto text, modelo text, cor text, quantidade_remessa numeric, quantidade_venda numeric, estoque_teorico numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH itens_agregados AS (
    -- Agrega itens de pedidos por codigo_auxiliar
    SELECT
      ip.codigo_auxiliar,
      ip.nome_produto,
      SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE 0 END) as qtd_remessa,
      SUM(CASE WHEN p.codigo_tipo = 2 THEN ip.quantidade ELSE 0 END) as qtd_venda
    FROM itens_pedido ip
    INNER JOIN pedidos p ON p.id = ip.pedido_id
    WHERE p.codigo_vendedor = p_codigo_vendedor
    GROUP BY ip.codigo_auxiliar, ip.nome_produto
  ),
  movimentacoes_agregadas AS (
    -- Agrega movimentações avulsas
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
    SPLIT_PART(ef.codigo_auxiliar, ' ', 1) as modelo,
    SPLIT_PART(ef.codigo_auxiliar, ' ', 2) as cor,
    ef.qtd_remessa as quantidade_remessa,
    ef.qtd_venda as quantidade_venda,
    (ef.qtd_remessa - ef.qtd_venda + ef.qtd_movimentacao) as estoque_teorico
  FROM estoque_final ef
  ORDER BY ef.codigo_auxiliar;
END;
$function$;
