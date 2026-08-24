import { endOfMonth, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Os períodos que o Panorama oferece de atalho.
 *
 * Mora numa lib, e não na barra que os desenha, porque `usePanoramaEstado` também
 * precisa deles para saber o que é o padrão ao ler a URL — um hook importando de um
 * componente é dependência ao contrário.
 */

const HOJE = new Date();
const FORMATO_ISO = 'yyyy-MM-dd';

/**
 * Contados para TRÁS a partir do mês corrente, incluindo-o inteiro: "trimestre" é este
 * mês e os dois anteriores, não 90 dias corridos. É como se lê um fechamento.
 *
 * O padrão é o ANO CORRENTE até hoje — o recorte que abre praticamente toda pergunta
 * ("quanto vendemos esse ano"). O padrão anterior, seis meses para trás, atravessava a
 * virada do ano e misturava dois exercícios sem ninguém pedir.
 */
export const ATALHOS = [
  { id: 'mes', rotulo: 'Mês', meses: 1 },
  { id: 'trimestre', rotulo: 'Trimestre', meses: 3 },
  { id: 'semestre', rotulo: 'Semestre', meses: 6 },
  { id: 'ano', rotulo: 'Ano', meses: 0 },
] as const;

/** Intervalo de um atalho. `meses: 0` é o ano corrente, de 1º de janeiro até hoje. */
export function intervaloDoAtalho(meses: number): { de: string; ate: string } {
  const inicio = meses === 0 ? startOfYear(HOJE) : startOfMonth(subMonths(HOJE, meses - 1));
  // O fim é hoje, nunca o fim do mês: prometer dados de um dia que não chegou faria a
  // última coluna da série parecer uma queda de vendas.
  const fim = HOJE < endOfMonth(HOJE) ? HOJE : endOfMonth(HOJE);
  return { de: format(inicio, FORMATO_ISO), ate: format(fim, FORMATO_ISO) };
}

export const PERIODO_PADRAO = intervaloDoAtalho(0);

/** `2026-08-24` -> `24/08/2026`, sem passar por `Date` (a string já é ISO). */
export const dataCurta = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Janelas possíveis para a base de cálculo da COBERTURA.
 *
 * Doze existe por causa de sazonalidade: óculos solar concentra saída em poucos meses,
 * e uma base de três meses medida no inverno projetaria uma cobertura irreal. Três é o
 * padrão porque receituário domina o volume (medido em jun/2026: 5.290 unidades contra
 * 278 de solar) e ali o que importa é a atualidade, não a suavização.
 */
export const JANELAS_COBERTURA = [3, 6, 12] as const;
export type JanelaCobertura = (typeof JANELAS_COBERTURA)[number];
export const JANELA_PADRAO: JanelaCobertura = 3;

/**
 * A janela de demanda: os últimos `meses` **completos**, sem o mês corrente.
 *
 * ⚠️ Excluir o mês corrente não é preciosismo — é o conserto de um erro grave. A
 * versão anterior calculava a cobertura sobre o período ESCOLHIDO NA TELA e contava o
 * mês corrente como inteiro. Com "Mês" selecionado no dia 2, dois dias de venda eram
 * divididos por um mês: a taxa saía quinze vezes menor e a cobertura quinze vezes
 * maior, exatamente no recorte mais curto.
 *
 * A janela também é INDEPENDENTE do período exibido, e isso é o ponto: o período existe
 * para escolher o que se vê, e deixá-lo definir o que a cobertura significa fazia o
 * mesmo estoque render números completamente diferentes conforme um botão apertado por
 * outro motivo.
 */
export function janelaCobertura(meses: number): { de: string; ate: string } {
  const fim = endOfMonth(subMonths(HOJE, 1));
  const inicio = startOfMonth(subMonths(HOJE, meses));
  return { de: format(inicio, FORMATO_ISO), ate: format(fim, FORMATO_ISO) };
}

/** `mai–jul/26` — a base da cobertura, escrita para caber ao lado do número. */
export function rotuloJanela(meses: number): string {
  const fim = endOfMonth(subMonths(HOJE, 1));
  const inicio = startOfMonth(subMonths(HOJE, meses));
  const curto = (d: Date, comAno = false) =>
    format(d, comAno ? 'MMM/yy' : 'MMM', { locale: ptBR });
  return meses === 1 ? curto(fim, true) : `${curto(inicio)}–${curto(fim, true)}`;
}
