ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS valor_remessa numeric DEFAULT 0;

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
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_has_venda := (v_item ? 'valor') AND (v_item->>'valor') IS NOT NULL;
    v_has_remessa := (v_item ? 'valor_remessa') AND (v_item->>'valor_remessa') IS NOT NULL;

    IF NOT v_has_venda AND NOT v_has_remessa THEN
      CONTINUE;
    END IF;

    UPDATE produtos
    SET
      valor_produto = CASE WHEN v_has_venda THEN (v_item->>'valor')::numeric ELSE valor_produto END,
      valor_remessa = CASE WHEN v_has_remessa THEN (v_item->>'valor_remessa')::numeric ELSE valor_remessa END,
      updated_at = now()
    WHERE codigo_auxiliar = v_item->>'codigo';

    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$function$;