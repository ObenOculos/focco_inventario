

# Atualizar skeletons de loading para layout novo

## Problema

O `ConferenciaSkeleton` em `PageSkeleton.tsx` ainda usa o layout antigo com `grid-cols-3` e `border-l-2` (split-view). A página de Conferência foi refatorada para tela única, e a de Análise de Inventário segue o mesmo padrão, mas não tem skeleton dedicado — mostra conteúdo vazio durante o carregamento inicial.

## Alterações

### `src/components/skeletons/PageSkeleton.tsx`

1. **Atualizar `ConferenciaSkeleton`**: Remover o grid de colunas e renderizar skeleton de cards empilhados (3 cards com título, badge, data e vendedor), simulando a Tela 1 (lista de inventários). Sem `grid-cols-3`, sem `border-l-2`.

2. **Criar `AnaliseInventarioSkeleton`**: Skeleton similar ao de Conferência — header com título, filtro de vendedor (skeleton de Select), e grid de cards representando inventários. Reflete a Tela 1 da página atual.

### `src/pages/AnaliseInventario.tsx`

3. **Adicionar estado de loading inicial**: Destructure `isLoading` dos hooks `useInventariosAnaliseQuery` e `useVendedoresSimpleQuery`, e mostrar o novo `AnaliseInventarioSkeleton` enquanto os dados iniciais carregam (antes de renderizar a lista vazia).

3 arquivos alterados.

