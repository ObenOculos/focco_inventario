

# Inconsistências na lógica de Diferença vs Divergência

## O que são os dois conceitos

- **Divergência** = `quantidade_fisica - estoque_teorico` (subtração simples, vinda do RPC)
- **Diferença** = `calcularDiferenca()` = lógica condicional:
  - Se teórico <= 0: `teórico + físico`
  - Se teórico > 0: `físico - teórico`

Exemplo: teórico = **-5**, físico = **3**
- Divergência = 3 - (-5) = **+8**
- Diferença = -5 + 3 = **-2**

## Problemas encontrados

### 1. Conferência — `tipo` e stats usam lógica errada

Na **linha 184**, o campo `diferenca` do `DivergenciaItem` é calculado como subtração simples (`física - teórica`), que é idêntica à divergência. Depois:
- **Tipo** (sobra/falta/ok) nas linhas 192-194 usa esse valor
- **Stats** (linhas 361-368) usam `d.diferenca` para contar sobras/faltas

Mas a coluna "Diferença" na tabela (linha 576) usa `calcularDiferenca()`. Resultado: os cards de estatísticas podem dizer "Sobra" enquanto a coluna Diferença mostra valor negativo para o mesmo item.

### 2. Análise — stats também usam divergência em vez de diferença

Nas linhas 282-288, `itensSobra` e `itensFalta` são classificados por `item.divergencia`, não por `calcularDiferenca()`. Mesma inconsistência.

### 3. Conferência — campo `diferenca` no DivergenciaItem é redundante com divergência

O `item.diferenca` armazenado no state é `física - teórica` (linha 184), que é exatamente a divergência. Mas o campo se chama "diferenca", gerando confusão.

## Correções propostas

### `src/pages/Conferencia.tsx`

1. **Classificação `tipo`** (linhas 192-194): usar `calcularDiferenca()` em vez de subtração simples
2. **Campo `diferenca` no DivergenciaItem** (linha 184): calcular usando `calcularDiferenca()` para que stats e tabela sejam consistentes
3. **Stats** (linhas 361-368): já usam `d.diferenca`, ficarão corretos se o campo for calculado com `calcularDiferenca()`

### `src/pages/AnaliseInventario.tsx`

4. **Stats** (linhas 282-288): classificar sobra/falta usando `calcularDiferenca(item.estoque_teorico, item.quantidade_fisica)` em vez de `item.divergencia`
5. **Filtro de divergência** (linhas 177-184): manter usando `item.divergencia` — correto, é o filtro de divergência
6. **Row highlight** (linhas 704-709): avaliar se deve seguir divergência ou diferença para colorir linhas — sugiro manter divergência para consistência visual com a coluna

### `src/types/app.ts`

7. Nenhuma mudança necessária na interface `DivergenciaItem` — o campo `diferenca` passa a representar o valor calculado pela fórmula condicional

## Resumo

A regra de negócio diz que **Diferença** determina sobra/falta. Hoje, stats e classificação usam divergência (subtração simples). A correção alinha stats, tipo, e tabela para todos usarem `calcularDiferenca()`.

3 pontos de mudança em 2 arquivos.

