

# Diferença condicional: Teórico negativo usa soma

## Problema
Quando o estoque teórico é negativo (ex: -2), a subtração `Físico - Teórico` dá `1 - (-2) = 3`, mas o usuário espera `-2 + 1 = -1`.

## Alteração

**Arquivo:** `src/pages/Conferencia.tsx`

### Função `calcularDiferenca` (linha ~78)
Adicionar condição: se teórico < 0, retornar `teórico + físico`; caso contrário, manter `físico - teórico`.

```typescript
const calcularDiferenca = (estoqueTeor: number, estoqFisico: number): number => {
  if (estoqueTeor < 0) {
    return estoqueTeor + estoqFisico;
  }
  return estoqFisico - estoqueTeor;
};
```

Como toda a página já usa essa função centralizada, a mudança se propaga automaticamente para: tabela, filtros, exportação Excel, resumo financeiro e estatísticas.

1 arquivo, 3 linhas alteradas.

