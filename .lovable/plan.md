

# Melhorar UX dos filtros no "Comparativo de Estoque"

## Problema

Os filtros (busca, divergência, diferença, exportar) estão em uma única linha flex que causa overflow em telas estreitas. São 4 elementos lado a lado que não cabem bem.

## Solução

Reorganizar os filtros em layout responsivo com wrap, garantindo que quebrem graciosamente:

### `src/pages/AnaliseInventario.tsx` (linhas 611-665)

1. **Primeira linha**: Título "Comparativo de Estoque" + botão Exportar (alinhado à direita)
2. **Segunda linha**: Filtros lado a lado com `flex-wrap` — SearchFilter, Select de divergência, Select de diferença
3. Em mobile: todos os filtros ocupam largura total (`w-full`), empilhando verticalmente
4. Em telas médias+: filtros ficam lado a lado com tamanhos fixos, quebrando linha se necessário via `flex-wrap`

Isso evita overflow horizontal e mantém os filtros acessíveis em qualquer viewport.

1 arquivo alterado, apenas reestruturação do layout dos filtros.

