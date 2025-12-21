-- Popular a tabela estoque_real com dados dos inventários aprovados existentes
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
GROUP BY i.id, i.codigo_vendedor, ii.codigo_auxiliar, i.updated_at
ON CONFLICT (codigo_vendedor, codigo_auxiliar)
DO UPDATE SET
  quantidade_real = EXCLUDED.quantidade_real,
  inventario_id = EXCLUDED.inventario_id,
  data_atualizacao = EXCLUDED.data_atualizacao,
  updated_at = now();
