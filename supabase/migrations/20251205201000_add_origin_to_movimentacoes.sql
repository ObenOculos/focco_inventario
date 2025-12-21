-- Adicionar colunas para rastrear a origem de uma movimentação de estoque
ALTER TABLE public.movimentacoes_estoque
ADD COLUMN origem_id UUID,
ADD COLUMN origem_tipo TEXT;

-- Adicionar um comentário para explicar as novas colunas
COMMENT ON COLUMN public.movimentacoes_estoque.origem_id IS 'O ID da entidade de origem (ex: o ID do inventário que gerou o ajuste)';
COMMENT ON COLUMN public.movimentacoes_estoque.origem_tipo IS 'O tipo da entidade de origem (ex: ''inventario_ajuste'')';

-- Opcional: Adicionar um índice se planeja consultar por origem frequentemente
CREATE INDEX idx_movimentacoes_origem ON public.movimentacoes_estoque(origem_id, origem_tipo);
