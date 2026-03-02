

# Corrigir Logica da Nota de Retorno

## Problema Identificado

A edge function `criar-nota-retorno` cria um pedido (codigo_tipo=3) e insere itens em `itens_pedido`, mas **nao atualiza a tabela `estoque_real`**. Como a pagina Nota de Retorno busca dados do `estoque_real` para exibir as quantidades, o gerente ve sempre os mesmos valores e pode gerar multiplas notas de retorno para o mesmo estoque.

### Fluxo Atual (com bug)

```text
1. Gerente seleciona vendedor -> busca estoque_real (ex: 10 unidades)
2. Gerente clica "Gerar Nota de Retorno" -> cria pedido tipo 3 com 10 unidades
3. estoque_real NAO e atualizado (continua 10)
4. Gerente volta a pagina -> ve 10 unidades novamente
5. Pode gerar outra nota de retorno duplicada
```

### Fluxo Correto (apos correcao)

```text
1. Gerente seleciona vendedor -> busca estoque_real (ex: 10 unidades)
2. Gerente clica "Gerar Nota de Retorno" -> cria pedido tipo 3 com 10 unidades
3. estoque_real e ATUALIZADO (agora 0, ou quantidade reduzida)
4. Gerente volta a pagina -> ve 0 unidades (ou quantidade restante)
5. Nao consegue gerar nota duplicada
```

## Alteracoes Necessarias

### 1. Edge Function `criar-nota-retorno` - Atualizar estoque_real

Apos inserir os itens do pedido com sucesso, a edge function deve atualizar a tabela `estoque_real` para cada item retornado:

- Para cada item na nota de retorno, buscar o registro mais recente em `estoque_real` para aquele `codigo_auxiliar` e `codigo_vendedor`
- Inserir um novo registro em `estoque_real` com a quantidade reduzida: `nova_quantidade = quantidade_real_atual - quantidade_retornada`
- Se a quantidade resultante for negativa, usar 0
- Usar a data atual como `data_atualizacao` para que este se torne o registro mais recente

Logica no edge function (apos inserir itens do pedido):

```text
Para cada item valido:
  1. Buscar quantidade_real atual do estoque_real (registro mais recente)
  2. Calcular nova_quantidade = MAX(0, quantidade_atual - quantidade_retorno)
  3. Inserir novo registro em estoque_real com nova_quantidade
```

### 2. Frontend - Desabilitar botao durante processamento

No arquivo `src/pages/NotaRetorno.tsx`, melhorar o feedback ao usuario:

- Desabilitar o botao "Gerar Nota de Retorno" enquanto a mutation esta pendente (ja existe parcialmente no dialog)
- Apos sucesso, forcar refetch do estoque_real via `queryClient.invalidateQueries`
- O `useEffect` existente ja recarrega os itens quando `estoqueReal` muda, entao isso deve funcionar automaticamente

### 3. Frontend - Limpar estado apos sucesso

Apos a nota de retorno ser gerada com sucesso, garantir que:

- O dialog fecha (ja implementado)
- O vendedor selecionado limpa (ja implementado)
- Os itens locais limpam (ja implementado)

O problema e que quando o usuario seleciona o mesmo vendedor de novo, o estoque_real ainda mostra valores antigos porque o cache pode nao ter sido invalidado a tempo. A invalidacao de queries ja existe no hook, mas so funciona se o estoque_real for de fato atualizado no banco.

## Arquivos a Modificar

- **`supabase/functions/criar-nota-retorno/index.ts`**: Adicionar logica para atualizar estoque_real apos criar o pedido
- **`src/pages/NotaRetorno.tsx`**: Pequenos ajustes de UX (botao desabilitado fora do dialog)

## Detalhes Tecnicos da Atualizacao do estoque_real

A atualizacao sera feita inserindo novos registros (nao atualizando os existentes), seguindo o padrao historico do sistema. Os novos registros terao:

- `codigo_vendedor`: mesmo do retorno
- `codigo_auxiliar`: cada item retornado
- `quantidade_real`: quantidade anterior menos a retornada
- `data_atualizacao`: timestamp atual
- `inventario_id`: NULL (pois nao vem de inventario, vem de retorno)

Isso garante que:
1. O historico de estoque real e preservado
2. O `get_estoque_real_vendedor` (que usa ROW_NUMBER com ORDER BY data_atualizacao DESC) automaticamente retorna os valores atualizados
3. O calculo de estoque teorico (`calcular_estoque_vendedor`) continua funcionando porque usa a data do ultimo inventario aprovado como base
