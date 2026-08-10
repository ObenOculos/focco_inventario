-- Sincronização do catálogo de produtos a partir do ERP Ciclone.
--
-- O catálogo era mantido por upload manual de planilha. Com o gateway do Ciclone
-- no ar, passa a vir da fonte.
--
-- POR QUE STAGING E NÃO UPSERT DIRETO EM LOTES:
-- são ~3.700 produtos, grandes demais para uma requisição só, então o transporte
-- é fatiado em lotes de 1.000. Se cada lote gravasse direto em `produtos`, uma
-- falha no meio deixaria o catálogo metade novo e metade velho, sem ninguém saber
-- onde parou. Aqui os lotes caem numa área de espera e `concluir_` aplica tudo
-- numa transação: ou o catálogo inteiro avança, ou nada muda.

-- ── Situação do produto ──────────────────────────────────────────────────────
-- Produto inativado no Ciclone continua no catálogo, marcado. Apagar perderia
-- nome e valor de inventários antigos que referenciam o código.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.produtos.ativo IS
  'Situação no Ciclone (eqpdg_situacao). Produto some da origem => vira false, nunca DELETE: inventários antigos referenciam o codigo_auxiliar.';

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz;

COMMENT ON COLUMN public.produtos.sincronizado_em IS
  'Quando este produto veio do Ciclone pela última vez. NULL = originado do upload manual antigo.';

-- ── Área de espera dos lotes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.produtos_sincronizacao (
  sincronizacao_id uuid NOT NULL,
  codigo_auxiliar  text NOT NULL,
  codigo_produto   text NOT NULL,
  nome_produto     text NOT NULL,
  modelo           text NOT NULL,
  cor              text NOT NULL,
  valor_produto    numeric(10, 2),
  valor_remessa    numeric(10, 2),
  ativo            boolean NOT NULL DEFAULT true,
  PRIMARY KEY (sincronizacao_id, codigo_auxiliar)
);

COMMENT ON TABLE public.produtos_sincronizacao IS
  'Área de espera dos lotes de sincronização. Sempre vazia entre execuções — quem limpa é concluir_sincronizacao_produtos.';

ALTER TABLE public.produtos_sincronizacao ENABLE ROW LEVEL SECURITY;

-- Sem policy de propósito: só as funções SECURITY DEFINER abaixo tocam nesta
-- tabela. Nenhum cliente precisa lê-la ou escrevê-la diretamente.

-- ── 1. Abrir ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.iniciar_sincronizacao_produtos()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF get_user_role(auth.uid()) <> 'gerente' THEN
    RAISE EXCEPTION 'Apenas gerentes podem sincronizar produtos.';
  END IF;

  -- Restos de execuções interrompidas: sem isso a área de espera cresceria para
  -- sempre a cada falha de rede no meio do envio.
  DELETE FROM produtos_sincronizacao WHERE sincronizacao_id <> v_id;

  RETURN v_id;
END;
$$;

