-- Atributos de produto vindos do Ciclone: marca, tipo, subtipo, grupo e nome da cor.
--
-- POR QUE AGORA: o comparativo passa a ter uma leitura gerencial que agrupa a
-- divergência por categoria ("quanto está faltando de OBEN receituário metal"), e
-- hoje o catálogo do app não sabe responder isso — guarda só código, nome, modelo
-- e cor, todos por produto individual.
--
-- ── O que cada campo é, no Ciclone ───────────────────────────────────────────
--   marca    ← eq_colecao.eqcol_descricao        (OBEN, POWER, CORE EYES, POPULAR)
--   tipo     ← eq_tipoproduto.eqtpr_descricao    (OCULOS RECEITUARIO, OCULOS SOLAR)
--   subtipo  ← eq_grupoespecifico.eqgru_descricao (FEMININO, MASCULINO, DIVERSOS)
--   grupo    ← eq_grupogenerico.eqgrg_descricao   (ACETATO, METAL, DIVERSOS)
--   cor_nome ← eq_corespecifica.eqcor_nome        (PRETO BRILHO, AZUL FOSCO…)
--
-- MARCA E COLEÇÃO SÃO O MESMO CAMPO. No Ciclone não existe cadastro de marca: as
-- marcas da casa estão cadastradas como COLEÇÃO, e é por isso que o relatório do
-- próprio ERP se chama "Análise de Estoque por Coleção Marca". Uma coluna só, com
-- o nome que o negócio usa. Se um dia houver coleção de verdade (safra, estação),
-- ela entra como coluna nova — não como reinterpretação desta.
--
-- ── Por que nullable ─────────────────────────────────────────────────────────
-- Os cinco campos têm 100% de cobertura no Ciclone hoje, mas `produtos` guarda
-- também o resíduo do upload manual antigo, que nunca terá esses dados. NOT NULL
-- exigiria inventar um valor para linhas históricas; NULL diz a verdade — "esta
-- linha nunca foi sincronizada" — e a tela agrupa como "Sem categoria".

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS marca    text,
  ADD COLUMN IF NOT EXISTS tipo     text,
  ADD COLUMN IF NOT EXISTS subtipo  text,
  ADD COLUMN IF NOT EXISTS grupo    text,
  ADD COLUMN IF NOT EXISTS cor_nome text;

COMMENT ON COLUMN public.produtos.marca IS
  'Marca comercial (eq_colecao.eqcol_descricao). No Ciclone marca e coleção são o MESMO cadastro. NULL = produto do upload manual antigo, nunca sincronizado.';
COMMENT ON COLUMN public.produtos.tipo IS
  'Tipo de produto (eq_tipoproduto.eqtpr_descricao): OCULOS RECEITUARIO ou OCULOS SOLAR.';
COMMENT ON COLUMN public.produtos.subtipo IS
  'Grupo específico do Ciclone (eq_grupoespecifico.eqgru_descricao): FEMININO/MASCULINO/DIVERSOS.';
COMMENT ON COLUMN public.produtos.grupo IS
  'Grupo genérico do Ciclone (eq_grupogenerico.eqgrg_descricao) — na prática o material: ACETATO/METAL.';
COMMENT ON COLUMN public.produtos.cor_nome IS
  'Nome da cor (eq_corespecifica.eqcor_nome). A coluna `cor` continua guardando o CÓDIGO (A01) — é ele que forma o codigo_auxiliar, e trocar quebraria o encontro com o ERP.';

-- Índice só na marca: é o primeiro nível do agrupamento gerencial e o único com
-- seletividade útil (4 valores sobre 3.700 produtos ainda divide o conjunto). Tipo,
-- subtipo e grupo têm 2-3 valores cada — um índice ali seria varrido de qualquer jeito.
CREATE INDEX IF NOT EXISTS idx_produtos_marca ON public.produtos (marca);

-- ── Área de espera dos lotes ─────────────────────────────────────────────────
ALTER TABLE public.produtos_sincronizacao
  ADD COLUMN IF NOT EXISTS marca    text,
  ADD COLUMN IF NOT EXISTS tipo     text,
  ADD COLUMN IF NOT EXISTS subtipo  text,
  ADD COLUMN IF NOT EXISTS grupo    text,
  ADD COLUMN IF NOT EXISTS cor_nome text;

-- ── 2. Enviar um lote ────────────────────────────────────────────────────────
-- CREATE OR REPLACE sem DROP: assinatura e tipo de retorno não mudam.
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
    modelo, cor, valor_produto, valor_remessa, ativo,
    marca, tipo, subtipo, grupo, cor_nome
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
    COALESCE((item->>'ativo')::boolean, true),
    -- NULLIF com string vazia: o gateway manda '' para atributo ausente, e '' e NULL
    -- agrupariam como duas categorias distintas na tela.
    NULLIF(item->>'marca', ''),
    NULLIF(item->>'tipo', ''),
    NULLIF(item->>'subtipo', ''),
    NULLIF(item->>'grupo', ''),
    NULLIF(item->>'cor_nome', '')
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
    valor_produto, valor_remessa, ativo, sincronizado_em,
    marca, tipo, subtipo, grupo, cor_nome
  )
  SELECT
    codigo_auxiliar, codigo_produto, nome_produto, modelo, cor,
    valor_produto, valor_remessa, ativo, now(),
    marca, tipo, subtipo, grupo, cor_nome
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
    marca           = EXCLUDED.marca,
    tipo            = EXCLUDED.tipo,
    subtipo         = EXCLUDED.subtipo,
    grupo           = EXCLUDED.grupo,
    cor_nome        = EXCLUDED.cor_nome,
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
  --
  -- Os cinco atributos entram aqui: sem eles, a PRIMEIRA sincronização depois desta
  -- migration diria "0 alterados" e preencheria 3.700 linhas mesmo assim — a prévia
  -- existe justamente para essa operação não surpreender.
  SELECT COUNT(*) INTO v_alterados
  FROM produtos_sincronizacao s
  JOIN produtos p ON p.codigo_auxiliar = s.codigo_auxiliar
  WHERE s.sincronizacao_id = p_sincronizacao_id
    AND (p.nome_produto IS DISTINCT FROM s.nome_produto
      OR p.modelo IS DISTINCT FROM s.modelo
      OR p.cor IS DISTINCT FROM s.cor
      OR p.valor_produto IS DISTINCT FROM s.valor_produto
      OR p.valor_remessa IS DISTINCT FROM s.valor_remessa
      OR p.ativo IS DISTINCT FROM s.ativo
      OR p.marca IS DISTINCT FROM s.marca
      OR p.tipo IS DISTINCT FROM s.tipo
      OR p.subtipo IS DISTINCT FROM s.subtipo
      OR p.grupo IS DISTINCT FROM s.grupo
      OR p.cor_nome IS DISTINCT FROM s.cor_nome);

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
