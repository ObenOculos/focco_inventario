# Reorganização do header "Itens do Inventário"

## Problema
Hoje, no card de itens do inventário, a linha de filtros mistura **filtros de marca** (Todos / Oben / Power / Outros) com **ações destrutivas/secundárias** (Importar, Exportar, Limpar Tudo). No mobile (390px), os botões quebram em várias linhas, "empurram" os filtros e competem com eles visualmente. Não há hierarquia clara entre "filtrar a lista" e "agir sobre o inventário inteiro".

## Solução proposta

### 1. Mover ações para o título do card (canto direito)
As ações **Importar / Exportar / Limpar Tudo** deixam de ficar na linha de filtros e passam para a linha do título `Itens do Inventário (N)`, alinhadas à direita. Isso segue o padrão do shadcn/ui (CardHeader com action no canto) e separa claramente "ações sobre os dados" de "filtros que afetam a visualização".

### 2. Agrupar em menu de overflow
As três ações são consolidadas num único botão "kebab" (`MoreVertical`) com `DropdownMenu`:
- Importar (sempre visível)
- Exportar (desabilitado se `items.length === 0`)
- Separador
- Limpar Tudo (em vermelho/destructive, desabilitado se vazio)

Isso reduz drasticamente o ruído visual no mobile e segue a memória [Secondary Dropdowns](mem://design/secondary-actions-dropdown-pattern).

### 3. Linha de filtros mais limpa
Sobra apenas: campo de busca + chips de marca (Todos/Oben/Power/Outros). Os chips ganham destaque por serem o único controle visível ali.

### 4. Indicador de filtro ativo no contador
O título passa de `Itens do Inventário (N)` para algo como:
- Sem filtro: `Itens do Inventário · 25 peças`
- Com filtro: `Itens do Inventário · 12 de 25 peças` + badge "Oben" ao lado

Isso torna óbvio que o número refletido considera o filtro (encadeando com o ajuste anterior).

## Layout resultante (mobile 390px)

```text
┌────────────────────────────────────────┐
│ Itens do Inventário · 12 peças    [⋮] │  ← ações em dropdown
│ [Oben]                                  │  ← badge se filtro ativo
│                                         │
│ [🔍 Filtrar por código ou nome...    ] │
│                                         │
│ [Todos] [Oben] [Power] [Outros]        │  ← chips limpos
├────────────────────────────────────────┤
│ ABC123 PRETO                  [- 5 +]  │
│ ...                                     │
└────────────────────────────────────────┘
```

## Outros ajustes de UX/UI identificados

1. **Chips de marca como `ToggleGroup`** — hoje são 4 `Button` individuais; usar `ToggleGroup` semântica (a11y), mantém visual.
2. **Estado vazio do filtro** — quando o usuário filtra por marca e não há resultados, a mensagem atual ("Nenhum item adicionado ainda") fica errada. Mostrar: "Nenhum item da marca **Oben** encontrado" + botão "Limpar filtro".
3. **"Limpar Tudo" no dropdown vermelho** — manter `destructive` no item do menu para reforçar o perigo, e reaproveitar o `AlertDialog` de confirmação existente.
4. **Busca + chips num bloco coeso** — agrupar visualmente busca e chips (mesmo container, sem `mt-4` quebrando), reforçando que ambos filtram a mesma lista.

## Arquivos a alterar

- `src/pages/Inventario.tsx`
  - Imports: adicionar `MoreVertical`, `DropdownMenu*`, `Badge`, `ToggleGroup*`.
  - `CardHeader` da seção "Itens do Inventário": novo layout (título + dropdown à direita; busca + chips agrupados abaixo).
  - Substituir os 4 `Button` de marca por `ToggleGroup` com `ToggleGroupItem`.
  - Ajustar mensagem de estado vazio considerando `brandFilter !== 'all'` ou `searchTerm`.
  - Remover a `<div>` antiga que misturava filtros e ações.

Nenhum componente novo precisa ser criado. Os modais `ImportInventarioModal` / `ExportInventarioModal` e o `AlertDialog` de "Limpar Tudo" continuam funcionando exatamente como antes.