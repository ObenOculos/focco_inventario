# Design System — OPTISTOCK

Padrão visual obrigatório para todas as telas, atuais e futuras.

**Regra que governa todas as outras:** se um ajuste visual serve para mais de uma tela, ele
pertence ao token ou ao componente base — não ao `className` da página. Uma correção aplicada
numa tela só é, por definição, uma inconsistência criada nas outras.

---

## 1. Onde mora o quê

| Camada | Arquivo | Governa |
|---|---|---|
| Tokens | `src/index.css` | cor, raio, sombra, foco, tipografia base |
| Mapeamento | `tailwind.config.ts` | expõe os tokens como classes utilitárias |
| Componentes base | `src/components/ui/*` | forma padrão de botão, campo, cartão, tabela… |
| Componentes de domínio | `src/components/*` | `PageHeader`, `StatusInventarioBadge`, `Pagination`… |
| Telas | `src/pages/*` | composição. **Não redefinem estilo base** |

⚠️ **Nunca redefinir classe utilitária do Tailwind em CSS.** Havia duas regras assim, ambas
removidas: `.w-64 { width: 18rem !important }` e `@media (max-width:767px) { .h-10 { height: 2rem } }`.
A segunda encolhia todo controle de 40px para 32px no mobile e era a razão de cada tela
escrever `h-11` à mão.

---

## 2. Cores

Só tokens semânticos. **Nenhuma cor crua do Tailwind** (`text-green-700`, `bg-amber-500/10`,
`border-sky-500/30`) — elas não existem no tema escuro e já produziram três verdes e dois
âmbares diferentes para o mesmo significado.

### Base

| Token | Uso |
|---|---|
| `background` | fundo da página |
| `card` | superfície elevada (cartão, modal, cabeçalho) |
| `foreground` | texto principal |
| `muted-foreground` | texto secundário, rótulo, ícone inativo |
| `muted` | fundo neutro (chip, cabeçalho de tabela, código) |
| `border` | traço; `border-border/80` em superfícies |
| `primary` | marca, ação primária, item de menu ativo |
| `accent` | hover de superfície neutra |

### Estados

Quatro estados, **mesmo contrato de quatro tons** em cada um:

| Tom | Para quê |
|---|---|
| `success` / `warning` / `info` / `destructive` | preenchimento sólido (ponto, barra, botão de estado) |
| `*-foreground` | texto sobre o preenchimento sólido |
| `*-subtle` | superfície clara — fundo de badge e de alerta |
| `*-strong` | texto e ícone sobre a superfície clara, contraste AA |

```tsx
// ✅  fundo suave + texto forte, funciona nos dois temas
<div className="bg-warning-subtle text-warning-strong">

// ❌  não tem equivalente no escuro, e é o terceiro âmbar do projeto
<div className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
```

**Significado fixo:** `success` = concluído/aprovado · `warning` = precisa de atenção, ainda
não falhou · `destructive` = erro, bloqueio ou ação irreversível · `info` = neutro informativo.
Nunca escolher a cor pela estética.

### Tema escuro

Os tokens `.dark` existem e estão completos, **mas nada no app aplica a classe `dark`** — não
há seletor de tema desde a remoção do `next-themes`. Consequência prática: **escrever `dark:`
numa tela é código morto**. Ou se liga um seletor, ou não se escreve `dark:`.

---

## 3. Tipografia

Família única: **Plus Jakarta Sans**, carregada pelo `<link>` do `index.html`.

| Papel | Classe | Onde |
|---|---|---|
| Título de página | `text-2xl sm:text-3xl font-bold tracking-tight` | um por tela, via `PageHeader` |
| Subtítulo de página | `text-sm text-muted-foreground` | idem |
| Título de seção | `text-base font-semibold tracking-tight` | `CardTitle` (já é o padrão) |
| Corpo | `text-sm` | padrão de tabela e formulário |
| Apoio | `text-xs text-muted-foreground` | metadados, notas |
| Badge / marcador | `text-2xs` (10px) | status, contadores — token próprio, não `text-[10px]` |
| Rótulo de campo | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | formulários |
| Número em destaque | `text-2xl font-bold tabular-nums` | cartões de métrica |
| Código / SKU | `font-mono text-xs` | `codigo_auxiliar` |

**`tabular-nums` é obrigatório** em qualquer número que apareça em coluna ou seja comparado
entre linhas — sem isso os dígitos têm larguras diferentes e a coluna "dança".

Pesos: `font-medium` para ênfase leve, `font-semibold` para rótulo e botão, `font-bold` só
para título de página e número de destaque. Nada de `font-black` ou `font-light`.

---

## 4. Espaçamento

Escala do Tailwind, sem valores arbitrários. Múltiplos de 4px; `0.5` (2px) só em ajuste ótico.

