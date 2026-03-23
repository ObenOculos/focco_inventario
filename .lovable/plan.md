

# Consolidar Pedidos + Nota de Retorno em página com Tabs

## Resumo

Unificar as duas páginas em uma só (`/pedidos`), com duas abas: **Consultar Pedidos** (conteúdo atual de Pedidos) e **Gerar Nota de Retorno** (conteúdo atual de NotaRetorno). A rota `/nota-retorno` será removida.

## Alterações

### 1. `src/pages/Pedidos.tsx` — Página unificada com Tabs

- Importar componentes `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`
- Mover todo o conteúdo de Pedidos para `<TabsContent value="consultar">`
- Mover todo o conteúdo de NotaRetorno para `<TabsContent value="nota-retorno">`
- Título da página muda para "Pedidos & Notas" com subtítulo genérico
- Cada aba mantém seu estado independente (já que são blocos separados dentro da mesma página)
- Importar hooks e dependências de NotaRetorno (`useEstoqueRealVendedorQuery`, `useGerarNotaRetornoMutation`, `useVendedoresListQuery`, XLSX, XML utils)

### 2. `src/pages/NotaRetorno.tsx` — Remover

- Deletar o arquivo (todo o conteúdo foi movido para Pedidos)

### 3. `src/App.tsx` — Remover rota `/nota-retorno`

- Remover import lazy de NotaRetorno
- Remover a rota `/nota-retorno` do router

### 4. `src/components/layout/AppLayout.tsx` — Atualizar menu

- Remover item de menu "Nota de Retorno" (`/nota-retorno`)
- Renomear item "Pedidos/Notas" se necessário, mantendo a rota `/pedidos`

### Detalhes técnicos

- Os dois conteúdos ficarão dentro de `TabsContent` com `forceMount` desabilitado (padrão), para que cada aba só monte quando ativa — evitando queries desnecessárias
- Estado de cada aba é local ao componente, resetado naturalmente ao trocar abas
- Tabs com ícones: `FileText` para Consultar, `Undo2` para Nota de Retorno

4 arquivos alterados (1 criado/reescrito, 1 deletado, 2 editados).

