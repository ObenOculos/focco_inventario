

# Mover "Ações do Gerente" para um Dialog/Modal

## O que muda
O card "Ações do Gerente" (linhas 766-826) será substituído por um **botão** que abre um **Dialog** contendo todo o conteúdo atual: botões Excluir, Não Aprovar, Aprovar e Ajustar, e o campo de observações.

## Alterações

**Arquivo:** `src/pages/Conferencia.tsx`

1. **Novo estado:** `showManagerActions` (boolean, default `false`)
2. **Importar** `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription` do componente existente
3. **Substituir o Card** (linhas 766-826) por um botão "Ações do Gerente" que seta `showManagerActions = true`
4. **Adicionar um `<Dialog>`** com o conteúdo dos botões de ação e o textarea de observações dentro do `DialogContent`

1 arquivo, ~30 linhas alteradas.

