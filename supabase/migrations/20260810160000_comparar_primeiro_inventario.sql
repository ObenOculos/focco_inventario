-- Permite comparar o PRIMEIRO inventário de um representante, que não tem contagem
-- anterior para servir de lado A.
--
-- O caso é o do representante novo: a mala nasceu vazia numa data conhecida, e o que
-- deveria estar nela é o que foi remetido menos o que foi vendido desde então. A conta
-- não muda em nada — é a mesma `esperado = q1 + remessa − venda` da tela, com `q1 = 0`.
-- Por isso NÃO existe função nova: o que muda aqui é só aceitar `p_inventario_a` nulo.
--
-- Com A nulo, `lado_a` não casa nenhuma linha, `todos_produtos` vira o conjunto de B, e
-- os COALESCE que já existiam entregam `quantidade_a = 0` e `presente_em_a = false`. A
-- diferença `B - A` continua correta: é o próprio B.
--
-- B segue obrigatório: sem contagem nenhuma não há o que comparar.
--
-- CREATE OR REPLACE sem DROP porque a assinatura e o tipo de retorno não mudam.

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

  -- `p_inventario_a` nulo é o modo "primeiro inventário". `p_inventario_b` nulo, não:
  -- é ausência de dado, e devolver linhas seria inventar uma contagem que não existe.
  IF p_inventario_b IS NULL THEN
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

COMMENT ON FUNCTION public.comparar_dois_inventarios(uuid, uuid, integer, integer) IS
  'Compara as contagens de dois inventários. diferenca = B - A. Com p_inventario_a nulo, '
  'compara o PRIMEIRO inventário (A = mala vazia, quantidade_a = 0); a linha de base de '
  'data fica na tela, que é quem consulta os movimentos do ERP. Ferramenta de consulta: '
  'não participa do fluxo de aprovação.';
