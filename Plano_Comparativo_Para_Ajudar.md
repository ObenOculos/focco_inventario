# Plano — Comparativo de Inventários (Enriquecimento de Dados + Modo Gestor)

## 1. Objetivo geral

Duas frentes que se conectam:

1. **Dados**: trazer do Ciclone (ERP) os atributos reais de produto (Marca/Coleção, Tipo, Grupo, Subgrupo, Cor) para o Supabase, hoje ausentes ou salvos apenas como código.
2. **Visualização**: criar o **modo Gestor** na tela de Comparativo de Inventários — uma camada de leitura gerencial (cards/indicadores) em cima dos modos já existentes (Detalhado e Resumido), usando esses novos atributos para agrupar e filtrar.

O modo Gestor só entrega valor completo depois que os dados de Marca/Tipo/Subtipo estiverem disponíveis — por isso as duas frentes precisam ser tratadas em conjunto.

---

## 2. O que já foi descoberto no Ciclone (frente de dados)

Mapeamento confirmado, com 100% de cobertura nos produtos de óculos (3.728 produtos):

| Atributo pedido | Onde mora no Ciclone | Valores reais |
|---|---|---|
| Marca / Coleção | `eq_colecao.eqcol_descricao` via `eq_produtogenerico.eqcol_codigo` | OBEN (2.885), POWER (756), CORE EYES (85), POPULAR (2) |
| Tipo | `eq_tipoproduto.eqtpr_descricao` via `eqtpr_codigo` | OCULOS RECEITUARIO, OCULOS SOLAR |
| Grupo | `eq_grupogenerico.eqgrg_descricao` | ACETATO (2.433), METAL (1.288), DIVERSOS (7) |
| Subgrupo | `eq_grupoespecifico.eqgru_descricao` | FEMININO (2.385), MASCULINO (1.336), DIVERSOS (7) |
| Nome da cor | `eq_corespecifica.eqcor_nome` via `eqpee_cor` | 83 cores (PRETO BRILHO, AZUL FOSCO, DEMIN MARROM…) — 10.072/10.072 grades cobertas |

Campos descartados por virem vazios/constantes: curva ABC, família, unidade, `eqgpr`/`eqpas`.

### ✅ Escopo confirmado (resolvidas as pendências da v1 do plano)

- **Marca = Coleção.** Não são campos distintos — `eq_colecao.eqcol_descricao` já é a Marca. Não precisa de cadastro adicional no Ciclone.
- **Subtipo = Subgrupo.** `eq_grupoespecifico.eqgru_descricao` (FEMININO/MASCULINO/DIVERSOS) é o campo de Subtipo.

Com isso, o mapeamento final de atributos fica:

| Campo no app | Fonte no Ciclone |
|---|---|
| Marca | `eq_colecao.eqcol_descricao` |
| Tipo | `eq_tipoproduto.eqtpr_descricao` |
| Subtipo | `eq_grupoespecifico.eqgru_descricao` |
| Grupo (material) | `eq_grupogenerico.eqgrg_descricao` |
| Cor | `eq_corespecifica.eqcor_nome` |

Nenhum cadastro adicional é necessário no Ciclone — os quatro campos que o gestor pediu (Marca, Tipo, Subtipo, e o Grupo como atributo extra de material) já existem e têm 100% de cobertura.

### Ganho colateral já mapeado
O campo cor no app hoje guarda o código (`A01`) em vez do nome (`PRETO BRILHO`). Resolve com um `LEFT JOIN` a mais — baixo custo, alto valor percebido.

---

## 3. O rascunho do gestor — leitura do esboço

O desenho mostra a estrutura que ele espera ver, coerente com a spec do modo Gestor:

**Bloco RESUMIDO**
- Hierarquia: Marca(s) → Tipo → Subtipo
- Exemplo: OBEM → RECEITUÁRIO → MET (−02) / ACT (−03), com total de divergência em R$ (ex.: R$ 5.390,10)
- Ou seja: por grupo de produto, ele quer ver rapidamente **quanto está faltando** e o **impacto financeiro**.