| Contexto | Valor |
|---|---|
| Entre blocos da página | `space-y-6` |
| Entre elementos de um bloco | `space-y-4` |
| Dentro de um agrupamento | `gap-2` / `gap-3` |
| Padding de cartão | `p-6` (`p-5` em cartão de métrica) |
| Padding do `<main>` | `p-4 md:p-6` |
| Célula de tabela | `px-4 py-3` |

Shell padrão de toda página:

```tsx
<AppLayout>
  <div className="space-y-6">
    <PageHeader title="…" description="…" action={…} isFetching={…} />
    {/* … */}
  </div>
</AppLayout>
```

Não usar `antialiased` nas páginas: já está no `body`.

---

## 5. Raio de borda

Escala inteira derivada de `--radius` (10px) em `tailwind.config.ts`. Mudar essa variável
reforma o sistema todo.

| Classe | Valor | Uso |
|---|---|---|
| `rounded-sm` | 6px | marcador, chip minúsculo |
| `rounded-md` | 8px | item de menu, elemento interno |
| `rounded-lg` | 10px | **badge** |
| `rounded-xl` | 12px | **controle**: botão, input, select, item de nav |
| `rounded-2xl` | 16px | **superfície**: cartão, modal, alerta |

Regra mnemônica: **controle 12, superfície 16**. `rounded-full` só em avatar e ponto de status.

---

## 6. Sombra

Interface plana. Sombra indica **camada**, não decoração.

| Classe | Uso |
|---|---|
| `shadow-2xs` | repouso sutil (controle em superfície) |
| `shadow-xs` | cartão — **padrão do `Card`** |
| `shadow-lg` | camada flutuante: modal, dropdown, gaveta |

Nada de `shadow-md`/`xl`/`2xl` em conteúdo estático. Hover não deve mudar sombra em elemento
não clicável.

---

## 7. Componentes

### Botão

Altura padrão **44px** (`h-11`) — alvo de toque mínimo. Raio `rounded-xl`. Tudo já vem do
componente: **não escrever `className="h-11 rounded-xl"`**.

| `size` | Altura | Uso |
|---|---|---|
| `default` | 44px | padrão |
| `sm` | 36px | ação secundária densa |
| `lg` | 48px | CTA isolado |
| `icon` | 44×44 | ação só-ícone |
| `iconSm` | 36×36 | ação em linha de tabela ou cartão |

Variantes: `default` (primária, **uma por tela**), `outline` (secundária), `ghost` (terciária),
`destructive` (só ação irreversível, sempre com confirmação), `secondary`, `link`.

Botão só-ícone **exige** `aria-label`. Botão que dispara operação assíncrona **exige** estado
`disabled` enquanto executa.

### Formulário

- `Input` e `SelectTrigger` nascem com 44px e `rounded-xl` — não repetir.
- Rótulo sempre com `htmlFor` apontando para o `id` do campo.
- Texto de ajuda: `<p className="text-xs text-muted-foreground mt-1.5">`.
- Erro: `text-xs text-destructive-strong mt-1.5`, sempre junto ao campo — nunca só em toast.
- Ordem: rótulo → campo → ajuda/erro.

### Tabela

- Envolver em `<div className="border border-border/80 rounded-xl overflow-hidden">`.
- Cabeçalho: `bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground font-semibold`.
- Célula: `py-3`. Número à direita com `tabular-nums`; texto à esquerda; ações à direita.
- Coluna ordenável: cursor pointer, ícone `ArrowUpDown` de 13px, feedback por **cor**, não por fundo.
- Linha desativada: `bg-muted/30` + `text-muted-foreground`. **Nunca `opacity`** — cinza sobre
  cinza fica ilegível.
- No mobile, tabela com mais de 4 colunas vira lista de cartões (`useIsMobile`).

### Cartão

`Card` já traz `rounded-2xl border-border/80 shadow-xs`. Não repetir.
`CardTitle` é `text-base font-semibold` — é rótulo de seção, não título de tela.

### Modal

`DialogContent` já é `rounded-2xl shadow-lg`. Título `text-xl font-bold tracking-tight`.
Ação primária ao final do formulário, largura total, com estado de envio.
Ação destrutiva usa `AlertDialog`, nunca `Dialog`.

### Badge, alerta e indicador

Sempre por **variante**, nunca por `className` de cor:

```tsx
<Badge variant="success | warning | info | destructive | neutral | secondary | outline">
<Alert variant="success | warning | info | destructive | default">
```

**Proporção do badge** (escolhida a partir da tela Exportar XML, que virou a referência):
`px-2.5 py-0.5 text-2xs font-semibold rounded-lg`, fundo `*-subtle` e borda `*/30`. Badge é
etiqueta, não protagonista — nas versões maiores (`text-xs px-3 py-1`) ele roubava peso do dado
ao lado.

