

# Incluir itens não contados na pesquisa

## Problema
A pesquisa (`searchTerm`) filtra apenas o `tableData`, que só inclui itens não contados quando o filtro está em "nao_contados". Ao pesquisar com outro filtro ativo (ex: "com_diferenca"), os itens não contados nunca aparecem nos resultados.

## Solução

**Arquivo:** `src/pages/Conferencia.tsx`

### Alterar `tableData` (linhas ~157-171)
Quando há um `searchTerm` ativo, incluir os itens não contados junto com os itens filtrados, independentemente do filtro selecionado. Assim a pesquisa busca em todos os itens.

```typescript
const tableData = useMemo(() => {
  if (filtroResultado === 'nao_contados') {
    return itensNaoContados.map((item) => ({
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      estoque_teorico: item.estoque_teorico,
      quantidade_fisica: 0,
      diferenca: calcularDiferenca(item.estoque_teorico, 0),
      percentual: 0,
      tipo: 'falta' as const,
      nao_contado: true,
    }));
  }

  const contados = filteredDivergencias.map((item) => ({ ...item, nao_contado: false }));

  // Se há pesquisa ativa, incluir não contados para que apareçam nos resultados
  if (searchTerm.trim()) {
    const naoContados = itensNaoContados.map((item) => ({
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      estoque_teorico: item.estoque_teorico,
      quantidade_fisica: 0,
      diferenca: calcularDiferenca(item.estoque_teorico, 0),
      percentual: 0,
      tipo: 'falta' as const,
      nao_contado: true,
    }));
    return [...contados, ...naoContados];
  }

  return contados;
}, [filteredDivergencias, itensNaoContados, filtroResultado, searchTerm]);
```

1 arquivo, ~15 linhas adicionadas.

