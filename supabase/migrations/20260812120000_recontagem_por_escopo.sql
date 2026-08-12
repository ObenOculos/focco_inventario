-- Recontagem: a contagem anterior vira referência persistida, não memória de tela.
--
-- POR QUÊ ESTA COLUNA: `salvar_inventario` substitui os itens (DELETE + INSERT), então
-- assim que o vendedor envia a primeira recontagem parcial a contagem original DEIXA DE
-- EXISTIR em qualquer lugar. Sem persistir a referência, "Anterior 1 → Nova 2" morre no
-- primeiro reload da página, na troca de aparelho e no envio por marca — e o gerente
-- perde a única evidência do que mudou entre a reprovação e o reenvio.
--
-- SEMÂNTICA: `quantidade_anterior` é o que estava GRAVADO quando o vendedor começou a
-- recontagem daquele recorte. NULL = produto nunca recontado. Recontar de novo o mesmo
-- recorte recaptura a referência a partir do valor salvo, de modo que "anterior" nunca
-- signifique "duas rodadas atrás" — que seria um número que o vendedor não reconhece.
--
-- Quem decide a referência é o cliente (ele é dono da lista inteira); o RPC apenas a
-- repassa, continuando burro e idempotente.

ALTER TABLE public.itens_inventario
  ADD COLUMN IF NOT EXISTS quantidade_anterior DECIMAL(10,5);

COMMENT ON COLUMN public.itens_inventario.quantidade_anterior IS
  'Contagem gravada imediatamente antes da recontagem deste item. NULL = nunca recontado.';

-- Mesma função de antes, com um campo a mais atravessando o payload.
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

  INSERT INTO public.itens_inventario (
    inventario_id, codigo_auxiliar, nome_produto, quantidade_fisica, quantidade_anterior
  )
  SELECT
    p_inventario_id,
    upper(trim(elem->>'codigo_auxiliar')),
    max(elem->>'nome_produto'),
    sum(COALESCE((elem->>'quantidade_fisica')::numeric, 0)),
    -- `max` e não `sum`: a quantidade de duas linhas do mesmo SKU se soma, mas a
    -- referência de contagem é um valor só do produto — somá-la inventaria estoque
    -- anterior que nunca existiu.
    max((elem->>'quantidade_anterior')::numeric)
  FROM jsonb_array_elements(p_items) AS elem
  WHERE COALESCE(trim(elem->>'codigo_auxiliar'), '') <> ''
  GROUP BY upper(trim(elem->>'codigo_auxiliar'));

  RETURN p_inventario_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_inventario(uuid, text, jsonb, public.inventory_status) TO authenticated;
