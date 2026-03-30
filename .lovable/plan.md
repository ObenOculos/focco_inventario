

# Toggle para lógica de cálculo de diferença

## O que muda
Adicionar um **Switch** na página de Conferência que permite ao gerente escolher entre dois modos de cálculo quando o estoque teórico é negativo:

- **Ativado (padrão):** Teórico + Físico (lógica atual)
- **Desativado:** Físico - Teórico (subtração padrão sempre)

## Alterações

**Arquivo:** `src/pages/Conferencia.tsx`

1. **Novo estado:** `usaSomaParaNegativo` (boolean, default `true`)
2. **Atualizar `calcularDiferenca`:** receber o flag como parâmetro ou ler do estado — se ativado, usa soma quando teórico < 0; se desativado, sempre subtrai.
3. **Renderizar Switch:** ao lado dos filtros existentes, visível apenas quando um inventário está selecionado. Label: "Somar quando teórico negativo". Usar o componente `Switch` já existente no projeto (`src/components/ui/switch.tsx`).

### Exemplo visual
```text
[Filtros existentes...]   🔘 Somar quando teórico negativo
```

O switch afeta automaticamente tabela, estatísticas, exportação Excel e resumo financeiro, pois todos usam a mesma função `calcularDiferenca`.

1 arquivo editado, ~15 linhas adicionadas.

