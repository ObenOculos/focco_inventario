

# Redesign dos filtros "Comparativo de Estoque"

## Problema
O layout atual com título + botão na primeira linha e três filtros na segunda linha ficou visualmente desagradável.

## Solução
Redesenhar como uma barra de filtros compacta e elegante, usando ícones para contexto visual:

### `src/pages/AnaliseInventario.tsx` (linhas 609-667)

1. **Título integrado ao CardHeader** sem separação artificial — título à esquerda, exportar à direita (como antes, mas com ícone only no mobile)
2. **Barra de filtros** como uma única linha com visual coeso:
   - Usar `CardDescription` ou uma div sutil abaixo do título
   - Ícones nos Selects: `AlertTriangle` para divergência, `TrendingUp`/`TrendingDown` para diferença
   - SearchFilter com `flex-1` para ocupar espaço restante
   - Selects com largura fixa (`w-48`) sem forçar `w-full` no mobile — usar `min-w-0` e truncation
3. **Em mobile** (`< sm`): filtros empilham via `flex-wrap` com `gap-2`, cada um `w-full`
4. **Em desktop**: tudo numa linha, filtros com larguras proporcionais, sem quebra forçada

Visual mais limpo: menos espaçamento vertical, filtros parecem parte integrada do card header.

1 arquivo alterado.

