import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Aparelho de mão: celular E tablet, inclusive o iPad em paisagem (1024px).
 *
 * Existe separado do `useIsMobile` porque as duas perguntas são diferentes. `useIsMobile`
 * decide LAYOUT — a partir de 768px cabem duas colunas, e é onde a gaveta vira menu fixo.
 * Este decide ALCANCE DO POLEGAR: num tablet cabe tudo na tela, mas o controle que o
 * vendedor aperta trezentas vezes seguidas continua tendo que estar embaixo, não no topo.
 * Usar 768 aqui deixaria justamente o iPad — o aparelho de contagem mais comum depois do
 * celular — com a captura fora de alcance.
 */
const HANDHELD_BREAKPOINT = 1024;

function useAbaixoDe(largura: number) {
  const [abaixo, setAbaixo] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${largura - 1}px)`);
    const onChange = () => setAbaixo(window.innerWidth < largura);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [largura]);

  return !!abaixo;
}

export function useIsMobile() {
  return useAbaixoDe(MOBILE_BREAKPOINT);
}

/** Celular e tablet: onde a ação principal mora no rodapé e o alvo de toque é 44px. */
export function useIsHandheld() {
  return useAbaixoDe(HANDHELD_BREAKPOINT);
}
