

# Salvar apenas itens contados pelo vendedor na aprovação

## Problema identificado
Ao aprovar o inventário do Heleno (727 itens contados), a tabela `estoque_real` recebeu 854 registros — 127 itens **não contados** foram salvos usando o valor do estoque teórico.

Isso acontece na edge function `aprovar-e-ajustar-inventario` (linhas 152-165), que tem a lógica:
- Se `foi_contado = true` → salva `quantidade_fisica`
- Se `foi_contado = false` mas `estoque_teorico ≠ 0` → salva `estoque_teorico` (problema!)

Essa lógica antiga assumia que itens não contados deveriam manter o estoque teórico para "não desaparecerem". Mas o comportamento desejado agora é: **a contagem física do vendedor é a verdade absoluta** — o que ele não contou, simplesmente não vai pro estoque real.

## Solução

**Arquivo:** `supabase/functions/aprovar-e-ajustar-inventario/index.ts`

Alterar o filtro/map (linhas 152-165) para incluir **apenas itens contados pelo vendedor** (`foi_contado === true`), usando sempre `quantidade_fisica`:

```ts
const estoqueRealData = (comparativo || [])
  .filter((item) => item.foi_contado)
  .map((item) => ({
    codigo_vendedor: inventario.codigo_vendedor,
    codigo_auxiliar: item.codigo_auxiliar,
    quantidade_real: item.quantidade_fisica,
    inventario_id: inventario_id,
    data_atualizacao: inventario.data_inventario,
  }));
```

## Impacto
- Inventário do Heleno aprovado novamente → salvaria 727 itens (apenas os contados) em vez de 854
- Itens com estoque teórico que o vendedor não contou serão considerados zerados (não terão registro nesse snapshot)
- Próximo cálculo de estoque teórico parte do snapshot real do inventário, refletindo exatamente o que foi fisicamente conferido

## Limpeza dos dados existentes (opcional)
Para corrigir o inventário do Heleno já aprovado, posso criar uma migração que apaga os 127 registros incorretos (os que estão em `estoque_real` mas não em `itens_inventario` para esse `inventario_id`).

1 arquivo editado + 1 migração opcional de limpeza.

