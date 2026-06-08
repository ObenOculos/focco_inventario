-- Função para atualizar valores de produtos em lote
CREATE OR REPLACE FUNCTION atualizar_valores_produtos(
  p_updates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated integer := 0;
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE produtos
    SET valor_produto = (v_item->>'valor')::numeric,
        updated_at = now()
    WHERE codigo_auxiliar = v_item->>'codigo';
    
    IF FOUND THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  
  RETURN v_updated;
END;
$$;