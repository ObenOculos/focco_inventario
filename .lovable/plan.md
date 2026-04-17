
## Diagnóstico confirmado

O produto `OB6442 A01` no inventário do Heleno (`c1bfd5f2-798f-4d49-9e24-3ff03203397e`) está em **duas linhas separadas** em `itens_inventario`, cada uma com quantidade 1. Isso explica a diferença:

- **Conferencia.tsx**: conta linhas → 727 produtos
- **Pedidos.tsx / estoque_real**: agrupa por `codigo_auxiliar` (SUM) → 726 produtos, 773 unidades (soma correta: 1+1=2)

## Plano de correção

Três frentes para resolver a causa raiz e evitar recorrência:

### 1. Consolidar a linha duplicada do Heleno (data fix)
Migração que apaga uma das duas linhas duplicadas (mantém o registro mais antigo, deleta o mais recente). Quantidade total preservada porque a outra linha continua com 1 unidade — mas espere, **as duas linhas somam 2 unidades**, e o `estoque_real` registrou 2 unidades para esse SKU. Então a consolidação correta é:
- Manter 1 linha com `quantidade_fisica = 2` (soma das duas)
- Deletar a outra linha

```sql
-- Atualiza a primeira linha com a soma
UPDATE itens_inventario 
SET quantidade_fisica = 2
WHERE id = '4c4d3620-d9d6-4acf-a7d6-f2e11ec6b721';

-- Deleta a duplicata
DELETE FROM itens_inventario 
WHERE id = 'a78a05f8-b74a-40ff-a8fa-8cac26d6d7b9';
```

### 2. Ajustar `Conferencia.tsx` para contar SKUs distintos
Trocar `divergencias.length` por contagem de `codigo_auxiliar` únicos nos cards de estatística, pra ficar consistente com o resto do sistema (que sempre agrupa por SKU).

### 3. Prevenir duplicatas futuras
Adicionar **unique constraint** em `itens_inventario(inventario_id, codigo_auxiliar)` + ajustar o código de scan/save para usar **UPSERT** (somar quantidades em vez de inserir nova linha quando o SKU já existe).

Migração:
```sql
-- Antes da constraint, consolidar TODAS as duplicatas existentes (não só Heleno)
WITH dups AS (
  SELECT inventario_id, codigo_auxiliar, SUM(quantidade_fisica) as total,
         MIN(id) as keep_id
  FROM itens_inventario
  GROUP BY inventario_id, codigo_auxiliar
  HAVING COUNT(*) > 1
)
UPDATE itens_inventario ii
SET quantidade_fisica = d.total
FROM dups d
WHERE ii.id = d.keep_id;

DELETE FROM itens_inventario ii
WHERE EXISTS (
  SELECT 1 FROM itens_inventario ii2
  WHERE ii2.inventario_id = ii.inventario_id
    AND ii2.codigo_auxiliar = ii.codigo_auxiliar
    AND ii2.id < ii.id
);

ALTER TABLE itens_inventario 
ADD CONSTRAINT itens_inventario_unique_sku 
UNIQUE (inventario_id, codigo_auxiliar);
```

Código (provavelmente `Inventario.tsx`): trocar `.insert()` por `.upsert(..., { onConflict: 'inventario_id,codigo_auxiliar' })` somando a quantidade.

## Arquivos afetados
- 1 migração SQL (consolida duplicatas + adiciona constraint)
- `src/pages/Conferencia.tsx` (contagem de SKUs distintos)
- `src/pages/Inventario.tsx` (UPSERT no save de itens — preciso inspecionar antes pra ajustar exatamente)

## Resultado esperado
- Heleno: 726 produtos / 773 unidades em todos os lugares (Conferência, Pedidos, EstoqueReal)
- Nenhum inventário futuro pode ter SKU duplicado em linhas separadas
- Se vendedor escanear o mesmo SKU 2x, soma na linha existente
