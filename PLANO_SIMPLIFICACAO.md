# Plano de simplificação — Conferência de Inventários

Branch: `simplifica-conferencia` · Iniciado em 2026-08-04

## Objetivo

Reduzir o app a quatro capacidades: **registrar inventários, guardar o histórico, comparar
dois inventários quando o usuário quiser, e exportar em XML**. Todo o subsistema de estoque
por pedidos/ERP sai.

## Arquitetura decidida

As duas funcionalidades são **independentes**. Essa separação é a decisão central do
projeto e resolve por construção o problema de escolha automática de base de comparação.

**Fluxo de inventário** (regra de negócio principal)

1. O vendedor realiza a contagem
2. Envia para aprovação
3. O gerente revisa a contagem
4. Aprova
5. O inventário é salvo — fim

Sem nenhum cálculo de divergência. O gerente revisa a lista contada.

**Comparação de inventários** (consulta)

Tela separada: o usuário escolhe dois inventários (A e B) e pede o comparativo. Não
interfere em aprovação nem em gravação.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Comparação | Fora do fluxo de aprovação, em tela própria com escolha explícita de A e B |
| XML | Gerado **a partir de um inventário**, sem gravar nada. O caminho Excel → XML fica como aba secundária |
| Status `baixado` | Normalizado para `aprovado`; o valor fica órfão no enum (Postgres não remove valor de enum) |
| Inventários fragmentados | Fragmentar é modo de trabalho válido. A solução é a função de **juntar**, não impedir na origem |
| Juntar | As origens são **apagadas**; manter faria as peças contarem em dobro no histórico e na comparação |
| Dados legados de pedidos | Dump antes, DROP depois |
| Execução | Etapa por etapa, com validação do usuário entre cada uma |

## Descobertas que mudaram o plano

**`pedidos` e `itens_pedido` estão vazios em produção** (0 linhas; `estoque_real` tem
13.407). O "estoque teórico" já era, de fato, só a contagem do inventário anterior — as
CTEs de entradas/saídas sempre retornavam vazio. O ERP já não alimentava nada.

**Todo inventário aprovado se comparava consigo mesmo.** O filtro era
`status='aprovado' AND data_inventario <= <data do próprio inventário>`, então ele se
auto-elegia como referência e a divergência saía 0 em tudo. Provado empiricamente: o
inventário do vendedor 8 de 09/07 15:03 tinha "teórico" de 145 itens / 148 unidades,
idêntico à própria contagem. Os `pendente`/`revisao` nunca sofreram disso, e é por isso que
passou despercebido.

**Inventários do mesmo dia são contagens parciais, não recontagens.** Sobreposição de
produtos medida em produção:

| par | produtos em comum |
|---|---|
| vend 11 · 01/06 16:57 → 17:00 (2min42s) | **0** de 610 |
| vend 11 · 01/06 17:00 → 19:14 | **0** de 244 |
| vend 8 · 09/07 15:03 → 20:44 | **0** de 550 |
| vend 8 · 09/07 20:44 → 10/07 | **0** de 466 |
| vend 16 · 03/05 → 05/05 (>24h) | 414 de 457 (91%) |
| vend 8 · 05/05 → 06/05 (>24h) | 532 de 568 (94%) |

Mesmo dia = faixas disjuntas de produto. Mais de 24h = recontagem real. Separação limpa.

**`estoque_real` é idêntico a `itens_inventario`** em todos os aprovados, produto a
produto — nenhum inventário foi editado após aprovar. Trocar a fonte não altera número.

## Etapas

### ✅ Etapa 0 — Rede de segurança

Branch dedicada, contagem das tabelas condenadas, dumps em `../Inventario_App_backup/`.

### ✅ Etapa 1 — Exportação XML em rota própria

- `XmlPorExcelTab` movido de `src/components/pedidos/` para `src/components/` (rename puro,
  zero mudança de conteúdo)
- `src/components/XmlPorInventarioTab.tsx` novo: gera XML a partir de um inventário, lendo
  `itens_inventario.quantidade_fisica` + `produtos.valor_produto`/`valor_remessa`. **Não
  grava nada** — sem insert em `pedidos`, sem `status='baixado'`, sem `estoque_real`
- `src/pages/ExportarXml.tsx`, rota `/exportar-xml`, item de menu
- Lista todos os inventários, com busca, filtro de status com contagem, filtro de vendedor,
  botão Limpar, e a paginação global (`usePagination` + `Pagination`)
- Aba `xml-excel` removida de `Pedidos.tsx`

### ✅ Etapa 2 — Comparação e junção no banco

- `20260804140000_normaliza_status_baixado_para_aprovado.sql` — 19/1/1, zero baixado,
  `updated_at` preservado desligando o trigger durante o UPDATE
- `20260804150000_comparar_dois_inventarios.sql` — `comparar_dois_inventarios(a, b, limit,
  offset)`, colunas `quantidade_a` / `quantidade_b` / `diferenca` (B − A) /
  `presente_em_a` / `presente_em_b`. Só gerente
