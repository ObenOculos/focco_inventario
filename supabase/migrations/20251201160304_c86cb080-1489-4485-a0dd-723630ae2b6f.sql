-- Adicionar colunas de empresa na tabela pedidos
ALTER TABLE public.pedidos 
ADD COLUMN codigo_empresa integer,
ADD COLUMN empresa text;

-- Criar índice único para evitar duplicatas considerando empresa
CREATE UNIQUE INDEX idx_pedidos_empresa_numero_tipo 
ON public.pedidos (codigo_empresa, numero_pedido, codigo_tipo);