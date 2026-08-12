drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.atualizar_valores_produtos(p_updates jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer := 0;
  v_item jsonb;
  v_has_venda boolean;
  v_has_remessa boolean;
  v_codigo text;
  v_valor_venda numeric;
  v_valor_remessa numeric;
  v_max_value constant numeric := 10000000; -- 10 million cap
BEGIN
  -- Authorization: only gerentes can bulk update prices
  IF public.get_user_role(auth.uid()) IS DISTINCT FROM 'gerente'::user_role THEN
    RAISE EXCEPTION 'Acesso negado: apenas gerentes podem atualizar valores de produtos';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates deve ser um array JSON';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    -- Validate codigo presence
    IF NOT (v_item ? 'codigo') OR (v_item->>'codigo') IS NULL OR length(trim(v_item->>'codigo')) = 0 THEN
      RAISE EXCEPTION 'Item inválido: campo "codigo" ausente ou vazio';
    END IF;
    v_codigo := v_item->>'codigo';

    v_has_venda := (v_item ? 'valor') AND (v_item->>'valor') IS NOT NULL;
    v_has_remessa := (v_item ? 'valor_remessa') AND (v_item->>'valor_remessa') IS NOT NULL;

    IF NOT v_has_venda AND NOT v_has_remessa THEN
      CONTINUE;
    END IF;

    -- Validate numeric format and bounds for valor
    IF v_has_venda THEN
      IF NOT (v_item->>'valor' ~ '^[0-9]+(\.[0-9]+)?$') THEN
        RAISE EXCEPTION 'Valor inválido para código %: "%"', v_codigo, v_item->>'valor';
      END IF;
      v_valor_venda := (v_item->>'valor')::numeric;
      IF v_valor_venda < 0 OR v_valor_venda > v_max_value THEN
        RAISE EXCEPTION 'Valor fora do intervalo permitido para código %: %', v_codigo, v_valor_venda;
      END IF;
    END IF;

    -- Validate numeric format and bounds for valor_remessa
    IF v_has_remessa THEN
      IF NOT (v_item->>'valor_remessa' ~ '^[0-9]+(\.[0-9]+)?$') THEN
        RAISE EXCEPTION 'Valor remessa inválido para código %: "%"', v_codigo, v_item->>'valor_remessa';
      END IF;
      v_valor_remessa := (v_item->>'valor_remessa')::numeric;
      IF v_valor_remessa < 0 OR v_valor_remessa > v_max_value THEN
        RAISE EXCEPTION 'Valor remessa fora do intervalo permitido para código %: %', v_codigo, v_valor_remessa;
      END IF;
    END IF;

    UPDATE produtos
    SET
      valor_produto = CASE WHEN v_has_venda THEN v_valor_venda ELSE valor_produto END,
      valor_remessa = CASE WHEN v_has_remessa THEN v_valor_remessa ELSE valor_remessa END,
      updated_at = now()
    WHERE codigo_auxiliar = v_codigo;

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_codigo_vendedor(user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT codigo_vendedor
  FROM public.profiles
  WHERE id = user_id
    AND user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
 RETURNS public.user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.profiles
  WHERE id = user_id
    AND user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, nome, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.email),
    'vendedor'  -- always vendedor; gerentes are promoted manually
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.juntar_inventarios(p_inventario_destino uuid, p_inventarios_origem uuid[])
 RETURNS TABLE(destino_id uuid, total_produtos bigint, total_unidades numeric, absorvidos integer)
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
$function$
;

grant delete on table "public"."codigos_correcao" to "anon";

grant insert on table "public"."codigos_correcao" to "anon";

grant select on table "public"."codigos_correcao" to "anon";

grant update on table "public"."codigos_correcao" to "anon";

grant delete on table "public"."codigos_correcao" to "authenticated";

grant insert on table "public"."codigos_correcao" to "authenticated";

grant select on table "public"."codigos_correcao" to "authenticated";

grant update on table "public"."codigos_correcao" to "authenticated";

grant delete on table "public"."codigos_correcao" to "service_role";

grant insert on table "public"."codigos_correcao" to "service_role";

grant select on table "public"."codigos_correcao" to "service_role";

grant update on table "public"."codigos_correcao" to "service_role";

grant delete on table "public"."inventarios" to "anon";

grant insert on table "public"."inventarios" to "anon";

grant select on table "public"."inventarios" to "anon";

grant update on table "public"."inventarios" to "anon";

grant delete on table "public"."inventarios" to "authenticated";

grant insert on table "public"."inventarios" to "authenticated";

grant select on table "public"."inventarios" to "authenticated";

grant update on table "public"."inventarios" to "authenticated";

grant delete on table "public"."inventarios" to "service_role";

grant insert on table "public"."inventarios" to "service_role";

grant select on table "public"."inventarios" to "service_role";

grant update on table "public"."inventarios" to "service_role";

grant delete on table "public"."itens_inventario" to "anon";

grant insert on table "public"."itens_inventario" to "anon";

grant select on table "public"."itens_inventario" to "anon";

grant update on table "public"."itens_inventario" to "anon";

grant delete on table "public"."itens_inventario" to "authenticated";

grant insert on table "public"."itens_inventario" to "authenticated";

grant select on table "public"."itens_inventario" to "authenticated";

grant update on table "public"."itens_inventario" to "authenticated";

grant delete on table "public"."itens_inventario" to "service_role";

grant insert on table "public"."itens_inventario" to "service_role";

grant select on table "public"."itens_inventario" to "service_role";

grant update on table "public"."itens_inventario" to "service_role";

grant delete on table "public"."produtos" to "anon";

grant insert on table "public"."produtos" to "anon";

grant select on table "public"."produtos" to "anon";

grant update on table "public"."produtos" to "anon";

grant delete on table "public"."produtos" to "authenticated";

grant insert on table "public"."produtos" to "authenticated";

grant select on table "public"."produtos" to "authenticated";

grant update on table "public"."produtos" to "authenticated";

grant delete on table "public"."produtos" to "service_role";

grant insert on table "public"."produtos" to "service_role";

grant select on table "public"."produtos" to "service_role";

grant update on table "public"."produtos" to "service_role";

grant delete on table "public"."produtos_sincronizacao" to "anon";

grant insert on table "public"."produtos_sincronizacao" to "anon";

grant select on table "public"."produtos_sincronizacao" to "anon";

grant update on table "public"."produtos_sincronizacao" to "anon";

grant delete on table "public"."produtos_sincronizacao" to "authenticated";

grant insert on table "public"."produtos_sincronizacao" to "authenticated";

grant select on table "public"."produtos_sincronizacao" to "authenticated";

grant update on table "public"."produtos_sincronizacao" to "authenticated";

grant delete on table "public"."produtos_sincronizacao" to "service_role";

grant insert on table "public"."produtos_sincronizacao" to "service_role";

grant select on table "public"."produtos_sincronizacao" to "service_role";

grant update on table "public"."produtos_sincronizacao" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


  create policy "Authenticated users can receive broadcasts"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Authenticated users can send broadcasts"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (true);



