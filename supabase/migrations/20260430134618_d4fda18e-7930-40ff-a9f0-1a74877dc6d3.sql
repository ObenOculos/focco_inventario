-- 1. Fix itens_inventario SELECT policy — restrict to owner vendedor or gerente
DROP POLICY IF EXISTS "Users can view itens_inventario" ON public.itens_inventario;

CREATE POLICY "Vendedores and gerentes can view itens_inventario"
ON public.itens_inventario
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventarios i
    WHERE i.id = itens_inventario.inventario_id
      AND (
        i.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
        OR public.get_user_role(auth.uid()) = 'gerente'::user_role
      )
  )
);

-- 2. Restrict codigos_correcao SELECT to authenticated users only
DROP POLICY IF EXISTS "Everyone can view codigos_correcao" ON public.codigos_correcao;

CREATE POLICY "Authenticated users can view codigos_correcao"
ON public.codigos_correcao
FOR SELECT
TO authenticated
USING (true);

-- 3. Profiles — allow vendedores to update their own non-privileged fields,
-- but block role/codigo_vendedor/ativo escalation via WITH CHECK on existing gerente policy
-- and add a self-update policy with strict WITH CHECK
DROP POLICY IF EXISTS "Gerentes can update profiles" ON public.profiles;

CREATE POLICY "Gerentes can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.get_user_role(auth.uid()) = 'gerente'::user_role)
WITH CHECK (public.get_user_role(auth.uid()) = 'gerente'::user_role);

CREATE POLICY "Users can update own profile non-privileged fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- Prevent privilege escalation: critical fields must remain unchanged
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND codigo_vendedor IS NOT DISTINCT FROM (SELECT p.codigo_vendedor FROM public.profiles p WHERE p.id = auth.uid())
  AND ativo = (SELECT p.ativo FROM public.profiles p WHERE p.id = auth.uid())
  AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
);

-- 4. Harden atualizar_valores_produtos with input validation
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
$function$;