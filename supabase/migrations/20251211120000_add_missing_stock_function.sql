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
  quantidade_remessa numeric,
  quantidade_venda numeric,
  estoque_teorico numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ultimo_inventario AS (
    -- Busca a data do último inventário aprovado para este vendedor
    SELECT MAX(i.data_inventario) as data_ultimo_inventario
    FROM inventarios i
    WHERE i.codigo_vendedor = p_codigo_vendedor
    AND i.status = 'aprovado'
  ),
  estoque_real_atual AS (
    -- Busca o estoque real mais recente
    SELECT DISTINCT ON (er.codigo_auxiliar)
      er.codigo_auxiliar,
      er.quantidade_real,
      er.data_atualizacao
    FROM estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
    ORDER BY er.codigo_auxiliar, er.data_atualizacao DESC
  ),
  itens_agregados AS (
    -- Agrega itens de pedidos por codigo_auxiliar
    -- Só considera pedidos APÓS o último inventário (se existir)
    SELECT
      ip.codigo_auxiliar,
      ip.nome_produto,
      SUM(CASE WHEN p.codigo_tipo IN (7, 99) THEN ip.quantidade ELSE 0 END) as qtd_remessa,
      SUM(CASE WHEN p.codigo_tipo = 2 THEN ip.quantidade ELSE 0 END) as qtd_venda
    FROM itens_pedido ip
    INNER JOIN pedidos p ON p.id = ip.pedido_id
    WHERE p.codigo_vendedor = p_codigo_vendedor
    AND (SELECT data_ultimo_inventario FROM ultimo_inventario) IS NULL
       OR p.data_emissao > (SELECT data_ultimo_inventario FROM ultimo_inventario)
    GROUP BY ip.codigo_auxiliar, ip.nome_produto
  ),
  movimentacoes_agregadas AS (
    -- Agrega movimentações avulsas
    -- Só considera movimentações APÓS o último inventário (se existir)
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
    AND (SELECT data_ultimo_inventario FROM ultimo_inventario) IS NULL
       OR me.created_at > (SELECT data_ultimo_inventario FROM ultimo_inventario)
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
  ),
  estoque_com_base AS (
    -- Adiciona o estoque real como base quando disponível
    SELECT
      ef.codigo_auxiliar,
      ef.nome_produto,
      ef.qtd_remessa,
      ef.qtd_venda,
      ef.qtd_movimentacao,
      era.quantidade_real as base_estoque_real,
      CASE WHEN era.quantidade_real IS NOT NULL THEN true ELSE false END as foi_inventariado
    FROM estoque_final ef
    FULL OUTER JOIN estoque_real_atual era ON ef.codigo_auxiliar = era.codigo_auxiliar
  )
  SELECT
    ecb.codigo_auxiliar,
    ecb.nome_produto,
    SPLIT_PART(ecb.codigo_auxiliar, ' ', 1) as modelo,
    SPLIT_PART(ecb.codigo_auxiliar, ' ', 2) as cor,
    ecb.qtd_remessa as quantidade_remessa,
    ecb.qtd_venda as quantidade_venda,
    CASE
      WHEN ecb.foi_inventariado THEN ecb.base_estoque_real
      ELSE (ecb.qtd_remessa - ecb.qtd_venda + ecb.qtd_movimentacao)
    END as estoque_teorico
  FROM estoque_com_base ecb
  WHERE CASE
    WHEN ecb.foi_inventariado THEN ecb.base_estoque_real != 0
    ELSE (ecb.qtd_remessa - ecb.qtd_venda + ecb.qtd_movimentacao) != 0
  END
  ORDER BY ecb.codigo_auxiliar;
END;
$$;
