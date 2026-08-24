import type { Medida } from '@/lib/panorama';

/**
 * Como o Panorama escreve número.
 *
 * Existe porque a mesma grandeza aparece em três larguras muito diferentes na mesma
 * tela — o cartão de indicador, a célula da árvore e a linha do detalhe — e cada uma
 * comporta uma quantidade de dígitos. Com os formatadores espalhados, cada lugar
 * resolvia o aperto do seu jeito e `R$ 5.551.886,50` estourava a coluna.
 *
 * A regra é a mesma em todos: **quando o espaço aperta, o que sai primeiro são os
 * centavos**, depois a precisão dos milhares. O valor exato nunca some — vai no
 * `title` da célula, que é onde alguém confere um número antes de agir sobre ele.
 */

const MOEDA_CHEIA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Sem centavos. Em coluna de tabela eles são dois dígitos que ninguém lê e que estouram. */
const MOEDA_SEM_CENTAVOS = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** `R$ 5,6 mi`. O `compact` do Intl já fala português — não é abreviação nossa. */
const MOEDA_COMPACTA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const INTEIRO_COMPACTO = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Acima de um milhão a notação vira compacta.
 *
 * O corte é aqui porque `R$ 5.551.887` são doze caracteres — não cabem numa coluna de
 * tabela em nenhuma largura razoável — enquanto `R$ 999.999` cabe. Abaixo do corte o
 * número continua inteiro, que é o que o gestor prefere quando dá.
 */
const CORTE_COMPACTO = 1_000_000;

export const moeda = (v: number) => MOEDA_CHEIA.format(v);
export const inteiro = (v: number) => INTEIRO.format(v);

/** Para célula de tabela: sem centavos, compacto quando passa de um milhão. */
export const moedaCurta = (v: number) =>
  Math.abs(v) >= CORTE_COMPACTO ? MOEDA_COMPACTA.format(v) : MOEDA_SEM_CENTAVOS.format(v);

export const inteiroCurto = (v: number) =>
  Math.abs(v) >= CORTE_COMPACTO ? INTEIRO_COMPACTO.format(v) : INTEIRO.format(v);

/** O valor na medida ativa, na versão curta. */
export const curto = (t: { quantidade: number; valor: number }, medida: Medida) =>
  medida === 'valor' ? moedaCurta(t.valor) : inteiroCurto(t.quantidade);

/**
 * O valor exato, para o `title`.
 *
 * Sempre traz as DUAS grandezas: quem passa o mouse num número está conferindo, e nesse
 * momento saber que 2.009 unidades valem R$ 162.137,80 é metade da resposta.
 */
export const exato = (t: { quantidade: number; valor: number }) =>
  `${INTEIRO.format(t.quantidade)} un. · ${MOEDA_CHEIA.format(t.valor)}`;

/** Sinal explícito em números que podem ser negativos (saldo, divergência). */
export const comSinal = (v: number) => `${v >= 0 ? '+' : ''}${INTEIRO.format(v)}`;

const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/**
 * Fração para porcentagem. `null` vira traço.
 *
 * Recebe FRAÇÃO (0,38), não 38 — é o que `Intl` espera e o que a lib produz, e
 * converter num lugar só evita o clássico erro de multiplicar por 100 duas vezes.
 */
export const percentual = (v: number | null) => (v === null ? '—' : PORCENTAGEM.format(v));
