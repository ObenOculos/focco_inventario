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
 * **A conta que faz a onda funcionar:** o atraso entre pontos é exatamente 1/3 do ciclo
 * (0,5s de 1,5s). Com os picos da animação em 30% do ciclo, isso os distribui em 30%,
 * 63% e 96% — espaçamento uniforme, nenhum instante sem movimento, e o loop emenda
 * sozinho porque o quarto pico cairia em 130%, que é o 30% da volta seguinte. Atraso
 * arbitrário (0,15s, por exemplo) agruparia os três no começo e deixaria uma pausa morta
 * no fim de cada volta.
 *
 * Mexer na duração em `tailwind.config.ts` exige recalcular `ATRASOS`.
 *
 * **Quando usar cada coisa** (ver DESIGN_SYSTEM.md, seção 8):
 *   - `PageLoader`      → nada se sabe ainda: sessão, perfil, chunk de rota.
 *   - Skeleton          → a forma do conteúdo é conhecida; preserva o layout e evita
 *                         o salto quando o dado chega.
 *   - Spinner em botão  → ação disparada pelo usuário.
 */

/** 1/3 do ciclo de 1,5s, um por ponto, da esquerda para a direita. */
const ATRASOS = ['0ms', '500ms', '1000ms'] as const;

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
