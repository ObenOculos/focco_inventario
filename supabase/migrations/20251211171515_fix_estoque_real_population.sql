-- Script para verificar e corrigir a população do estoque real

-- 1. Verificar se a tabela estoque_real existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estoque_real') THEN
    RAISE NOTICE 'Tabela estoque_real não existe. Criando...';

    -- Criar tabela se não existir
    CREATE TABLE public.estoque_real (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo_vendedor text NOT NULL,
      codigo_auxiliar text NOT NULL,
      quantidade_real numeric NOT NULL DEFAULT 0,
      data_atualizacao timestamptz DEFAULT now(),
      inventario_id uuid REFERENCES inventarios(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(codigo_vendedor, codigo_auxiliar)
    );

    -- Adicionar índices
    CREATE INDEX IF NOT EXISTS idx_estoque_real_codigo_vendedor ON public.estoque_real(codigo_vendedor);
    CREATE INDEX IF NOT EXISTS idx_estoque_real_codigo_auxiliar ON public.estoque_real(codigo_auxiliar);
    CREATE INDEX IF NOT EXISTS idx_estoque_real_inventario_id ON public.estoque_real(inventario_id);

    -- Habilitar RLS
    ALTER TABLE public.estoque_real ENABLE ROW LEVEL SECURITY;

    -- Políticas RLS
    CREATE POLICY "Vendedores podem ver seu próprio estoque real" ON public.estoque_real
      FOR SELECT USING (auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor);

    CREATE POLICY "Gerentes podem ver todos os estoques reais" ON public.estoque_real
      FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'gerente'));

    CREATE POLICY "Vendedores podem inserir seu próprio estoque real" ON public.estoque_real
      FOR INSERT WITH CHECK (auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor);

    CREATE POLICY "Vendedores podem atualizar seu próprio estoque real" ON public.estoque_real
      FOR UPDATE USING (auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor)
      WITH CHECK (auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor);

    CREATE POLICY "Gerentes podem gerenciar todos os estoques reais" ON public.estoque_real
      FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'gerente'));

    RAISE NOTICE 'Tabela estoque_real criada com sucesso!';
  ELSE
    RAISE NOTICE 'Tabela estoque_real já existe.';
  END IF;
END $$;

-- Trigger para updated_at (criado fora do bloco DO para evitar conflitos)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_estoque_real_updated_at ON public.estoque_real;
CREATE TRIGGER trigger_estoque_real_updated_at
  BEFORE UPDATE ON public.estoque_real
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Popular a tabela com dados dos inventários aprovados existentes
INSERT INTO public.estoque_real (
  codigo_vendedor,
  codigo_auxiliar,
  quantidade_real,
  inventario_id,
  data_atualizacao
)
SELECT
  i.codigo_vendedor,
  ii.codigo_auxiliar,
  SUM(ii.quantidade_fisica) as quantidade_real,
  i.id as inventario_id,
  i.updated_at as data_atualizacao
FROM public.inventarios i
JOIN public.itens_inventario ii ON i.id = ii.inventario_id
WHERE i.status = 'aprovado'
  AND NOT EXISTS (
    SELECT 1 FROM public.estoque_real er
    WHERE er.inventario_id = i.id
    AND er.codigo_auxiliar = ii.codigo_auxiliar
  )
GROUP BY i.id, i.codigo_vendedor, ii.codigo_auxiliar, i.updated_at
ON CONFLICT (codigo_vendedor, codigo_auxiliar)
DO UPDATE SET
  quantidade_real = EXCLUDED.quantidade_real,
  inventario_id = EXCLUDED.inventario_id,
  data_atualizacao = EXCLUDED.data_atualizacao,
  updated_at = now();

-- 3. Criar funções necessárias (sempre, pois são CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.get_estoque_real_vendedor(p_codigo_vendedor text)
RETURNS TABLE (
  codigo_auxiliar text,
  quantidade_real numeric,
  data_atualizacao timestamptz,
  inventario_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    er.codigo_auxiliar,
    er.quantidade_real,
    er.data_atualizacao,
    er.inventario_id
  FROM public.estoque_real er
  WHERE er.codigo_vendedor = p_codigo_vendedor
  ORDER BY er.data_atualizacao DESC, er.codigo_auxiliar;
END;
$$;

CREATE OR REPLACE FUNCTION public.comparar_estoque_teorico_vs_real(p_codigo_vendedor text)
RETURNS TABLE (
  codigo_auxiliar text,
  nome_produto text,
  estoque_teorico numeric,
  estoque_real numeric,
  diferenca numeric,
  data_atualizacao_real timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH teorico AS (
    SELECT
      t.codigo_auxiliar,
      t.nome_produto,
      t.estoque_teorico
    FROM public.calcular_estoque_teorico_pos_inventario(p_codigo_vendedor) t
  ),
  real AS (
    SELECT
      er.codigo_auxiliar,
      er.quantidade_real,
      er.data_atualizacao
    FROM public.estoque_real er
    WHERE er.codigo_vendedor = p_codigo_vendedor
  ),
  produtos_unificados AS (
    SELECT t.codigo_auxiliar FROM teorico t
    UNION
    SELECT r.codigo_auxiliar FROM real r
  )
  SELECT
    pu.codigo_auxiliar,
    COALESCE(t.nome_produto, pu.codigo_auxiliar) as nome_produto,
    COALESCE(t.estoque_teorico, 0) as estoque_teorico,
    COALESCE(r.quantidade_real, 0) as estoque_real,
    (COALESCE(t.estoque_teorico, 0) - COALESCE(r.quantidade_real, 0)) as diferenca,
    r.data_atualizacao as data_atualizacao_real
  FROM produtos_unificados pu
  LEFT JOIN teorico t ON pu.codigo_auxiliar = t.codigo_auxiliar
  LEFT JOIN real r ON pu.codigo_auxiliar = r.codigo_auxiliar
  ORDER BY pu.codigo_auxiliar;
END;
$$;

-- 4. Mostrar resumo do que foi feito
SELECT
  'estoque_real' as tabela,
  COUNT(*) as registros
FROM public.estoque_real
UNION ALL
SELECT
  'inventarios_aprovados' as tabela,
  COUNT(*) as registros
FROM public.inventarios
WHERE status = 'aprovado';
