

# Melhorar UI/UX da Página Produtos - Dropdown de Ações

## Resumo

Consolidar os botões "Importar Produtos", "Atualizar Valores" e "Novo Produto" em um layout mais limpo: manter "Novo Produto" como botão primário visível e agrupar as ações secundárias (importar, atualizar, baixar modelos) em um DropdownMenu. Posicionar tudo ao lado do título da página.

## Alterações

### `src/pages/Produtos.tsx`

**1. Mover ações para junto do título (componente principal, ~linha 970-975)**
- Alterar o header para `flex` com título à esquerda e ações à direita (mesmo nível)
- Adicionar botão "Novo Produto" e DropdownMenu no header

**2. Criar DropdownMenu de ações secundárias (substituir botões das linhas 440-482)**
- Importar `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `DropdownMenuSeparator`
- Um botão trigger com ícone `MoreVertical` ou `ChevronDown` + texto "Ações"
- Itens do dropdown:
  - `Upload` Importar Produtos → abre `importDialogOpen`
  - `RefreshCw` Atualizar Valores → abre `updateDialogOpen`
  - Separador
  - `Download` Baixar Modelo Importação → `downloadTemplate()`
  - `Download` Baixar Modelo Atualização → `downloadUpdateTemplate()`

**3. Remover bloco de botões antigo do ProdutosTab (linhas 436-483)**
- Remover os 3 botões e o Dialog trigger inline do "Novo Produto"
- Manter o Dialog do "Novo Produto" mas controlado via estado (sem DialogTrigger inline)
- Os estados `importDialogOpen`, `updateDialogOpen`, `dialogOpen` continuam existindo, agora acionados pelo dropdown e pelo botão primário

**4. Elevar estados necessários**
- Como o dropdown e o botão "Novo Produto" ficam no componente pai (`Produtos`), e os estados/dialogs vivem em `ProdutosTab`, há duas opções:
  - **Opção escolhida**: Passar callbacks `onImport`, `onUpdate`, `onNewProduct` como props para `ProdutosTab` e expor os setters via ref, OU mais simplesmente, mover o DropdownMenu e o botão "Novo Produto" para dentro do `ProdutosTab` mas renderizá-los condicionalmente no header via um portal ou simplesmente manter no header do tab.
  - **Solução mais simples**: Mover o título + ações para DENTRO de `ProdutosTab`, e no componente principal manter apenas o Tabs header. Assim não precisa elevar estado.

**Decisão**: Manter ações dentro de `ProdutosTab` mas reorganizar o layout. O título principal fica no componente pai, e cada tab tem seu próprio header com ações ao lado da barra de busca.

### Layout final do ProdutosTab

```text
[SearchFilter............] [Ações ▾] [+ Novo Produto]
```

- `Ações` é um DropdownMenu com as opções de importar/atualizar/baixar modelos
- `+ Novo Produto` é o botão primário visível

### Arquivos alterados

1 arquivo: `src/pages/Produtos.tsx`

