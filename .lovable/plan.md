## Revisão de lógica — Nota de Retorno, Inventário, Pedidos enviados (Estoque Teórico) e Estoque Real

Após ler as funções SQL (`calcular_estoque_vendedor*`, `comparar_estoque_*`, `get_*_pedidos*`), a edge function `criar-nota-retorno`, o hook `useNotaRetornoQuery` e a função `reverter-aprovacao-inventario`, encontrei 6 problemas de lógica. Abaixo, o que cada um quebra e a correção proposta.

---

### 1. Status `baixado` some do baseline do estoque teórico (CRÍTICO)

**Problema**
Todas as funções de cálculo (`calcular_estoque_vendedor`, `_paginado`, `_ate_data`, `calcular_estoque_teorico_pos_inventario`, `comparar_estoque_inventario_paginado` indiretamente) usam:
```sql
WHERE i.status = 'aprovado'
```
Quando o gerente gera a Nota de Retorno, `criar-nota-retorno` muda o inventário para `status='baixado'`. A partir daí, `MAX(data_inventario)` ignora esse registro e cai no inventário aprovado anterior (ou em nenhum). O baseline "salta para trás", e o teórico passa a re-somar remessas/vendas/retornos de muitos meses, mostrando valores errados.

**Correção**
Tratar `'baixado'` como inventário válido para baseline em todas as funções:
```sql
WHERE i.status IN ('aprovado','baixado')
```
(funções: `calcular_estoque_vendedor`, `calcular_estoque_vendedor_paginado`, `calcular_estoque_vendedor_ate_data`, `calcular_estoque_teorico_pos_inventario`).

---

### 2. Nota de retorno aplica o efeito duas vezes no estoque real (CRÍTICO)

**Problema** em `supabase/functions/criar-nota-retorno/index.ts`:
- Insere um `pedido` `codigo_tipo=3` (já é descontado do teórico via `get_saidas_pedidos`).
- Em seguida, **também** insere linhas em `estoque_real` com `quantidade_real=0` na data atual.

Como `comparar_estoque_teorico_vs_real` usa `DISTINCT ON ... ORDER BY data_atualizacao DESC`, esse snapshot zerado vira "verdade" e apaga a contagem física do inventário recém-aprovado. Viola a regra de memória "Real Stock: From physical counts" e "Date Locked Stock".

**Correção**
Remover o bloco que insere zeros em `estoque_real` (linhas 198–211 do arquivo). O efeito da retorno já é capturado pelo pedido tipo 3; o snapshot de `estoque_real` deve continuar refletindo a contagem do inventário.

---

### 3. RPCs paginadas quebradas (`get_entradas_pedidos_paginado` / `get_saidas_pedidos_paginado`)

**Problema**
Essas funções referenciam tabelas/colunas inexistentes:
- `pedido_itens` (a tabela real é `itens_pedido`)
- `p.tipo` e `p.data_pedido` (na verdade são `p.codigo_tipo` e `p.data_emissao`)

Hoje só aparecem em `types.ts` e não são chamadas — mas estão lá como armadilha.

**Correção**
Reescrever as duas funções usando `itens_pedido`, `codigo_tipo IN (7,99)` (entradas) / `codigo_tipo IN (2,3)` (saídas) e `data_emissao`, mantendo `LIMIT/OFFSET`.

---

### 4. `useEstoqueRealVendedorQuery` não pagina o RPC

**Problema** (`src/hooks/useNotaRetornoQuery.ts`, linhas 44–66)
Tem um `while (hasMore)` aparente, mas chama `get_estoque_real_vendedor` sempre com os mesmos parâmetros e força `hasMore = false` no primeiro retorno. A própria RPC retorna tudo em uma chamada, sujeita ao limite de 1000 linhas do Supabase REST. Vendedores com >1000 SKUs perdem itens silenciosamente na tela de Nota de Retorno.

**Correção**
Adicionar paginação real:
- Acrescentar `p_limit / p_offset` em `get_estoque_real_vendedor` (RPC) **ou** chamar via `range()` em loop até receber menos que o tamanho do lote.
- Ajustar o hook para iterar offsets de 500/1000 e parar quando o lote vier menor.

---

### 5. `reverter-aprovacao-inventario` não cobre `baixado`

**Problema**
Só aceita reverter quando `status='aprovado'`. Depois que a nota de retorno é gerada, o inventário fica `baixado` e não pode mais ser revertido — mesmo que a nota tenha sido criada por engano.

**Correção (decidir uma das duas)**
- Permitir reverter `baixado` também e, nesse caso, apagar o pedido de retorno gerado (`numero_pedido` referenciado em `observacoes_gerente`) e seus `itens_pedido`.
- Ou criar uma rota separada "Cancelar Nota de Retorno" que faça o rollback (apaga pedido + volta status para `aprovado`).

Recomendo a segunda opção, mais explícita.

---

### 6. Filtro `quantidade_real > 0` esconde itens zerados na tela de Retorno

**Problema** (`useNotaRetornoQuery.ts` linha 98)
A consulta filtra `quantidade_real > 0`. Itens contados como zero no inventário (regra de memória "Zero Quantity Submission") somem da listagem da Nota de Retorno, dificultando a conferência do que está sendo devolvido.

**Correção**
Remover o filtro e deixar o componente decidir esconder/mostrar zerados (ou exibir com badge "0" e um toggle "ocultar zerados").

---

### Detalhes técnicos (resumo das alterações)

```text
Migrations (SQL):
  - calcular_estoque_vendedor                  → WHERE status IN ('aprovado','baixado')
  - calcular_estoque_vendedor_paginado          → idem
  - calcular_estoque_vendedor_ate_data          → idem
  - calcular_estoque_teorico_pos_inventario     → idem
  - get_entradas_pedidos_paginado               → reescrever (itens_pedido, codigo_tipo, data_emissao)
  - get_saidas_pedidos_paginado                 → reescrever (itens_pedido, codigo_tipo, data_emissao)
  - get_estoque_real_vendedor                   → adicionar p_limit/p_offset

Edge functions:
  - criar-nota-retorno/index.ts                 → remover bloco que insere estoque_real qty=0
  - (novo) cancelar-nota-retorno/index.ts       → reverte pedido + status baixado→aprovado

Frontend:
  - src/hooks/useNotaRetornoQuery.ts            → paginar get_estoque_real_vendedor
                                                   remover filtro quantidade_real>0
  - src/pages/Pedidos.tsx ou Inventario.tsx     → botão "Cancelar Nota de Retorno" para gerente
                                                   (somente se item 5 for aprovado)
```

Não toco em nada de UI/visual nem nas outras telas; tudo é ajuste de cálculo, integridade de dados e remoção de bugs latentes.

---

### Confirmação antes de implementar

Antes de executar, preciso de uma decisão sobre o item **5**:
- (a) permitir reverter `baixado` na função existente, ou
- (b) criar uma nova função `cancelar-nota-retorno` separada (recomendado).

Se você aprovar este plano sem comentar o item 5, sigo com a opção (b).