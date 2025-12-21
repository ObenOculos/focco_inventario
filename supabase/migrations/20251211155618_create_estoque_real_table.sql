-- Criar tabela para armazenar o estoque real (contagem física) dos vendedores
DO $$
BEGIN
  -- Verificar se a tabela já existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estoque_real') THEN
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
  ELSE
    -- Verificar e adicionar colunas se necessário
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_real' AND column_name = 'quantidade_real') THEN
      ALTER TABLE public.estoque_real ADD COLUMN quantidade_real numeric NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_real' AND column_name = 'data_atualizacao') THEN
      ALTER TABLE public.estoque_real ADD COLUMN data_atualizacao timestamptz DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_real' AND column_name = 'inventario_id') THEN
      ALTER TABLE public.estoque_real ADD COLUMN inventario_id uuid REFERENCES inventarios(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_real' AND column_name = 'created_at') THEN
      ALTER TABLE public.estoque_real ADD COLUMN created_at timestamptz DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_real' AND column_name = 'updated_at') THEN
      ALTER TABLE public.estoque_real ADD COLUMN updated_at timestamptz DEFAULT now();
    END IF;
  END IF;
END $$;

-- Adicionar índices para performance (só se não existirem)
CREATE INDEX IF NOT EXISTS idx_estoque_real_codigo_vendedor ON public.estoque_real(codigo_vendedor);
CREATE INDEX IF NOT EXISTS idx_estoque_real_codigo_auxiliar ON public.estoque_real(codigo_auxiliar);
CREATE INDEX IF NOT EXISTS idx_estoque_real_inventario_id ON public.estoque_real(inventario_id);

-- Habilitar Row Level Security (sempre tentar habilitar, não faz mal se já estiver)
ALTER TABLE public.estoque_real ENABLE ROW LEVEL SECURITY;

-- Remover políticas existentes se houver (para recriar)
DROP POLICY IF EXISTS "Vendedores podem ver seu próprio estoque real" ON public.estoque_real;
DROP POLICY IF EXISTS "Gerentes podem ver todos os estoques reais" ON public.estoque_real;
DROP POLICY IF EXISTS "Vendedores podem inserir seu próprio estoque real" ON public.estoque_real;
DROP POLICY IF EXISTS "Vendedores podem atualizar seu próprio estoque real" ON public.estoque_real;
DROP POLICY IF EXISTS "Gerentes podem gerenciar todos os estoques reais" ON public.estoque_real;

-- Recriar políticas
CREATE POLICY "Vendedores podem ver seu próprio estoque real" ON public.estoque_real
  FOR SELECT USING (
    auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor
  );

CREATE POLICY "Gerentes podem ver todos os estoques reais" ON public.estoque_real
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'gerente'
    )
  );

CREATE POLICY "Vendedores podem inserir seu próprio estoque real" ON public.estoque_real
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor
  );

CREATE POLICY "Vendedores podem atualizar seu próprio estoque real" ON public.estoque_real
  FOR UPDATE USING (
    auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor
  ) WITH CHECK (
    auth.jwt() ->> 'codigo_vendedor' = codigo_vendedor
  );

CREATE POLICY "Gerentes podem gerenciar todos os estoques reais" ON public.estoque_real
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'gerente'
    )
  );

-- Criar função handle_updated_at se não existir
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_estoque_real_updated_at ON public.estoque_real;
CREATE TRIGGER trigger_estoque_real_updated_at
  BEFORE UPDATE ON public.estoque_real
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
