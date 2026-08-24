/**
 * Indicador de carregamento de página — o único do sistema.
 *
 * Existiam quatro telas de carregamento em três linguagens diferentes: duas em
 * `ProtectedRoute` (sessão e perfil), uma no `HomeRedirect` e o texto cru
 * "Carregando..." no fallback do `Suspense`. As três com anel giravam um **quadrado**:
 * a classe `rounded-full` nunca esteve lá.
 *
 * Agora são três pontos que crescem em onda, da esquerda para a direita.
 *
 * **A conta que faz a onda funcionar:** a defasagem entre pontos é exatamente 1/3 do
 * ciclo (0,5s de 1,5s). Com os picos da animação em 30% do ciclo, isso os distribui em
 * 30%, 63% e 96% — espaçamento uniforme, nenhum instante sem movimento, e o loop emenda
 * sozinho porque o quarto pico cairia em 130%, que é o 30% da volta seguinte. Defasagem
 * arbitrária (0,15s, por exemplo) agruparia os três no começo e deixaria uma pausa morta
 * no fim de cada volta.
 *
 * **Por que os atrasos são NEGATIVOS.** `animation-delay` positivo não defasa a onda: ele
 * PRENDE o elemento no primeiro quadro até o atraso vencer. Com `0/500/1000ms` os dois
 * últimos pontos ficavam parados enquanto o primeiro já pulsava, e a onda só ficava
 * correta depois de 1,5s — o defeito era visível a cada carregamento. Atraso negativo
 * começa a animação JÁ ADIANTADA naquele tanto, então os três entram em movimento no
 * primeiro quadro, cada um numa fase diferente.
 *
 * O sinal inverte a ordem: quem começa mais adiantado no ciclo dá a volta primeiro. Para
 * a onda continuar indo da esquerda para a direita, o ponto `i` entra em
 * `-(ciclo - i × defasagem)`, o que põe os picos em 450 ms, 950 ms e 1450 ms.
 *
 * Mexer na duração em `tailwind.config.ts` exige mudar `CICLO_MS` junto.
 *
 * **Quando usar cada coisa** (ver DESIGN_SYSTEM.md, seção 8):
 *   - `PageLoader`      → nada se sabe ainda: sessão, perfil, chunk de rota.
 *   - Skeleton          → a forma do conteúdo é conhecida; preserva o layout e evita
 *                         o salto quando o dado chega.
 *   - Spinner em botão  → ação disparada pelo usuário.
 */

/** Precisa casar com `animation.respirar` em `tailwind.config.ts`. */
const CICLO_MS = 1500;
const PONTOS = 3;
const DEFASAGEM_MS = CICLO_MS / PONTOS;

/**
 * Fase inicial de cada ponto — todas ≤ 0, para os três animarem desde o primeiro quadro.
 *
 * O primeiro fica em 0 (começa no início do ciclo); os demais entram adiantados, e é o
 * complemento (`ciclo − i × defasagem`) que mantém a onda indo para a direita.
 */
const ATRASOS = Array.from({ length: PONTOS }, (_, i) =>
  i === 0 ? '0ms' : `-${CICLO_MS - i * DEFASAGEM_MS}ms`
);

interface PageLoaderProps {
  /** Texto anunciado a leitores de tela. Não aparece na interface. */
  label?: string;
  /**
   * Por padrão ocupa a altura da janela (carregamento de rota). Use `inline` para
   * carregar dentro de uma área já renderizada, sem forçar 100vh.
   */
  inline?: boolean;
}

export function PageLoader({ label = 'Carregando', inline = false }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${inline ? 'py-16' : 'min-h-screen bg-background'}`}
    >
      <span className="flex items-center gap-1.5" aria-hidden>
        {ATRASOS.map((atraso) => (
          // `motion-reduce` desliga a animação para quem pede menos movimento no
          // sistema; os pontos continuam visíveis, apenas parados.
          <span
            key={atraso}
            style={{ animationDelay: atraso }}
            className="size-2.5 rounded-full bg-primary animate-respirar motion-reduce:animate-none"
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
