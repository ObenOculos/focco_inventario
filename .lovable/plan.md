## Objetivo

Adicionar uma segunda tabela de preço ("preço de remessa") aos produtos e permitir, na geração do XML Ciclone, escolher qual tabela de preço usar (venda ou remessa).

## Mudanças

### 1. Banco de dados (migração)
- Adicionar coluna `valor_remessa numeric DEFAULT 0` em `public.produtos`.
- Atualizar a função RPC `atualizar_valores_produtos(p_updates jsonb)` para aceitar opcionalmente `valor_remessa` no payload, atualizando o campo correspondente quando presente. Mantém compatibilidade com payloads antigos (apenas `valor`).

### 2. Página de Produtos (`src/pages/Produtos.tsx`)
- Form de criar/editar produto: novo campo `valor_remessa` ao lado de `valor_produto` (rotulado "Preço de Venda" e "Preço de Remessa").
- Listagem/cards de produto: mostrar os dois preços.
- Importação Excel completa (criar produtos): aceitar coluna opcional `valor_remessa`; documentar nas instruções e nos exemplos da UI.
- Importação Excel de atualização de valores: aceitar opcionalmente `valor_remessa` (qualquer um dos dois é suficiente; valida que pelo menos um veio). Atualiza nas instruções/exemplos.

### 3. Geração de XML Ciclone
- `src/hooks/useNotaRetornoQuery.ts`: incluir `valor_remessa` no select de produtos e no objeto retornado por `useEstoqueRealVendedorQuery` (`valor_remessa`).
- `src/pages/Pedidos.tsx`:
  - Novo estado `tabelaPreco: 'venda' | 'remessa'` (default `'venda'`).
  - No diálogo "Selecionar Loja" do XML: adicionar um seletor (RadioGroup) acima dos botões de loja: "Tabela de Preço — Venda / Remessa".
  - Ao gerar o XML, mapear `valor_unitario` para `item.valor_produto` ou `item.valor_remessa` conforme escolha.
  - Mostrar legenda discreta indicando qual tabela está selecionada.
- `src/lib/gerarXmlCiclone.ts`: nenhuma mudança estrutural — segue recebendo `valor_unitario`. Opcional: incluir um sufixo no nome do arquivo (`-venda` / `-remessa`) para diferenciar exports.

## Comportamento esperado
- Produtos podem ter dois preços independentes; ambos opcionais (default 0).
- Importações antigas (sem `valor_remessa`) continuam funcionando.
- A nota de retorno via edge function `criar-nota-retorno` continua usando `valor_produto` (preço de venda) como hoje — o seletor afeta APENAS o XML Ciclone, conforme pedido.
- Cálculos de débito do vendedor e demais telas permanecem com `valor_produto`.

## Arquivos a alterar
- 1 migração SQL (coluna + atualização da RPC)
- `src/pages/Produtos.tsx`
- `src/hooks/useNotaRetornoQuery.ts`
- `src/pages/Pedidos.tsx`
- `src/lib/gerarXmlCiclone.ts` (apenas nome do arquivo, opcional)

## Perguntas em aberto
Se quiser, posso também:
- Aplicar a mesma escolha de tabela de preço ao cálculo de débito do vendedor (Conferência) — hoje está ligada a `valor_produto`.
- Permitir escolher tabela de preço ao gerar a Nota de Retorno (edge function), não só no XML.

Confirme se quer alguma dessas extensões ou se devo seguir só com o escopo acima.
