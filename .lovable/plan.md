

# Simplificar cálculo de diferença no inventário

## Contexto
A lógica atual tem um switch e lógica condicional para tratar teórico negativo (soma vs subtração). O usuário quer simplificar para uma fórmula fixa:

**diferença = teórico - físico**

Exemplos:
- -3 - 0 = -3
- 4 - 0 = 4
- 2 - 3 = -1

## Alterações

**Arquivo:** `src/pages/Conferencia.tsx`

1. **Simplificar `calcularDiferenca`** (linha 88-93): remover parâmetro `usaSoma` e lógica condicional. Fórmula fixa: `return estoqueTeor - estoqFisico`
2. **Remover estado `usaSomaParaNegativo`** (linha 119) e todo o switch/label associado (linhas ~889-905)
3. **Remover `usaSomaParaNegativo`** de todas as chamadas a `calcularDiferenca` (~15 ocorrências) e das dependências dos `useMemo`
4. **Inverter lógica de tipo**: como agora diferença positiva = teórico > físico (falta), e negativa = físico > teórico (sobra), ajustar classificação de `sobra`/`falta` se necessário

## Impacto na classificação
Com a fórmula `teórico - físico`:
- Positivo → vendedor tem **menos** que deveria → **Falta**
- Negativo → vendedor tem **mais** que deveria → **Sobra**
- Zero → **Correto**

Isso pode inverter a semântica atual de sobra/falta. Preciso verificar e ajustar os filtros e badges.

1 arquivo, ~20 linhas removidas, ~10 linhas editadas.

