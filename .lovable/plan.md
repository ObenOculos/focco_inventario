

# Calcular débito do vendedor na Conferência

## Objetivo

Ao abrir o detalhe de um inventário, calcular e exibir o **valor monetário que o vendedor deve à empresa** — ou seja, somar `|diferença| × custo_unitário` para todos os itens com **falta** (diferença negativa).

## Como funciona

- Os dados de diferença já existem em `divergencias[]` (itens contados) e `itensNaoContados[]`
- O custo unitário já é buscado no export Excel (`valor_produto` da tabela `produtos`)
- Basta **mover a busca de custos** para o momento de carregar o inventário (em `handleSelectInventario`) e calcular o débito

## Alterações em `src/pages/Conferencia.tsx`

1. **Novo state**: `custosMap: Record<string, number>` — armazena `codigo_auxiliar → valor_produto`
2. **Em `handleSelectInventario`**: após montar `divergenciasList` e `itensNaoContadosList`, buscar custos em lotes (reutilizar a lógica que já existe no `handleExportExcel`) e salvar em `custosMap`
3. **Novo card de resumo** (abaixo do `DivergenciaStats`): exibir:
   - **Total Faltas (R$)**: soma de `|diferença| × custo` para itens com diferença < 0 (contados + não contados)
   - **Total Sobras (R$)**: soma de `diferença × custo` para itens com diferença > 0
   - **Saldo Devedor (R$)**: Faltas - Sobras (o que o vendedor deve líquido)
4. **Coluna "Valor" na tabela**: adicionar coluna opcional mostrando `|diferença| × custo` por linha, com cor vermelha para falta e azul para sobra
5. **Export Excel**: reutilizar o `custosMap` já carregado (sem buscar novamente), adicionar coluna "Valor Diferença"

## Resultado

O gerente verá, ao abrir qualquer inventário, um card destacado com o valor monetário das faltas — permitindo saber exatamente quanto o vendedor deve. A informação também aparece por linha na tabela e no export Excel.

