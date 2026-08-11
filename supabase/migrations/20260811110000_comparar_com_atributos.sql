-- `comparar_dois_inventarios` passa a devolver os atributos do produto.
--
-- A leitura gerencial do comparativo agrupa a divergência por Marca → Tipo →
-- Subtipo → Grupo. Sem esses campos na própria linha, a tela teria de buscar o
-- catálogo inteiro num segundo request e cruzar no cliente — uma ida a mais para
-- um dado que já está a um JOIN de distância, no mesmo `produtos pr` que a função
-- já consulta para pegar `valor_produto`.
--
-- DROP antes do CREATE porque o TIPO DE RETORNO muda; `CREATE OR REPLACE` recusa
-- alteração de RETURNS TABLE. A assinatura de parâmetros continua idêntica, então
-- o DROP é seguro e específico.
--
-- O que NÃO muda: a conta. `diferenca` segue sendo B − A, o modo primeiro
-- inventário (A nulo) continua funcionando pelo mesmo caminho, e a autorização
-- segue no corpo por ser SECURITY DEFINER.

DROP FUNCTION IF EXISTS public.comparar_dois_inventarios(uuid, uuid, integer, integer);

CREATE FUNCTION public.comparar_dois_inventarios(
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
  presente_em_b boolean,
  marca text,
  tipo text,
  subtipo text,
  grupo text
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
    (b.cod IS NOT NULL) AS em_b,
    -- NULL aqui é informação, não falha: produto contado que não está no catálogo, ou
    -- que veio do upload manual antigo. A tela agrupa esses como "Sem categoria" —
    -- COALESCE para um rótulo aqui esconderia a diferença entre "sem cadastro" e uma
    -- categoria chamada assim.
    pr.marca,
    pr.tipo,
    pr.subtipo,
    pr.grupo
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
  'data fica na tela, que é quem consulta os movimentos do ERP. Devolve também os atributos '
  'do catálogo (marca/tipo/subtipo/grupo) que a leitura gerencial usa para agrupar — NULL '
  'quando o produto contado não está em `produtos`. Ferramenta de consulta: não participa '
  'do fluxo de aprovação.';
