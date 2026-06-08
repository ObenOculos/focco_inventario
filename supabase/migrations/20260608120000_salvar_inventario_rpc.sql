-- RPC atômico e idempotente para salvar/atualizar um inventário e seus itens.
--
-- Resolve dois problemas do fluxo antigo (delete + insert em chamadas separadas):
--   1) "itens_inventario_unique_sku" violado: SKUs duplicados gerados no cliente
--      são consolidados aqui via GROUP BY (soma das quantidades), nunca violando a
--      unique constraint (inventario_id, codigo_auxiliar).
--   2) Inventário vazio no banco: como tudo roda numa única transação, ou grava
--      tudo ou nada — nunca fica o registro do inventário sem os itens.
--
-- Idempotente: o id do inventário é fornecido pelo cliente. Reenviar o mesmo
-- payload (ex.: retry após queda de conexão) apenas reaplica o mesmo estado.

CREATE OR REPLACE FUNCTION public.salvar_inventario(
  p_inventario_id uuid,
  p_observacoes text,
  p_items jsonb,
  p_status public.inventory_status DEFAULT 'pendente'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_codigo text;
  v_existing_codigo text;
  v_existing_status public.inventory_status;
  v_found boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  SELECT codigo_vendedor INTO v_codigo
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'Você precisa ter um código de vendedor configurado.';
  END IF;

  -- Verifica se o inventário já existe (edição) ou não (criação)
  SELECT codigo_vendedor, status
  INTO v_existing_codigo, v_existing_status
  FROM public.inventarios
  WHERE id = p_inventario_id;
  v_found := FOUND;

  IF v_found THEN
    -- Edição: precisa pertencer ao vendedor e não estar aprovado
    IF v_existing_codigo <> v_codigo THEN
      RAISE EXCEPTION 'Inventário não encontrado ou você não tem permissão para editá-lo.';
    END IF;
    IF v_existing_status = 'aprovado' THEN
      RAISE EXCEPTION 'Este inventário já foi aprovado e não pode ser alterado.';
    END IF;
  ELSE
    -- Criação: garante no máximo um inventário ativo (pendente/revisão) por vendedor
    IF EXISTS (
      SELECT 1 FROM public.inventarios
      WHERE codigo_vendedor = v_codigo
        AND status IN ('pendente', 'revisao')
    ) THEN
      RAISE EXCEPTION 'Você já possui um inventário pendente ou em revisão. Edite-o ou aguarde a aprovação.';
    END IF;
  END IF;

  -- Upsert do inventário (idempotente pelo id fornecido)
  INSERT INTO public.inventarios (id, codigo_vendedor, user_id, observacoes, status)
  VALUES (p_inventario_id, v_codigo, v_user_id, p_observacoes, p_status)
  ON CONFLICT (id) DO UPDATE
    SET observacoes = EXCLUDED.observacoes,
        status = EXCLUDED.status,
        updated_at = now();

  -- Substitui os itens de forma atômica, consolidando códigos repetidos.
  -- O código é normalizado (trim + upper) para casar com a convenção usada na
  -- captura manual e evitar duplicatas por diferença de caixa.
  DELETE FROM public.itens_inventario WHERE inventario_id = p_inventario_id;

  INSERT INTO public.itens_inventario (inventario_id, codigo_auxiliar, nome_produto, quantidade_fisica)
  SELECT
    p_inventario_id,
    upper(trim(elem->>'codigo_auxiliar')),
    max(elem->>'nome_produto'),
    sum(COALESCE((elem->>'quantidade_fisica')::numeric, 0))
  FROM jsonb_array_elements(p_items) AS elem
  WHERE COALESCE(trim(elem->>'codigo_auxiliar'), '') <> ''
  GROUP BY upper(trim(elem->>'codigo_auxiliar'));

  RETURN p_inventario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_inventario(uuid, text, jsonb, public.inventory_status) TO authenticated;
