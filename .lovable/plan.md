
## Contexto

Hoje a aba **Nota de Retorno** (em `/pedidos`) sempre usa o estoque real mais recente do vendedor (`get_estoque_real_vendedor` retorna o último `estoque_real` por SKU). Isso cria dois problemas:

1. **Não há como gerar uma nota de retorno de um inventário específico.** Se o gerente quer devolver exatamente o que foi contado em um inventário antigo (ex: 01/02), não consegue — só pega o último.
2. **Quando o mesmo vendedor tem dois inventários aprovados**, o segundo simplesmente vira o novo baseline e o anterior some da visão de "estoque atual". Isso já funciona para cálculo de teórico (usa `MAX(data_inventario)`), mas confunde quando precisamos olhar "o que foi contado no inventário X".

## O que vamos construir

### 1. Gerar Nota de Retorno a partir de um inventário específico

Na tela **Conferência** (`/conferencia`), quando o gerente abre um inventário **aprovado**, adicionar um botão **"Gerar Nota de Retorno deste Inventário"** (no menu de ações secundárias).

Ao clicar:
- Abre um modal de confirmação listando: vendedor, data do inventário, total de SKUs e unidades que serão devolvidos, valor total.
- Permite escolher: **devolver tudo** (quantidade física do inventário) **ou apenas itens com quantidade > 0**.
- Confirma → chama a edge function `criar-nota-retorno` passando os itens vindos do inventário (não do `estoque_real` mais recente).

Resultado: gera o pedido tipo `3` (Retorno) normalmente, abatendo o estoque.

### 2. Múltiplos inventários aprovados do mesmo vendedor

Hoje o sistema já suporta tecnicamente (cada inventário tem sua data e gera seu snapshot em `estoque_real`), mas a UX não deixa claro. Vamos:

- **Conferência**: mostrar badge "Mais recente" no inventário aprovado mais novo de cada vendedor, e badge cinza "Histórico" nos anteriores.
- **Nota de Retorno (aba Pedidos)**: continuar usando o mais recente como padrão (comportamento atual), mas adicionar um aviso "Baseado no inventário de DD/MM/AAAA — para usar outro, vá em Conferência".
- **Cálculo de teórico**: já usa `MAX(data_inventario)` corretamente, sem mudança.

### 3. Validação

- Bloquear geração de nota de retorno se o inventário escolhido não for o mais recente E já existirem movimentações (vendas/remessas/retornos) posteriores a ele — porque devolveria itens que já podem ter saído. Mostrar toast explicando.
- Permitir override apenas com confirmação extra ("Eu sei o que estou fazendo").

## Detalhes técnicos

- `src/pages/Conferencia.tsx`: novo botão no `DropdownMenu` de ações do inventário aprovado, novo `AlertDialog` de confirmação.
- `src/hooks/useNotaRetornoQuery.ts`: nova função `useGerarNotaRetornoDeInventarioMutation` que monta os itens a partir de `itens_inventario` + tabela `produtos` (para pegar `valor_produto`) e chama a mesma edge function `criar-nota-retorno`.
- Edge function `criar-nota-retorno`: **sem mudanças** — já recebe `{ codigo_vendedor, itens, observacoes }`, então só passamos os itens montados a partir do inventário escolhido.
- `useInventariosPendentesQuery`: adicionar flag computada `is_mais_recente` por vendedor para o badge.
- Validação de movimentações posteriores: query rápida em `pedidos` filtrando por `codigo_vendedor` e `data_emissao > data_inventario`.

## Arquivos afetados

- `src/pages/Conferencia.tsx` — botão + modal
- `src/hooks/useNotaRetornoQuery.ts` — nova mutation
- `src/hooks/useConferenciaQuery.ts` — flag `is_mais_recente`
- `src/pages/Pedidos.tsx` — aviso na aba Nota de Retorno

Sem migração de banco. Sem mudanças em edge functions.