- `20260804160000_juntar_inventarios.sql` — `juntar_inventarios(destino, origens[])`, soma
  no destino e apaga as origens. Só gerente, mesmo vendedor obrigatório, funciona em
  aprovados, rastro em `observacoes_gerente`

Validadas em banco local carregado com dados de produção: 5 barreiras de erro negando
corretamente, união disjunta (673 produtos = 429+181+63, 867 unidades) e soma em produto
repetido (2+2=4).

**`juntar_inventarios` nunca foi executada em produção** — os fragmentos reais seguem lá,
esperando a tela.

Consertos avulsos: badge de status do `Historico.tsx` não tratava `baixado` e renderizava
`undefined`; agora `styles`/`labels` são `Record<InventoryStatus, string>`, então um status
novo quebra o build. Comentário da migration `20260417140500` corrigido
(`supabase_realtime_admin`, não `supabase_admin`).

### ✅ Etapa 3 — Desacoplar as edge functions (escrita; **deploy pendente**)

- `aprovar-e-ajustar-inventario`: 224 → 140 linhas. Saíram o loop de
  `comparar_estoque_inventario_paginado`, a escrita em `estoque_real` e o
  `throw 'Nenhum item para registrar no estoque real'`. Aprovar é validar autenticação →
  validar gerente → checar status `pendente`/`revisao` → checar que há itens contados →
  `status='aprovado'`. A checagem de "sem itens" ficou **explícita**; antes acontecia por
  acidente, ao falhar a escrita do estoque derivado
- `reverter-aprovacao-inventario`: 111 → 100 linhas. Saiu a exclusão do snapshot em
  `estoque_real` e o bloqueio quando existia aprovado mais recente do mesmo vendedor —
  esse bloqueio protegia a cadeia de snapshots, que não existe mais
- O nome `-e-ajustar` foi mantido para não mexer na URL implantada nem no cliente. Não há
  mais ajuste algum ali; é dívida cosmética consciente

Ambas as respostas preservam `data.message`, que é o único campo que o front lê — nenhuma
quebra. Corrigido também o texto de fallback `'Inventário aprovado e estoque ajustado!'`,
que afirmava algo que deixou de acontecer.

> **⚠️ Deploy só depois da Etapa 4c.** A dependência é a escrita em `estoque_real` durante
> a aprovação: quem lê esse snapshot é a comparação antiga
> (`comparar_estoque_inventario_paginado`). Depois da 4a a Conferência não a usa mais, mas
> **`useDashboardMetricsQuery` e `useVendedoresDesempenhoQuery` ainda usam**. Se as funções
> subirem antes da 4c, inventários aprovados no intervalo ficam sem snapshot e a acuracidade
> do Dashboard cai de ~100% para ~0%. Deploy das edge functions junto com a 4c.

### ✅ Etapa 4a — Conferência despida

`Conferencia.tsx` reescrita: 1393 → 1136 linhas, lint limpo (o resto do projeto tem 50
erros de baseline).

Saíram: `DivergenciaStats`, `usaSomaParaNegativo` + `calcularDiferenca`, os filtros
sobras/faltas/corretos/não-contados, `itensNaoContados`, `custosMap` para valoração de
divergência, o resumo financeiro (Total Faltas / Total Sobras / Saldo Devedor), o diálogo de
nota de retorno, o guard de "movimentos posteriores" que consultava `pedidos`, e a chamada a
`comparar_estoque_inventario_paginado` — **a tela não faz mais nenhum RPC de comparação**,
os itens vêm do próprio `useConferenciaQuery`.

Entraram: busca por vendedor + paginação global na lista de inventários; seleção múltipla
com **"Juntar inventários"** (escolha do destino, aviso de quantos serão excluídos, bloqueio
quando os selecionados são de vendedores diferentes); resumo de produtos / unidades / valor
total; diálogo de confirmação para reverter aprovação, que antes não existia.

A tabela de itens passou de `Produto | Teórico | Físico | Diferença | Valor` para
`Produto | Quantidade | Valor`, mantendo edição inline e exclusão de item.

### ✅ Etapa 4b — Tela "Comparar Inventários"

`src/pages/CompararInventarios.tsx` + `src/hooks/useCompararInventariosQuery.ts`, rota
`/comparar-inventarios` (gerente), item de menu logo abaixo de Conferência.

- Filtro de vendedor que estreita as duas listas; trocar de vendedor limpa a seleção
- Selects de **A (base)** e **B (comparado)**, cada um desabilitando o inventário já
  escolhido no outro lado, mais um botão de trocar os lados
- Quatro cartões de resumo: produtos comparados (com quantos em ambos e quantos sem
  diferença), só no A, só no B, e unidades A → B com o saldo
- Tabela `Produto | Qtd A | Qtd B | Diferença | Situação`, com busca, filtro
  (com diferença / todos / sem diferença / em ambos / só no A / só no B), paginação global e
  exportação para Excel
