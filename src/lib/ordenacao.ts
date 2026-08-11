/**
 * Estado de ordenação de tabela — o tipo e a transição, sem nada de React.
 *
 * Separado de `CabecalhoOrdenavel` porque um arquivo que exporta componente E função
 * pura quebra o Fast Refresh do Vite: qualquer edição na função remonta o componente e
 * o estado da tela se perde no meio do desenvolvimento.
 */

export type DirecaoOrdem = 'asc' | 'desc';

export interface Ordenacao<T extends string> {
  campo: T;
  direcao: DirecaoOrdem;
}

/**
 * Alterna a ordenação: mesma coluna inverte a direção, coluna nova começa na direção
 * inicial dela.
 *
 * A direção inicial é POR COLUNA de propósito. Texto começa em A→Z, mas número costuma
 * começar no MAIOR: quem clica em "Quantidade" numa conferência está procurando o item
 * fora da curva, e servir primeiro os zeros gasta um clique toda vez.
 */
export function alternarOrdem<T extends string>(
  atual: Ordenacao<T>,
  campo: T,
  direcaoInicial: DirecaoOrdem = 'asc'
): Ordenacao<T> {
  if (atual.campo === campo) {
    return { campo, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' };
  }
  return { campo, direcao: direcaoInicial };
}
