-- Adicionar novos tipos de movimentação de estoque
-- Tipo 2: Venda (já existe)
-- Tipo 7: Remessa (já existe)  
-- Tipo 3: Devolução de Cliente (entrada)
-- Tipo 4: Devolução para Empresa (saída)
-- Tipo 5: Perda/Avaria (saída)
-- Tipo 6: Ajuste de Estoque (pode ser entrada ou saída)

-- Criar tabela para registrar movimentações avulsas de estoque
CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  codigo_vendedor TEXT NOT NULL,
  codigo_auxiliar TEXT NOT NULL,
  nome_produto TEXT,
  tipo_movimentacao INTEGER NOT NULL, -- 3, 4, 5, 6
  quantidade NUMERIC NOT NULL,
  motivo TEXT,
  observacoes TEXT,
  data_movimentacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_movimentacoes_estoque_vendedor ON public.movimentacoes_estoque(codigo_vendedor);
CREATE INDEX idx_movimentacoes_estoque_codigo ON public.movimentacoes_estoque(codigo_auxiliar);
CREATE INDEX idx_movimentacoes_estoque_data ON public.movimentacoes_estoque(data_movimentacao);

-- Habilitar RLS
ALTER TABLE public.movimentacoes_estoque ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Gerentes podem gerenciar movimentações"
  ON public.movimentacoes_estoque
  FOR ALL
  USING (get_user_role(auth.uid()) = 'gerente'::user_role);

CREATE POLICY "Vendedores podem ver suas movimentações"
  ON public.movimentacoes_estoque
  FOR SELECT
  USING (
    codigo_vendedor = get_user_codigo_vendedor(auth.uid()) 
    OR get_user_role(auth.uid()) = 'gerente'::user_role
  );

-- Comentários para documentação
COMMENT ON TABLE public.movimentacoes_estoque IS 'Registra movimentações de estoque como devoluções, perdas e ajustes';
COMMENT ON COLUMN public.movimentacoes_estoque.tipo_movimentacao IS '3=Devolução Cliente, 4=Devolução Empresa, 5=Perda/Avaria, 6=Ajuste';
COMMENT ON COLUMN public.movimentacoes_estoque.quantidade IS 'Positivo para entrada, negativo para saída';