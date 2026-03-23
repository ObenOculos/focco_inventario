

# Consolidar Produtos + Códigos de Correção em página com Tabs

## Resumo

Unificar as duas páginas em uma só (`/produtos`), com duas abas: **Produtos** (conteúdo atual) e **Códigos de Correção** (conteúdo atual de CodigosCorrecao). A rota `/codigos-correcao` será removida.

## Alterações

### 1. `src/pages/Produtos.tsx` — Página unificada com Tabs

- Importar `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`
- Envolver o conteúdo atual de Produtos em `<TabsContent value="produtos">`
- Mover todo o conteúdo de CodigosCorrecao para `<TabsContent value="codigos-correcao">`
- Título da página muda para "Produtos & Correções" com subtítulo genérico
- Importar hooks/dependências de CodigosCorrecao (`useCodigosCorrecaoQuery`, `useInvalidateCodigosCorrecao`, `usePagination`, `AlertDialog`, icons `Pencil`, `Trash2`, `ArrowRight`, `Tags`)
- Tabs com ícones: `Package` para Produtos, `Tags` para Códigos de Correção

### 2. `src/pages/CodigosCorrecao.tsx` — Remover

- Deletar o arquivo

### 3. `src/App.tsx` — Remover rota `/codigos-correcao`

- Remover import lazy de CodigosCorrecao
- Remover a rota `/codigos-correcao` do router

### 4. `src/components/layout/AppLayout.tsx` — Atualizar menu

- Remover item de menu "Códigos de Correção" (`/codigos-correcao`)
- Renomear item "Produtos" para "Produtos & Correções"

### Detalhes técnicos

- `TabsContent` sem `forceMount` — cada aba só monta quando ativa, evitando queries desnecessárias
- Estado de cada aba é independente (variáveis separadas para search, pagination, dialogs)
- O conteúdo de CodigosCorrecao será integrado como bloco separado dentro do mesmo componente, mantendo toda sua lógica intacta

4 arquivos alterados (1 reescrito, 1 deletado, 2 editados).

