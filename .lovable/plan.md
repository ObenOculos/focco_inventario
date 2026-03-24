

# Remover card "Itens Não Contados" da Conferência

## Resumo

Remover o card expandível de "Itens Não Contados" da tela de detalhes. Os dados de itens não contados continuam sendo coletados e exportados no Excel (já existe lógica na linha 394), apenas o card visual será removido.

## Alterações

### `src/pages/Conferencia.tsx`

1. **Remover o bloco do card** (linhas 530-567) — todo o `{itensNaoContados.length > 0 && (<Card ...>)}`
2. **Remover estado `showItensNaoContados`** (linha 89) e seu setter nas linhas 131 e 535
3. **Remover imports não mais usados**: `PackageX`, `ChevronDown`, `ChevronUp` (verificar se usados em outro lugar do arquivo antes de remover)
4. Manter `itensNaoContados` e `setItensNaoContados` — ainda usados no export Excel e no cálculo

1 arquivo alterado.

