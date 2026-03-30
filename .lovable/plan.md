

# Remover página Análise de Inventário e absorver na Conferência

## Resumo

Eliminar `AnaliseInventario.tsx` e migrar seus recursos exclusivos para `Conferencia.tsx`. A Conferência passará a mostrar **todos** os inventários (não só pendentes) e ganhará os filtros e funcionalidades que só existiam na Análise.

## Recursos a migrar para Conferência

1. **Filtro por vendedor** — Select de vendedores no topo da lista (apenas para gerentes)
2. **Mostrar todos os status** — Hoje filtra só pendente/revisão; passará a mostrar também aprovados
3. **Filtros granulares na tabela** — Filtro de divergência (com/sem/positiva/negativa/não contados) e filtro de diferença (positiva/negativa/zero)
4. **Export com custo** — Buscar `valor_produto` dos produtos e incluir coluna "Custo Produto" no Excel
5. **Excluir inventário inteiro** — Botão de exclusão do inventário (não só de itens individuais)
6. **Botão Aprovar simplificado** — Manter o fluxo atual de aprovar + o novo de excluir no mesmo card de ações

## Alterações por arquivo

### `src/pages/Conferencia.tsx`
- Substituir `useInventariosPendentesQuery` por uma query que busca todos os inventários (ou adicionar parâmetro de status)
- Adicionar `useVendedoresSimpleQuery` para o filtro por vendedor
- Adicionar states: `selectedVendedor`, `divergenceFilter`, `diferencaFilter`, `showDeleteDialog`
- Na tela de lista: adicionar Select de vendedor antes dos cards
- Na tela de detalhes: substituir o filtro simples (ok/sobra/falta) pelos filtros granulares de divergência + diferença
- Adicionar botão "Excluir Inventário" ao lado dos botões de ação do gerente
- Atualizar export Excel para buscar custos em lotes e incluir coluna "Custo Produto"
- Badges de status: mostrar "Aprovado" em verde além de Revisão/Pendente

### `src/hooks/useConferenciaQuery.ts`
- Remover filtro `.in('status', ['pendente', 'revisao'])` ou torná-lo opcional via parâmetro
- Adicionar filtro por `codigo_vendedor` quando selecionado

### `src/App.tsx`
- Remover import e rota de `/analise-inventario`

### `src/components/layout/AppLayout.tsx`
- Remover link "Análise de Inventário" do menu de gerente

### Arquivos a excluir
- `src/pages/AnaliseInventario.tsx`
- `src/hooks/useAnaliseInventarioQuery.ts`
- Remover `AnaliseInventarioSkeleton` de `src/components/skeletons/PageSkeleton.tsx`

## Resultado

Uma única página "Conferência" que serve tanto para conferir/aprovar inventários pendentes quanto para consultar o histórico completo com filtros avançados. ~6 arquivos alterados, 2 excluídos.