Status de inventário **sempre** via `<StatusInventarioBadge status={…} />`, e o rótulo em texto
corrido via `rotuloStatusInventario(status)`. É a fonte única de cor e de nome — existiam
**quatro** implementações independentes (`Historico`, `Vendedores`, `XmlPorInventarioTab`,
`Conferencia`) que divergiam em matiz, em opacidade e até no texto. A da `Conferencia` era a pior:
imprimia o valor cru do enum com `capitalize`, exibindo **"Revisao"** sem acento, e pintava
"Aprovado" de **azul primário** enquanto as outras três usavam verde.

---

## 8. Estados

**Carregando.** Usar skeleton (`TableSkeleton`, `StatsCardsSkeleton`, `DashboardSkeleton`), que
preserva o layout. Texto "Carregando..." só quando não há forma conhecida. Spinner só dentro de
botão em ação.

**Vazio.** Ícone (44px, `text-muted-foreground/50`) + frase do que aconteceu + ação de saída.
Se houver filtro ativo, dizer isso e oferecer "Limpar filtros".

**Erro.** `<Alert variant="destructive">` no lugar onde o dado apareceria. Toast só para
resultado de ação do usuário, nunca como único canal de erro de carregamento.

**Hover.** `hover:bg-accent/60` em navegação, `hover:bg-muted/30` em linha de tabela,
`hover:bg-primary/90` em botão primário. Só em elemento interativo.

**Foco.** Vem do `:focus-visible` global (`outline: 2px solid hsl(var(--ring))`). Não declarar
anel por componente e **nunca** usar `focus:outline-none` sem repor equivalente.

**Desabilitado.** `disabled:opacity-50 disabled:pointer-events-none` (já nos componentes base).

---

## 9. Ícones

`lucide-react`, só ele. Tamanhos: **16px** em botão e linha, **18px** em navegação, **20px** em
cabeçalho, **44px** em estado vazio. Traço padrão, sem preenchimento.

Ícone decorativo ao lado de texto não precisa de rótulo acessível; ícone sozinho precisa de
`aria-label`. Um conceito, um ícone — não alternar entre `Users` e `UserCog` para "vendedor".

---

## 10. Responsividade

Breakpoints do Tailwind. `sm` 640 · `md` 768 (limite mobile/desktop do layout) · `lg` 1024 ·
`xl` 1280.

- Menu lateral aparece em `md+`; abaixo disso, gaveta + barra inferior.
- Alvo de toque mínimo 44px — a razão de `h-11` ser o padrão.
- Tabela larga vira cartões no mobile, não rolagem horizontal.
- Grade de métricas: `grid-cols-2 xl:grid-cols-4`.
- O `<main>` não tem largura máxima; telas de formulário podem usar `max-w-4xl mx-auto`.

---

## 11. Checklist para tela nova

- [ ] `AppLayout` > `div.space-y-6` > `PageHeader`
- [ ] Nenhuma cor crua do Tailwind — só tokens semânticos
- [ ] Nenhum `dark:` (não há seletor de tema)
- [ ] Botões e campos sem `h-11`/`rounded-xl` manual
- [ ] Uma única ação primária
- [ ] Números com `tabular-nums`
- [ ] Estados de carregando, vazio e erro cobertos
- [ ] Botão só-ícone com `aria-label`
- [ ] Status de inventário via `StatusInventarioBadge`
- [ ] Testado abaixo de 768px
- [ ] `npm run typecheck && npm run build && npm run lint`

---

## 12. Estado da conformidade

Varredura de 2026-08-05, após a migração — todos os pendentes da primeira rodada foram
fechados:

| Verificação | Resultado |
|---|---|
| Cores cruas do Tailwind em telas | **0** (eram ~60) |
| Variantes `dark:` | **0** (eram 21, todas código morto) |
| `hsl()` cravado em componente | **0** (eram 4, nos toasts) |
| Implementações de badge de status | **1** (eram 5) |
| Grafias do `<h1>` de página | **1**, via `PageHeader` (eram 3) |
| Classes utilitárias redefinidas em CSS | **0** (eram 2) |

Os dois `<h1>` fora do `PageHeader` são intencionais: `Auth` e `NotFound` não usam
`AppLayout`.

### Decisão pendente: tema escuro

Os tokens `.dark` estão completos e corretos, mas **nada aplica a classe `dark`**. Como toda
cor passou a vir de token, ligar um seletor de tema é hoje trabalho de uma tarde — e nenhuma
tela precisará ser tocada. Enquanto não houver seletor, **não escrever `dark:`**.

### Dívida deliberada

`Produtos.tsx` ainda tem linhas muito longas e blocos de resultado de importação com estrutura
própria. O estilo foi normalizado (borda de 1px, raio do sistema, tokens de estado), mas a
composição não foi reescrita — seria refatoração de comportamento, fora do escopo de UI.
