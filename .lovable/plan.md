## Contexto

- Vendedor: **Mister Cláudio** (`codigo_vendedor='16'`, user_id `54d8acae-...`)
- Inventário do dia 01/02/2026 foi deletado. Hoje só existe 1 inventário aprovado (03/05/2026).
- Arquivo enviado: `conferencia_Mister_Cláudio_01-02-2026_completo.xlsx` — 1.897 linhas com colunas `Código Auxiliar`, `Quantidade Física`, `Estoque Teórico`, `Diferença`, `Status`.

## ⚠️ Alerta importante antes de executar

O inventário aprovado de 03/05/2026 já gravou `estoque_real` usando como **base teórica** os movimentos pós-data. Se inserirmos um inventário aprovado em 01/02/2026 **agora**, ele vira o "último aprovado" só para datas ≤ 01/02. O inventário de 03/05 continua sendo o mais recente e a base de cálculo atual **não muda**. Ou seja: a restauração é segura para histórico, mas não recalcula nada do presente.

Confirmar comigo antes de rodar:
1. Restaurar como **`aprovado`** com `data_inventario = 2026-02-01 12:00:00-03` (recomendado, replica o estado original)?
2. Ou restaurar como **`pendente`** para o gerente revisar/aprovar manualmente de novo?

## Passos da execução

1. **Copiar o XLSX** para o sandbox e ler com pandas, mantendo apenas `Código Auxiliar` + `Quantidade Física` (ignorar linhas com qtd nula/negativa).
2. **Gerar SQL de inserção** em uma migration única:
   - `INSERT INTO inventarios` → novo `id`, `codigo_vendedor='16'`, `user_id='54d8acae-...'`, `data_inventario='2026-02-01 12:00:00-03'`, `status` conforme decisão acima, `observacoes='Restaurado a partir de planilha Excel — inventário original deletado.'`.
   - `INSERT INTO itens_inventario` em lote (1.897 linhas) usando o `id` do inventário acima e `nome_produto` da planilha.
3. **Se status = `aprovado`**, replicar também o `estoque_real`:
   - Para cada item contado, inserir em `estoque_real` com `codigo_vendedor='16'`, `quantidade_real = Quantidade Física`, `inventario_id = <novo>`, `data_atualizacao = '2026-02-01 12:00:00-03'`.
   - Isso reproduz o que a edge function `aprovar-e-ajustar-inventario` teria feito.
4. **Validar** com SELECT: contagem de itens_inventario + estoque_real = 1.897 e a função `comparar_estoque_inventario_paginado` retornar resultado coerente.

## Detalhes técnicos

- Inserções vão em lotes de 500 via SQL `INSERT ... VALUES (...), (...)` para respeitar limites do Postgres.
- Vou usar `gen_random_uuid()` para o id do inventário e capturá-lo via CTE `WITH inv AS (INSERT ... RETURNING id)` para encadear os itens.
- A planilha não traz `nome_produto` separado do "Nome Produto"; vou usar essa coluna direto. Para códigos não cadastrados, a inserção em `itens_inventario` ainda funciona (não há FK).
- A migration ficará idempotente protegida por `ON CONFLICT DO NOTHING` no `inventarios` (checando `codigo_vendedor + data_inventario` se necessário) ou simplesmente rodando uma vez só.

## Riscos

- Se já tiver havido importações de pedidos com `data_emissao` entre 01/02 e 03/05, o cálculo histórico via `calcular_estoque_vendedor_ate_data` para datas nesse intervalo passará a usar essa base — isso é o comportamento desejado da restauração.
- Não vou apagar/alterar nada do inventário de 03/05.

Me responde **(1) aprovado** ou **(2) pendente** e eu sigo.
