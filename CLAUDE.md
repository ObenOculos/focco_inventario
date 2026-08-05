# OPTISTOCK — instruções do projeto

App de inventário para representantes comerciais. React + Vite + TypeScript + Tailwind +
shadcn/ui, sobre Supabase, deploy na Vercel.

## Antes de mexer em qualquer coisa visual

**Leia `DESIGN_SYSTEM.md`.** Ele é obrigatório para toda tela, componente ou ajuste de estilo.

A regra que governa as outras: **se um ajuste serve para mais de uma tela, ele pertence ao
token ou ao componente base, não ao `className` da página.**

Resumo operacional — o documento tem o detalhe:

- **Cor:** só tokens semânticos (`success`, `warning`, `info`, `destructive`, cada um com
  `-subtle` para fundo e `-strong` para texto). **Nunca** `text-green-700`, `bg-amber-500/10`
  e afins.
- **Sem `dark:`** — nada no app aplica a classe `dark`; essas variantes são código morto.
- **Nunca redefinir classe utilitária do Tailwind em CSS.** Duas regras assim já quebraram o
  sistema em silêncio (ver o aviso no fim do `src/index.css`).
- **Controles nascem prontos:** `Button`, `Input` e `SelectTrigger` já são 44px com
  `rounded-xl`. Não escrever `className="h-11 rounded-xl"`.
- **Raio:** controle `rounded-xl` (12px), superfície `rounded-2xl` (16px), badge `rounded-lg`.
- **Página:** `AppLayout` > `div.space-y-6` > `PageHeader`.
- **Status de inventário:** sempre `<StatusInventarioBadge />`.
- **Números em coluna:** `tabular-nums`.
- **Botão só-ícone:** `aria-label` obrigatório.

Ao criar uma tela, percorra o checklist da seção 11 do `DESIGN_SYSTEM.md`.

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run typecheck    # tsc --noEmit -p tsconfig.app.json  (NÃO usar `tsc --noEmit` puro:
                     # o tsconfig raiz tem "files": [] e não verifica nada)
npm run build        # vite build — é o que pega import órfão
npm run lint
```

Banco: ver `supabase/README.md`. A CLI é `devDependency` e roda via `npm run db:*`; portas
locais na faixa `544xx`.

## Contexto que não está no código

- `PLANO_SIMPLIFICACAO.md` — a refatoração que reduziu o app a registrar inventários, guardar
  histórico, comparar dois inventários e exportar XML. Leia antes de retomar qualquer coisa
  ligada a estoque, pedidos ou ERP.
- `Apenas_Para_Consulta/` — sistema Python separado, com acesso local ao ERP Ciclone. É
  ferramenta viva e **desacoplada de propósito** (decisão de 2026-08-05); não tratar como
  código morto nem propor integrá-la ao app.

## Convenções

- Interface e comentários em **português**. Nomes de código em português quando o domínio é do
  negócio (`vendedor`, `inventario`, `codigo_auxiliar`).
- Comentário explica **por quê**, não o quê — de preferência a armadilha que ele evita.
- Toda operação de escrita passa por RLS; funções `SECURITY DEFINER` fazem a autorização no
  corpo.
