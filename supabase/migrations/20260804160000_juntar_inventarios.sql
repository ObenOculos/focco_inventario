-- Junta vários inventários de um mesmo vendedor em um só.
--
-- Motivação medida em produção: vendedores partem uma única sessão de contagem em vários
-- inventários separados. A sobreposição de produtos entre inventários do mesmo dia é
-- ZERO — são faixas disjuntas de produto, não recontagens. Exemplos:
--   vendedor 11 em 01/06: 429 + 181 + 63 produtos, nenhum em comum
--   vendedor 8 em 09/07:  145 + 405 produtos, nenhum em comum
-- Para efeito de histórico e de comparação, cada conjunto desses é um inventário só.
--
-- Isso não é impedido na origem de propósito: fragmentar é um modo de trabalho válido.
-- O `salvar_inventario` já barra criar um segundo inventário enquanto existe um
-- pendente/revisão, mas a sequência criar → aprovar → criar → aprovar passa livre, e deve
-- continuar passando. A correção é poder juntar depois.
--
-- Os inventários de origem são APAGADOS. Manter os fragmentos depois de somá-los faria as
-- peças serem contadas duas vezes no histórico e na comparação, que é exatamente o
-- problema que esta função existe para resolver. O rastro de quais inventários foram
-- absorvidos fica em observacoes_gerente do destino.

CREATE OR REPLACE FUNCTION public.juntar_inventarios(
  p_inventario_destino uuid,
  p_inventarios_origem uuid[]
)
-- A coluna de saída se chama destino_id, e não inventario_id, de propósito: nomes
-- declarados em RETURNS TABLE viram variáveis PL/pgSQL e colidem com colunas de mesmo
-- nome nas queries do corpo (itens_inventario.inventario_id).
RETURNS TABLE(
  destino_id uuid,
  total_produtos bigint,
  total_unidades numeric,
  absorvidos integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo_vendedor text;
  v_origens uuid[];
  v_qtd_origens integer;
  v_divergentes integer;
  v_rotulos text;
BEGIN
  IF public.get_user_role(auth.uid()) IS DISTINCT FROM 'gerente'::user_role THEN
    RAISE EXCEPTION 'Acesso negado: apenas gerentes podem juntar inventários.';
  END IF;

  IF p_inventario_destino IS NULL THEN
    RAISE EXCEPTION 'Informe o inventário de destino.';
  END IF;

  -- Normaliza a lista de origens: remove nulos, duplicatas e o próprio destino
  SELECT array_agg(DISTINCT o)
  INTO v_origens
  FROM unnest(COALESCE(p_inventarios_origem, '{}'::uuid[])) AS o
  WHERE o IS NOT NULL AND o <> p_inventario_destino;

  v_qtd_origens := COALESCE(array_length(v_origens, 1), 0);
  IF v_qtd_origens = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um inventário de origem diferente do destino.';
  END IF;

  SELECT i.codigo_vendedor
  INTO v_codigo_vendedor
  FROM inventarios i
  WHERE i.id = p_inventario_destino;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventário de destino não encontrado.';
  END IF;

  -- Todas as origens precisam existir e pertencer ao mesmo vendedor do destino. Juntar
  -- contagens de vendedores diferentes é sempre erro, então falha em vez de ignorar.
  SELECT count(*)
  INTO v_divergentes
  FROM unnest(v_origens) AS o
  LEFT JOIN inventarios i ON i.id = o
  WHERE i.id IS NULL OR i.codigo_vendedor <> v_codigo_vendedor;

  IF v_divergentes > 0 THEN
    RAISE EXCEPTION 'Há % inventário(s) de origem inexistente(s) ou de outro vendedor.', v_divergentes;
  END IF;

  -- Rótulos para o rastro, montados antes de apagar as origens
  SELECT string_agg(to_char(i.data_inventario, 'DD/MM/YYYY HH24:MI'), ', ' ORDER BY i.data_inventario)
  INTO v_rotulos
  FROM inventarios i
  WHERE i.id = ANY(v_origens);

  -- Consolida destino + origens numa tabela temporária. A normalização
  -- upper(trim(...)) e a soma por código são as mesmas do salvar_inventario, para que
  -- juntar não produza um estado que a edição normal não produziria.
  CREATE TEMP TABLE _merge_itens ON COMMIT DROP AS
  SELECT
    upper(trim(ii.codigo_auxiliar)) AS codigo_auxiliar,
    max(ii.nome_produto) AS nome_produto,
    sum(ii.quantidade_fisica) AS quantidade_fisica
  FROM itens_inventario ii
  WHERE ii.inventario_id = p_inventario_destino
     OR ii.inventario_id = ANY(v_origens)
  GROUP BY upper(trim(ii.codigo_auxiliar));

  DELETE FROM itens_inventario ii WHERE ii.inventario_id = p_inventario_destino;

  INSERT INTO itens_inventario (inventario_id, codigo_auxiliar, nome_produto, quantidade_fisica)
  SELECT p_inventario_destino, m.codigo_auxiliar, m.nome_produto, m.quantidade_fisica
  FROM _merge_itens m;

  UPDATE inventarios i
  SET observacoes_gerente = concat_ws(
        E'\n\n',
        nullif(i.observacoes_gerente, ''),
        format('Absorvidos %s inventário(s) em %s: %s',
               v_qtd_origens,
               to_char(now(), 'DD/MM/YYYY HH24:MI'),
               v_rotulos)
      )
  WHERE i.id = p_inventario_destino;

  -- Os itens das origens saem por ON DELETE CASCADE de itens_inventario.inventario_id
  DELETE FROM inventarios WHERE id = ANY(v_origens);

  RETURN QUERY
  SELECT
    p_inventario_destino,
    count(*)::bigint,
    COALESCE(sum(ii.quantidade_fisica), 0)::numeric,
    v_qtd_origens
  FROM itens_inventario ii
  WHERE ii.inventario_id = p_inventario_destino;
END;
$function$;

REVOKE ALL ON FUNCTION public.juntar_inventarios(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.juntar_inventarios(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.juntar_inventarios(uuid, uuid[]) IS
  'Soma os itens de vários inventários do mesmo vendedor no inventário de destino e APAGA as origens. Somente gerente.';
