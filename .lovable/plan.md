

# Análise de Inventário: layout de duas telas (como Conferência)

## O que muda

Atualmente a página usa um Card com dropdowns (Select) para escolher inventário. O usuário quer o mesmo padrão da Conferência: duas telas alternando no mesmo espaço.

- **Tela 1**: Lista de inventários como cards clicáveis (com filtro de vendedor para gerente), ocupando tela cheia
- **Tela 2**: Detalhes do inventário selecionado (estatísticas, tabela comparativa, ações do gerente), com botão "Voltar para lista"

## Alterações

### `src/pages/AnaliseInventario.tsx`

1. **Remover o Card "Selecione o Inventário"** com os dropdowns Select
2. **Tela 1 — Lista de inventários**:
   - Filtro de vendedor no topo (para gerente)
   - Grid de cards clicáveis mostrando: número do inventário, data, vendedor, status (badge)
   - Ao clicar, seta `selectedInventario` e vai para a Tela 2
3. **Tela 2 — Detalhes**:
   - Botão "Voltar para lista" no topo que faz `setSelectedInventario(null)` e limpa estados
   - Info do inventário selecionado (vendedor, data, status) como header
   - Todo o conteúdo atual: DivergenciaStats, ações do gerente, tabela comparativa
4. **Remover auto-select** do primeiro inventário (useEffect linha 165-169) — agora o usuário escolhe clicando

### `src/components/skeletons/PageSkeleton.tsx`

- Atualizar `ConferenciaSkeleton` (se compartilhado) ou manter como está — impacto mínimo

1 arquivo principal alterado.

