-- Comparação de inventários como funcionalidade independente.
--
-- A comparação deixa de fazer parte do fluxo de aprovação. O fluxo do inventário passa a
-- ser apenas contagem -> envio -> revisão -> aprovação -> salvo, sem nenhum cálculo de
-- divergência. A comparação vira ferramenta de consulta: o usuário escolhe explicitamente
-- dois inventários e pede o comparativo.
--
-- Isso elimina por construção o problema da escolha automática de base. A função anterior
-- derivava a referência sozinha ("último inventário aprovado antes deste"), o que produzia
-- resultado sem sentido quando havia re-contagens próximas — foram medidos 4 casos em
-- produção com 100% dos produtos divergindo, sendo o pior deles dois inventários aprovados
-- a 2 minutos e 42 segundos de distância. Agora quem escolhe os dois lados é o usuário.
--
-- Os nomes das colunas descrevem o que os valores são de fato. A antiga chamava a
-- referência de `estoque_teorico`, herança do subsistema de estoque por pedidos que está
-- sendo removido; aqui não existe teórico algum, existem duas contagens.
--
-- `comparar_estoque_inventario_paginado` NÃO é removida nesta migration: a página
-- Conferência ainda a chama. Ela é dropada na etapa de limpeza do banco, depois que o
-- front parar de usá-la.

CREATE OR REPLACE FUNCTION public.comparar_dois_inventarios(
  p_inventario_a uuid,
  p_inventario_b uuid,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  codigo_auxiliar text,
  nome_produto text,
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
  -- A função é SECURITY DEFINER (precisa ler inventários de qualquer vendedor, ignorando
  -- a RLS de itens_inventario), então a autorização é feita aqui dentro. Comparar
  -- inventários é ação de gerente, como a tela que a consome.
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
    COALESCE(a.qtd, 0::numeric) AS qtd_a,
    COALESCE(b.qtd, 0::numeric) AS qtd_b,
    (COALESCE(b.qtd, 0) - COALESCE(a.qtd, 0))::numeric AS dif,
    (a.cod IS NOT NULL) AS em_a,
    (b.cod IS NOT NULL) AS em_b
  FROM todos_produtos tp
  LEFT JOIN lado_a a ON tp.cod = a.cod
  LEFT JOIN lado_b b ON tp.cod = b.cod
  ORDER BY tp.cod
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) IS
  'Compara as contagens de dois inventários escolhidos explicitamente. diferenca = B - A. Ferramenta de consulta: não participa do fluxo de aprovação.';
