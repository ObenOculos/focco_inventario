

# Clarificar Produtos vs Unidades nos cards de inventário

## Problema

Nos cards da lista de inventários, a informação mostrada é ambígua:
- **Conferência**: mostra "X itens" (soma de `quantidade_fisica`), mas não distingue entre quantidade de produtos distintos e total de unidades
- **Análise**: não mostra nenhuma contagem — só data

O usuário quer ver algo como: **738 produtos · 779 unidades**

## Alterações

### 1. `src/pages/Conferencia.tsx` (~linhas 474-482)

Substituir a linha que mostra apenas o total de unidades por duas informações:
- **Produtos**: `inv.itens_inventario.length` (quantidade de SKUs/linhas)
- **Unidades**: `inv.itens_inventario.reduce(sum + quantidade_fisica)` (soma total)

Formato: `738 produtos · 779 un.`

### 2. `src/hooks/useAnaliseInventarioQuery.ts`

Adicionar `itens_inventario(codigo_auxiliar, quantidade_fisica)` ao select da query para trazer os itens junto com cada inventário. Atualizar a interface `InventarioInfo` para incluir:
```
total_produtos: number;
total_unidades: number;
```
Calcular esses valores no mapeamento dos dados (sem trazer todos os campos dos itens — apenas o necessário para a contagem).

### 3. `src/pages/AnaliseInventario.tsx` (~linhas 479-485)

Adicionar no `CardContent` a mesma informação de produtos e unidades, usando os novos campos de `InventarioInfo`.

3 arquivos alterados.

