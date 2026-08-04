# Supabase — como trabalhar neste projeto

Projeto remoto: **Inventario_Vendedores** (`evsneoercdzzwxmhuxid`, São Paulo).

Esta máquina tem vários projetos Supabase. As duas regras que evitam conflito entre eles:

1. **A CLI é `devDependency`**, não instalação global. Todo comando roda via `npm run ...`,
   que resolve `node_modules/.bin/supabase` deste projeto. Cada projeto pode ter a sua versão
   sem interferir nos outros — nunca use uma CLI global aqui.
2. **As portas locais são exclusivas deste projeto** (faixa `544xx`, declarada em `config.toml`).
   A faixa padrão `543xx` fica livre para os demais projetos.

| Serviço                  | Porta padrão | Aqui    |
| ------------------------ | ------------ | ------- |
| Shadow DB (`db diff`)    | 54320        | `54420` |
| API (PostgREST)          | 54321        | `54421` |
| Postgres                 | 54322        | `54422` |
| Studio                   | 54323        | `54423` |
| Inbucket (e-mails fake)  | 54324        | `54424` |

## Comandos

Sem Docker (funcionam já):

| Comando              | O que faz                                                        |
| -------------------- | ---------------------------------------------------------------- |
| `npm run db:link`    | Reconecta ao projeto remoto. Necessário depois de clonar o repo.  |
| `npm run db:status`  | Compara o histórico de migrations local × remoto.                 |
| `npm run db:types`   | Regenera `src/integrations/supabase/types.ts` a partir do remoto. |
| `npm run db:push`    | Aplica no remoto as migrations que faltam.                        |

Precisam do Docker Desktop rodando:

| Comando              | O que faz                                                              |
| -------------------- | ---------------------------------------------------------------------- |
| `npm run db:diff`    | Verificação de drift — **parcial**, ver ressalva abaixo.                 |
| `npm run db:pull`    | Transforma o drift encontrado numa migration nova.                      |
| `npm run db:check`   | Rotina completa: status + types + diff.                                 |
| `npm run db:start`   | Sobe o Supabase local completo (Postgres, Auth, Storage, Studio).       |
| `npm run db:stop`    | Derruba o stack local deste projeto.                                    |
| `npm run db:local`   | Mostra URLs e chaves do stack local.                                    |

## Por que o `db diff` precisa de Docker

Ele sobe um Postgres vazio num container (o *shadow database*), aplica todas as migrations
do zero, e compara o schema resultante com o do projeto remoto. O que sobra dessa comparação
é o drift — mudanças feitas direto pelo dashboard que nenhuma migration descreve.

`db:status` e `db:types` **não** enxergam esse tipo de drift: o primeiro só compara a lista
de migrations aplicadas, e o segundo só vê estrutura (tabelas, colunas, tipos, enums,
assinaturas de funções). Políticas RLS, triggers, índices, defaults e o corpo das funções
só aparecem no `db:diff`.

### Ressalva: silêncio do `db:diff` não é prova

Comprovado em 2026-08-04: o `db:diff` reportou **"No schema changes found"** enquanto três
funções existiam no remoto sem nenhuma migration que as criasse
(`comparar_estoque_teorico_vs_real_paginado`, `get_entradas_pedidos_paginado`,
`get_saidas_pedidos_paginado`). Elas só apareceram pelos NOTICEs de "does not exist, skipping"
ao aplicar `DROP FUNCTION IF EXISTS` no banco local.

Ele também **não acusa diferença de GRANTs de tabela** de forma consistente. Produção tem
`GRANT SELECT/INSERT/UPDATE/DELETE` para `anon`, `authenticated` e `service_role` em todas as
tabelas de `public` — padrão do Supabase — e nenhuma migration concede isso.

Consequência prática: **recriar o banco do zero (staging, ou o próprio local) não produz um
ambiente funcional.** `authenticated` fica só com `TRUNCATE/REFERENCES/TRIGGER` e toda leitura
é negada antes de a RLS ser avaliada. Para testar RLS localmente:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
```

Uma migration com os grants padrão resolveria de vez, mas envolve conceder a `anon` — decisão
a ser tomada de forma consciente, ainda que seja o padrão do Supabase e a RLS seja quem
protege os dados.

Para conferir o que existe no remoto sem depender do diff, compare listas explícitas:

```sh
npx supabase db dump --linked -f schema_remoto.sql   # schema completo, inclui grants
```

## Rotinas

**Verificar se local e remoto batem** — `npm run db:check`. Se `db:types` mexer no
`types.ts`, comite o arquivo. Se `db:diff` imprimir DDL, houve mudança feita pelo dashboard:
rode `npm run db:pull` para capturá-la numa migration.

**Criar uma mudança de schema** — `npx supabase migration new <nome>`, edite o SQL gerado em
`migrations/`, teste com `npm run db:start` + `npm run db:push` apontando para o local, e só
então `npm run db:push` no remoto. Depois, `npm run db:types`.

**Nunca** edite schema pelo dashboard sem depois rodar `db:pull` — é assim que local e remoto
se separam.

## Rodando dois projetos ao mesmo tempo

Funciona, desde que cada um tenha sua própria faixa de portas no `config.toml`. Os containers
são nomeados a partir do `project_id` (aqui, o ref do projeto), então não colidem. Ao adotar
esta mesma configuração em outro projeto, escolha outra faixa (`545xx`, `546xx`, ...) e
registre-a na tabela do README de lá.