**Bloco ANALÍTICO**
- Colunas: OS, REF, MET, com código de cor e lote (ex.: `031102 COR`, `1001 A01`)
- Isto é, o detalhamento produto a produto dentro de uma categoria — bate com o nível "Detalhado" descrito no texto ajustado por IA.

Isso confirma o fluxo já especificado:
`Gestor → Analítico (cards por categoria, com faltas/sobras/corretos e impacto R$) → seleciona categoria → Detalhado (produtos individuais: código auxiliar, qtd esperada, qtd encontrada, diferença)`

---

## 4. Especificação funcional — Modo Gestor

Mantém **Detalhado** e **Resumido** como estão hoje. Adiciona **Gestor**, com dois níveis:

- **Analítico** — visão geral: cards agrupados por categoria de produto (Marca/Tipo/Grupo, a definir), mostrando faltas, sobras, itens corretos e impacto financeiro por categoria. Não é uma tabela disfarçada de card — é uma camada de leitura própria, priorizando "onde está o problema".
- **Detalhado (dentro do Gestor)** — ao clicar numa categoria, abre a lista de produtos daquela categoria: código auxiliar, qtd esperada, qtd encontrada, diferença.

Perguntas que a tela precisa responder rápido:
1. Qual categoria tem o maior problema?
2. Quantos produtos estão faltando nessa categoria?
3. Qual o impacto (R$) dessa divergência?
4. Quais produtos exatos são responsáveis por ela?

Regra importante: **reaproveitar a lógica de cálculo do comparativo existente** — o modo Gestor é uma nova camada de apresentação, não um novo motor de regras.

---

## 5. Plano técnico de implementação

Três frentes, na ordem de dependência:

### 5.1 `erp-gateway/main.py`
- Atualizar `SQL_CATALOGO` com os `JOIN`s para trazer Coleção, Tipo, Grupo, Subgrupo e Nome da Cor.

### 5.2 Migration no Supabase
- Novas colunas em `produtos` e `produtos_sincronizacao`.
- Incluir os campos novos em:
  - `enviar_lote_produtos`
  - `concluir_sincronizacao_produtos`
  - comparação da prévia de sincronização

### 5.3 `CompararInventarios.tsx`
- Novo modo **Gestor** (Analítico + Detalhado), usando os campos novos para agrupar/filtrar.
- Reaproveitar cálculo de divergência já existente; não duplicar regra.

---

## 6. Roadmap sugerido

| Fase | Entregável | Depende de |
|---|---|---|
| 1 | Migration Supabase (novas colunas: Marca, Tipo, Subtipo, Grupo, Cor) | — |
| 2 | Atualizar `erp-gateway/main.py` (SQL_CATALOGO com joins) | Fase 1 |
| 3 | Rodar sincronização e validar dados chegando corretos (nome da cor, marca, tipo, subtipo, grupo) | Fase 2 |
| 4 | Construir nível Analítico do modo Gestor (cards por categoria, com drill-down Marca → Tipo → Subtipo → Grupo) | Fase 3 |
| 5 | Construir nível Detalhado do modo Gestor (drill-down por categoria) | Fase 4 |
| 6 | Validação com o gestor comparando com o rascunho original | Fase 5 |

---

## 7. Pontos resolvidos

1. **Critério de agrupamento no Analítico**: usar a hierarquia do próprio Ciclone — Marca → Tipo → Subtipo → Grupo. Os cards seguem essa navegação em níveis (não é filtro simultâneo, é drill-down).
2. **Impacto R$**: o valor de R$ 5.390,10 no esboço era só um exemplo ilustrativo do gestor, não uma regra real de cálculo. Não há fórmula a replicar por enquanto — se esse indicador entrar no card, precisa ser definido do zero (provavelmente qtd. de diferença × custo/preço do produto, a confirmar quando for priorizado).