-- ── 2. Enviar um lote ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enviar_lote_produtos(
  p_sincronizacao_id uuid,
  p_produtos jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gravados integer;
BEGIN
  IF get_user_role(auth.uid()) <> 'gerente' THEN
    RAISE EXCEPTION 'Apenas gerentes podem sincronizar produtos.';
  END IF;

  INSERT INTO produtos_sincronizacao (
    sincronizacao_id, codigo_auxiliar, codigo_produto, nome_produto,
    modelo, cor, valor_produto, valor_remessa, ativo
  )
  SELECT
    p_sincronizacao_id,
    item->>'codigo_auxiliar',
    item->>'codigo_produto',
    item->>'nome_produto',
    item->>'modelo',
    item->>'cor',
    NULLIF(item->>'valor_produto', '')::numeric,
    NULLIF(item->>'valor_remessa', '')::numeric,
    COALESCE((item->>'ativo')::boolean, true)
  FROM jsonb_array_elements(p_produtos) AS item
  -- O mesmo código pode vir duas vezes (empresas 1 e 2 compartilham grade);
  -- fica o primeiro, e o lote não estoura na chave primária.
  ON CONFLICT (sincronizacao_id, codigo_auxiliar) DO NOTHING;

  GET DIAGNOSTICS v_gravados = ROW_COUNT;
  RETURN v_gravados;
END;
$$;

-- ── 3. Aplicar ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.concluir_sincronizacao_produtos(
  p_sincronizacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recebidos    integer;
  v_inseridos    integer;
  v_atualizados  integer;
  v_inativados   integer;
BEGIN
  IF get_user_role(auth.uid()) <> 'gerente' THEN
    RAISE EXCEPTION 'Apenas gerentes podem sincronizar produtos.';
  END IF;

  SELECT COUNT(*) INTO v_recebidos
  FROM produtos_sincronizacao WHERE sincronizacao_id = p_sincronizacao_id;

  -- Guarda contra aplicar um envio truncado por queda de rede: apagaria a
  -- situação de milhares de produtos com base em alguns poucos lotes.
  IF v_recebidos = 0 THEN
    RAISE EXCEPTION 'Nenhum produto recebido nesta sincronização.';
  END IF;

  SELECT COUNT(*) INTO v_inseridos
  FROM produtos_sincronizacao s
  WHERE s.sincronizacao_id = p_sincronizacao_id
    AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo_auxiliar = s.codigo_auxiliar);

  INSERT INTO produtos (
    codigo_auxiliar, codigo_produto, nome_produto, modelo, cor,
    valor_produto, valor_remessa, ativo, sincronizado_em
  )
  SELECT
    codigo_auxiliar, codigo_produto, nome_produto, modelo, cor,
    valor_produto, valor_remessa, ativo, now()
  FROM produtos_sincronizacao
  WHERE sincronizacao_id = p_sincronizacao_id
  ON CONFLICT (codigo_auxiliar) DO UPDATE SET
    codigo_produto  = EXCLUDED.codigo_produto,
    nome_produto    = EXCLUDED.nome_produto,
    modelo          = EXCLUDED.modelo,
    cor             = EXCLUDED.cor,
    valor_produto   = EXCLUDED.valor_produto,
    valor_remessa   = EXCLUDED.valor_remessa,
    ativo           = EXCLUDED.ativo,
    sincronizado_em = now(),
    updated_at      = now();

  v_atualizados := v_recebidos - v_inseridos;

  -- Produto que não veio nesta sincronização saiu do Ciclone (ou deixou de ser
  -- óculos). Vira inativo — nunca DELETE, porque inventários antigos referenciam
  -- o código e perderiam nome e valor.
  UPDATE produtos p
  SET ativo = false, updated_at = now()
  WHERE p.ativo
    AND NOT EXISTS (
      SELECT 1 FROM produtos_sincronizacao s
      WHERE s.sincronizacao_id = p_sincronizacao_id
        AND s.codigo_auxiliar = p.codigo_auxiliar
    );
  GET DIAGNOSTICS v_inativados = ROW_COUNT;

  DELETE FROM produtos_sincronizacao WHERE sincronizacao_id = p_sincronizacao_id;

  RETURN jsonb_build_object(
    'recebidos', v_recebidos,
    'inseridos', v_inseridos,
    'atualizados', v_atualizados,
    'inativados', v_inativados
  );
END;
$$;

-- ── Prévia ───────────────────────────────────────────────────────────────────
-- Conta o que a aplicação faria, sem escrever em `produtos`. Existe porque a
-- operação mexe no catálogo inteiro de uma vez e o custo de errar em silêncio é
-- alto — especialmente na primeira execução.
CREATE OR REPLACE FUNCTION public.previa_sincronizacao_produtos(
  p_sincronizacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recebidos   integer;
  v_inseridos   integer;
  v_alterados   integer;
  v_inativados  integer;
BEGIN
  IF get_user_role(auth.uid()) <> 'gerente' THEN
    RAISE EXCEPTION 'Apenas gerentes podem sincronizar produtos.';
  END IF;

  SELECT COUNT(*) INTO v_recebidos
  FROM produtos_sincronizacao WHERE sincronizacao_id = p_sincronizacao_id;

  SELECT COUNT(*) INTO v_inseridos
  FROM produtos_sincronizacao s
  WHERE s.sincronizacao_id = p_sincronizacao_id
    AND NOT EXISTS (SELECT 1 FROM produtos p WHERE p.codigo_auxiliar = s.codigo_auxiliar);

  -- "Alterado" é diferente de "atualizado": conta só quem muda de valor, para a
  -- prévia não dizer "3.700 atualizados" quando 3.600 vieram idênticos.
  SELECT COUNT(*) INTO v_alterados
  FROM produtos_sincronizacao s
  JOIN produtos p ON p.codigo_auxiliar = s.codigo_auxiliar
  WHERE s.sincronizacao_id = p_sincronizacao_id
    AND (p.nome_produto IS DISTINCT FROM s.nome_produto
      OR p.modelo IS DISTINCT FROM s.modelo
      OR p.cor IS DISTINCT FROM s.cor
      OR p.valor_produto IS DISTINCT FROM s.valor_produto
      OR p.valor_remessa IS DISTINCT FROM s.valor_remessa
      OR p.ativo IS DISTINCT FROM s.ativo);

  SELECT COUNT(*) INTO v_inativados
  FROM produtos p
  WHERE p.ativo
    AND NOT EXISTS (
      SELECT 1 FROM produtos_sincronizacao s
      WHERE s.sincronizacao_id = p_sincronizacao_id
        AND s.codigo_auxiliar = p.codigo_auxiliar
    );

  RETURN jsonb_build_object(
    'recebidos', v_recebidos,
    'inseridos', v_inseridos,
    'alterados', v_alterados,
    'inalterados', v_recebidos - v_inseridos - v_alterados,
    'inativados', v_inativados
  );
END;
$$;
