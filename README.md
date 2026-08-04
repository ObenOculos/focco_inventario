# Inventário de Vendedores

Aplicação para registrar inventários físicos feitos por vendedores externos, revisá-los e
aprová-los, comparar contagens entre si e exportar os dados no formato XML do ERP Ciclone.

## O que o sistema faz

São **duas funcionalidades independentes**, deliberadamente desacopladas.

### 1. Fluxo de inventário

```
vendedor conta  →  envia para aprovação  →  gerente revisa  →  aprova  →  inventário salvo
```

Não há cálculo de divergência nesse caminho. O gerente revisa a lista contada — podendo
corrigir quantidades e remover itens — e aprova. Um inventário aprovado pode ter a aprovação
revertida, voltando para `pendente`.

Inventários fragmentados (o vendedor salva uma mesma sessão de contagem em vários
inventários) podem ser unidos: na Conferência, seleção múltipla → **Juntar inventários**. As
quantidades somam no inventário de destino e os demais são excluídos.

### 2. Comparação de inventários

Tela separada, de consulta. O usuário escolhe dois inventários — A e B — e vê a diferença
produto a produto, com `diferença = B − A`. Não interfere em aprovação nem grava nada, então
pode ser usada livremente para análise.

### Exportação XML

Gera o XML no formato Ciclone (`pedidovenda`) a partir de um inventário: as quantidades vêm
da contagem e os valores unitários da tabela de produtos, escolhendo entre tabela de venda e
de remessa. Gerar o XML **não altera nada** no sistema — pode ser repetido quantas vezes for
necessário. Há também uma aba que gera o mesmo XML a partir de uma planilha Excel, como saída
manual.

## Papéis

| Papel      | Acesso                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `vendedor` | Fazer inventário, ver o próprio histórico                                                              |
| `gerente`  | Dashboard, Conferência, Comparar Inventários, Exportar XML, Painel e Cadastro de Vendedores, Produtos   |

O papel é lido de `profiles.role`. **Atenção:** todo código que derive papel do perfil precisa
tratar `profile === null` como indefinido, nunca como vendedor — há um guard em
`ProtectedRoute` justamente para bloquear o estado "logado sem perfil", que antes rebaixava a
interface do gerente silenciosamente.

## Stack

Vite · React · TypeScript · Tailwind · shadcn/ui · TanStack Query · Supabase (Postgres, Auth,
Edge Functions)

## Rodando localmente

```sh
npm install
npm run dev
```

Variáveis de ambiente em `.env`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## Scripts

| Comando             | O que faz                                                           |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento                                         |
| `npm run build`     | Build de produção                                                   |
| `npm run typecheck` | Verificação de tipos                                                |
| `npm run lint`      | ESLint                                                              |
| `npm run format`    | Prettier                                                            |
| `npm run db:*`      | Banco e migrations — ver [`supabase/README.md`](supabase/README.md)  |

> **Use `npm run typecheck`, não `npx tsc --noEmit`.** O `tsconfig.json` da raiz tem
> `"files": []` e apenas project references, então `tsc --noEmit` sem `-p` **não verifica
> arquivo nenhum** e passa em silêncio mesmo com erros reais. O script aponta para
> `tsconfig.app.json`, que é o que de fato checa o código.

## Banco de dados

Cinco tabelas: `profiles`, `produtos`, `codigos_correcao`, `inventarios`, `itens_inventario`.

| Função                                           | Papel                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `salvar_inventario(id, obs, items, status)`       | Salva/atualiza um inventário e seus itens, atômico e idempotente |
| `comparar_dois_inventarios(a, b, limit, offset)`  | Comparativo entre dois inventários. Só gerente                   |
| `juntar_inventarios(destino, origens[])`          | Soma origens no destino e **apaga** as origens. Só gerente       |
| `atualizar_valores_produtos(updates)`             | Atualização em lote de preços. Só gerente                        |
| `get_user_role` / `get_user_codigo_vendedor`      | Usadas pelas policies RLS — **não remover**                      |

Edge functions: `aprovar-e-ajustar-inventario`, `reverter-aprovacao-inventario`,
`criar-vendedor`.

Migrations são controladas pela CLI. Convenções, portas locais e comandos em
[`supabase/README.md`](supabase/README.md).

## Restrições que moldam o código

**Limite de 1000 linhas em RPCs.** O PostgREST corta o retorno de funções RPC em 1000 linhas,
independente de `.limit()` no cliente. Por isso as funções que podem devolver muitas linhas
recebem `p_limit` / `p_offset` e o frontend acumula em lotes — ver
`useCompararInventariosQuery`. Vale o mesmo para `.select()` em tabelas grandes: os fetches de
`itens_inventario` são paginados em blocos de 1000.

**Códigos de produto normalizados.** `codigo_auxiliar` é sempre comparado e gravado com
`upper(trim(...))`, e quantidades de códigos repetidos são somadas — tanto em
`salvar_inventario` quanto em `juntar_inventarios`. A tabela tem unique em
`(inventario_id, codigo_auxiliar)`.

**Grants não estão nas migrations.** As tabelas de `public` em produção têm
`GRANT SELECT/INSERT/UPDATE/DELETE` para `anon`, `authenticated` e `service_role` (padrão do
Supabase), mas nenhuma migration concede isso. Um banco recriado do zero nega toda leitura
antes mesmo de a RLS ser avaliada. Se for recriar em staging, conceda os grants manualmente
ou escreva a migration que falta.

**`db:diff` não é garantia completa.** Já se comprovou que ele reporta "No schema changes
found" com funções presentes no remoto e ausentes das migrations, e não acusa diferença de
grants. Trate silêncio como indício, não como prova.

## Histórico

A refatoração que reduziu o app a esse escopo — removendo o subsistema de estoque teórico
derivado de pedidos do ERP, importação de pedidos e notas de retorno — está documentada em
[`PLANO_SIMPLIFICACAO.md`](PLANO_SIMPLIFICACAO.md), com as medições que sustentaram cada
decisão.
