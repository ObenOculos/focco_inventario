-- Acrescenta o valor unitário do produto ao comparativo entre dois inventários.
--
-- Sem ele a tela mostrava só quantidades, e a pergunta que importa na análise — quanto a
-- diferença representa em dinheiro — ficava sem resposta.
--
-- O valor vem de `produtos.valor_produto` e é obtido no mesmo LEFT JOIN que já buscava o
-- nome do produto, então não custa consulta adicional. A tela deriva o valor da diferença
-- multiplicando pela quantidade, mantendo um único lugar onde a multiplicação acontece.
--
-- O DROP é necessário porque CREATE OR REPLACE não altera o tipo de retorno de uma função.

DROP FUNCTION IF EXISTS public.comparar_dois_inventarios(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.comparar_dois_inventarios(
  p_inventario_a uuid,
  p_inventario_b uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
  valor_unitario numeric,
  quantidade_a numeric,
  quantidade_b numeric,
  diferenca numeric,
  presente_em_a boolean,
  presente_em_b boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER para atravessar a RLS de itens_inventario e ler inventários de
  -- qualquer vendedor; por isso a autorização é feita aqui dentro.
  IF public.get_user_role(auth.uid()) IS DISTINCT FROM 'gerente'::user_role THEN
    RAISE EXCEPTION 'Acesso negado: apenas gerentes podem comparar inventários.';
  END IF;

  IF p_inventario_a IS NULL OR p_inventario_b IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  lado_a AS (
    SELECT
      ii.codigo_auxiliar AS cod,
      MAX(COALESCE(ii.nome_produto, p.nome_produto, ii.codigo_auxiliar)) AS nome,
      SUM(ii.quantidade_fisica) AS qtd
    FROM itens_inventario ii
    LEFT JOIN produtos p ON ii.codigo_auxiliar = p.codigo_auxiliar
    WHERE ii.inventario_id = p_inventario_a
    GROUP BY ii.codigo_auxiliar
  ),
  lado_b AS (
    SELECT
      ii.codigo_auxiliar AS cod,
      MAX(COALESCE(ii.nome_produto, p.nome_produto, ii.codigo_auxiliar)) AS nome,
      SUM(ii.quantidade_fisica) AS qtd
    FROM itens_inventario ii
    LEFT JOIN produtos p ON ii.codigo_auxiliar = p.codigo_auxiliar
    WHERE ii.inventario_id = p_inventario_b
    GROUP BY ii.codigo_auxiliar
  ),
  todos_produtos AS (
    SELECT a.cod FROM lado_a a
    UNION
    SELECT b.cod FROM lado_b b
  )
  SELECT
    tp.cod,
    COALESCE(a.nome, b.nome, tp.cod) AS nome,
    -- Produto contado mas ausente do cadastro fica com valor 0, e não NULL, para a tela
    -- não precisar tratar dois casos de "sem valor".
    COALESCE(pr.valor_produto, 0)::numeric AS val_unit,
    COALESCE(a.qtd, 0::numeric) AS qtd_a,
    COALESCE(b.qtd, 0::numeric) AS qtd_b,
    (COALESCE(b.qtd, 0) - COALESCE(a.qtd, 0))::numeric AS dif,
    (a.cod IS NOT NULL) AS em_a,
    (b.cod IS NOT NULL) AS em_b
  FROM todos_produtos tp
  LEFT JOIN lado_a a ON tp.cod = a.cod
  LEFT JOIN lado_b b ON tp.cod = b.cod
  LEFT JOIN produtos pr ON tp.cod = pr.codigo_auxiliar
  ORDER BY tp.cod
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) IS
  'Compara as contagens de dois inventários escolhidos explicitamente. diferenca = B - A. Ferramenta de consulta: não participa do fluxo de aprovação.';
