

# Remover lógica de Divergência — manter apenas Diferença

## Contexto

Atualmente a tabela tem **duas colunas** de comparação: "Diferença" (cálculo condicional) e "Divergência" (física - teórica simples). Além disso há **dois filtros** separados para cada conceito. O usuário quer simplificar: manter apenas **Diferença = Estoque Teórico vs Estoque Real (Físico)**.

## Alterações

### 1. `src/pages/Conferencia.tsx`
- **Remover coluna "Divergência"** da tabela (linhas 827, 899-919) — manter apenas a coluna "Diferença"
- **Unificar filtros**: remover o Select de "Divergência" (`divergenceFilter`) e o Select de "Diferença" (`diferencaFilter`). Substituir por um único filtro com opções: Todos, Sobras (+), Faltas (-), Corretos (0), Não Contados
- **Remover state** `divergenceFilter` e `diferencaFilter`; criar um único `filtroResultado`
- **Atualizar `filteredDivergencias`** para usar o filtro unificado baseado em `calcularDiferenca`
- **Coloração das linhas** da tabela: usar o resultado da diferença (azul/laranja) em vez da divergência
- **Excel**: remover coluna "Divergência", manter "Diferença" e "Status"
- **Textos**: trocar referências a "divergência" por "diferença" nos labels e subtítulo da página

### 2. `src/components/DivergenciaStats.tsx`
- Renomear para focar em "Diferença": trocar "Análise de Divergências" → "Análise de Diferenças", "Total Divergente" → "Total com Diferença", "sem divergência" → "sem diferença"
- Manter a mesma estrutura visual (Corretos / Sobras / Faltas)

### 3. `src/types/app.ts`
- Manter `DivergenciaItem` como está (o campo `diferenca` já existe e é o que será usado)

3 arquivos alterados.

