-- 1) Consolidar TODAS as duplicatas existentes em itens_inventario
WITH dups AS (
  SELECT inventario_id, codigo_auxiliar,
         SUM(quantidade_fisica) as total,
         (SELECT id FROM public.itens_inventario ii2
          WHERE ii2.inventario_id = ii.inventario_id
            AND ii2.codigo_auxiliar = ii.codigo_auxiliar
          ORDER BY created_at ASC, id::text ASC
          LIMIT 1) as keep_id
  FROM public.itens_inventario ii
  GROUP BY inventario_id, codigo_auxiliar
  HAVING COUNT(*) > 1
)
UPDATE public.itens_inventario ii
SET quantidade_fisica = d.total
FROM dups d
WHERE ii.id = d.keep_id;

-- Deletar as duplicatas (mantém só o keep_id calculado acima — o registro mais antigo)
DELETE FROM public.itens_inventario ii
WHERE EXISTS (
  SELECT 1 FROM public.itens_inventario ii2
  WHERE ii2.inventario_id = ii.inventario_id
    AND ii2.codigo_auxiliar = ii.codigo_auxiliar
    AND ii2.id <> ii.id
    AND (ii2.created_at < ii.created_at
         OR (ii2.created_at = ii.created_at AND ii2.id::text < ii.id::text))
);

-- 2) Adicionar unique constraint para prevenir duplicatas futuras
ALTER TABLE public.itens_inventario
ADD CONSTRAINT itens_inventario_unique_sku UNIQUE (inventario_id, codigo_auxiliar);