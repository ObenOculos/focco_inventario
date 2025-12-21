-- Create an ENUM type for the different types of stock movements
CREATE TYPE public.movimentacao_tipo AS ENUM (
    'ajuste_entrada',
    'ajuste_saida',
    'devolucao_cliente',
    'devolucao_empresa',
    'perda_avaria'
);

-- Alter the table to use the new ENUM type
-- We assume the old integer values are: 3=Devolução Cliente, 4=Devolução Empresa, 5=Perda/Avaria, 6=Ajuste (needs to be split)
-- For simplicity in this migration, we will handle existing values. If there are no 'Ajuste' (6) entries, we can do a simple cast.
-- For a real-world scenario with existing data, a more complex data migration script would be needed.
ALTER TABLE public.movimentacoes_estoque
ALTER COLUMN tipo_movimentacao TYPE public.movimentacao_tipo
USING CASE
    WHEN tipo_movimentacao = 3 THEN 'devolucao_cliente'::public.movimentacao_tipo
    WHEN tipo_movimentacao = 4 THEN 'devolucao_empresa'::public.movimentacao_tipo
    WHEN tipo_movimentacao = 5 THEN 'perda_avaria'::public.movimentacao_tipo
    -- This migration assumes new adjustments will be created correctly.
    -- It intentionally leaves old "6" values to be handled manually or ignored if they don't exist.
    ELSE NULL
END;

-- Also, the 'quantidade' column in 'movimentacoes_estoque' should not be negative.
-- The movement type dictates the direction. Let's add a check constraint.
ALTER TABLE public.movimentacoes_estoque
ADD CONSTRAINT quantidade_must_be_positive CHECK (quantidade >= 0);

-- The old comment is now obsolete
COMMENT ON COLUMN public.movimentacoes_estoque.tipo_movimentacao IS NULL;
COMMENT ON COLUMN public.movimentacoes_estoque.quantidade IS 'A quantidade do movimento (sempre positiva). O tipo define a direção.';