- **Aviso quando não há nenhum produto em comum**, explicando que isso indica contagens
  parciais e sugerindo juntar os inventários na Conferência. Foi o padrão medido nos dados
  reais, então a tela fala disso em vez de exibir 100% de diferença sem contexto

O hook busca a RPC em lotes de 500 e acumula, porque filtro e paginação são no cliente.
`useInventariosOpcoesQuery` é uma lista leve, sem carregar itens.

### ⬜ Etapa 4c — Remoção do subsistema ERP

Páginas: `EstoqueTeorico.tsx`, `HistoricoEstoqueReal.tsx`, `Importar.tsx`, `Pedidos.tsx`
(rotas e itens de menu). Hooks: `useEstoqueTeoricoQuery`, `useHistoricoEstoqueRealQuery`,
`usePedidosQuery`, `useNotaRetornoQuery`, `useEstoqueTeoricoPorVendedor` (já morto).
Componentes: `ImportContext` + `ImportBlocker` + `ImportProgress`, `VendedorEstoqueCard` e
`NavLink` (já mortos). `lib/estoque.ts` inteiro. Tipos `EstoqueItem`, `ExcelRow`, `Pedido`,
`ItemPedido`. Edge function `criar-nota-retorno`.

Cirurgia: Dashboard (`useDashboardQuery` usa `calcularEstoqueTeorico` + `pedidos` +
`itens_pedido` + `estoque_real`) e Painel de Vendedores (`useVendedoresDesempenhoQuery`
chama `calcular_estoque_vendedor`, `get_entradas_pedidos`, `get_saidas_pedidos`).

**A decidir nesta etapa:** a métrica de acuracidade (`useDashboardMetricsQuery`) é derivada
de comparação automática. Com a comparação fora do fluxo, provavelmente sai também.

### ⬜ Etapa 5 — Drops no banco

Ordem: funções → trigger `trigger_estoque_real_updated_at` → tabelas (`itens_pedido` antes
de `pedidos`, por causa do FK `ON DELETE CASCADE`) → `estoque_real`.

Funções a dropar: `calcular_estoque_vendedor`, `_ate_data`, `_paginado`,
`calcular_estoque_teorico_pos_inventario`, `comparar_estoque_teorico_vs_real` (+`_paginado`),
`get_estoque_real_vendedor`, `get_entradas_pedidos` (+`_paginado`), `get_saidas_pedidos`
(+`_paginado`), `comparar_estoque_inventario` e `comparar_estoque_inventario_paginado`.

**Não tocar:** `get_user_role` e `get_user_codigo_vendedor` são usadas nas policies RLS de
tabelas que ficam. Estão no meio das migrations de pedidos — risco real de remoção por
associação.

`npm run db:types` no fim. As migrations antigas continuam criando as tabelas, então o
histórico não precisa ser editado e o replay do zero segue funcionando.

### ⬜ Etapa 6 — Verificação

`npm run db:diff` limpo, `tsc --noEmit`, `vite build`, e smoke test dos fluxos
sobreviventes: vendedor salva inventário → aparece no histórico → gerente revisa e aprova →
exporta XML → compara dois inventários.

## O que permanece

Núcleo: `Inventario.tsx` + RPC `salvar_inventario` + `ImportInventarioModal` +
`ExportInventarioModal` (JSON/Excel) + `useCodigosCorrecaoQuery`. `Historico.tsx` +
`useInventariosQuery`. `Conferencia.tsx` (despida) + `useConferenciaQuery`.
`Produtos.tsx` + `atualizar_valores_produtos` + `codigos_correcao`. `Vendedores.tsx` +
edge `criar-vendedor`. `lib/gerarXmlCiclone.ts` + as duas abas de XML. Auth inteiro.
Tabelas `inventarios`, `itens_inventario`, `produtos`, `codigos_correcao`, `profiles`.

`produtos` continua integralmente necessária: `valor_produto` alimenta o `valor_unitario`
do XML.

## Armadilhas registradas

- Nome declarado em `RETURNS TABLE` vira variável PL/pgSQL e colide com coluna homônima no
  corpo da função (`column reference is ambiguous`). Foi o que quebrou `juntar_inventarios`
  na primeira tentativa
- Se `db:diff` ou `db:reset` falhar no meio, rodar `npm run db:stop` antes de tentar de
  novo — o shadow database fica segurando a porta 54420
- Carregar dados de produção no banco local exige
  `SET session_replication_role = replica` (`profiles` referencia `auth.users`, que não vem
  no dump de `public`) e `TRUNCATE` antes, porque `codigos_correcao` já vem populada por
  migration
- O trigger de `updated_at` é `BEFORE UPDATE` incondicional: qualquer UPDATE sobrescreve a
  data. Desligar durante a operação se o valor histórico importar

## Backups

Em `../Inventario_App_backup/` (fora do repositório):

- `legado_pedidos_estoque_real_20260804.sql` — as 3 tabelas condenadas, 2,2 MB
- `inventarios_antes_migracao_baixado_20260804.sql` — antes da normalização de status
- `inventarios_e_itens_antes_do_juntar_20260804.sql` — antes de existir função que apaga
