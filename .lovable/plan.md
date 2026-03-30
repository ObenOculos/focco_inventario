

# Valor negativo quando diferença é negativa

## Problema
Atualmente o "Valor (R$)" usa `Math.abs(diferencaCalculada) * custo`, sempre mostrando valor positivo. O usuário quer que o valor reflita o sinal da diferença: negativo quando há falta, positivo quando há sobra.

## Alteração em `src/pages/Conferencia.tsx`

### 1. Coluna "Valor (R$)" na tabela (linha ~933)
- Trocar `Math.abs(diferencaCalculada) * custo` por `diferencaCalculada * custo`
- Manter as cores: vermelho para negativo, azul para positivo

### 2. Export Excel (linhas ~500 e ~514)
- Garantir que "Valor Diferença" também use `diferença * custo` sem `Math.abs`

### 3. Resumo financeiro (linhas ~480-486)
- Ajustar o cálculo de `totalFaltas` e `totalSobras` para que os valores reflitam corretamente os sinais (faltas como valores negativos)

1 arquivo alterado.

