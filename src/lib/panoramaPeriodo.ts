import {
  differenceInCalendarMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
} from 'date-fns';
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
 * A data está preenchida e é real?
 *
 * ⚠️ **Existe por causa de como o `<input type="date">` funciona, não por paranoia.**
 * Ele exibe `dia/mês/ano` para quem está no Brasil, mas o `value` que emite é sempre
 * ISO — e ele emite a CADA tecla do campo de ano. Digitar "2026" passa por `0002-…`,
 * `0020-…`, `0202-…` antes de chegar ao valor certo. O log do gateway registrou
 * exatamente isso: `GET /saidas?de=0202-01-01`, uma consulta ao Ciclone para um ano que
 * não existe.
 *
 * Limpar o campo é o outro caso: o valor vira string vazia, e `parseISO('')` devolve
 * `Invalid Date`, que faz `format` lançar em vez de devolver algo ruim.
 *
 * O corte em 2000 é generoso de propósito — não é regra de negócio, é só o piso abaixo
 * do qual a data só pode ter vindo de digitação pela metade.
 */
export function dataValida(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseISO(iso);
  return !Number.isNaN(d.getTime()) && d.getFullYear() >= 2000;
}

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
 * A base da cobertura, já resolvida: o intervalo, o divisor e como se escreve.
 *
 * As três coisas juntas num objeto só porque **elas têm de concordar**. `meses` é o
 * DENOMINADOR de `porMes`, e um divisor que não corresponda ao intervalo somado no
 * numerador produz uma cobertura errada sem nenhum sintoma visível — o número continua
 * plausível. Devolvê-los separados seria convidar os dois a se soltarem um do outro.
 */
export interface JanelaEfetiva {
  de: string;
  ate: string;
  /** Meses COMPLETOS que o intervalo cobre. É o divisor. `0` = intervalo vazio. */
  meses: number;
  /** `mai–jul/26`. Para exibir ao lado do número. */
  rotulo: string;
  /**
   * O fim pedido foi puxado para trás por cair no mês corrente.
   *
   * Nasce aqui porque é aqui que o fato acontece — quem desenha só precisa dizer que
   * aconteceu. Recalcular isso na tela seria repetir a regra em dois lugares, e a
   * segunda cópia é a que envelhece.
   */
  recuado: boolean;
}

/** `2026-05-01` a `2026-07-31` -> `mai–jul/26`. Um mês só sai como `jul/26`. */
function escrever(inicio: Date, fim: Date): string {
  const curto = (d: Date, comAno = false) =>
    format(d, comAno ? 'MMM/yy' : 'MMM', { locale: ptBR });
  return differenceInCalendarMonths(fim, inicio) === 0
    ? curto(fim, true)
    : `${curto(inicio)}–${curto(fim, true)}`;
}

/** O último mês que já fechou. É o teto de qualquer janela — ver `janelaPorData`. */
const ULTIMO_MES_COMPLETO = endOfMonth(subMonths(HOJE, 1));

/**
 * Base FIXA: os últimos N meses completos. É o comportamento histórico da tela.
 */
export function janelaFixa(meses: JanelaCobertura): JanelaEfetiva {
  const fim = ULTIMO_MES_COMPLETO;
  const inicio = startOfMonth(subMonths(HOJE, meses));
  return {
    de: format(inicio, FORMATO_ISO),
    ate: format(fim, FORMATO_ISO),
    meses,
    rotulo: escrever(inicio, fim),
    recuado: false,
  };
}

/**
 * Base por DATA: um intervalo escolhido à mão, normalizado para meses completos.
 *
 * ⚠️ **A normalização não é preciosismo, é a mesma proteção que a base fixa tem.** Três
 * coisas acontecem aqui, e cada uma evita um jeito de a cobertura mentir:
 *
 *   1. O início desce para o **começo do mês** e o fim sobe para o **fim do mês**. Meio
 *      mês no numerador dividido por um mês inteiro daria uma taxa menor que a real.
 *   2. O fim nunca passa do **último mês completo**. Escolher "até hoje" contaria os
 *      dias já corridos do mês corrente como se fossem o mês inteiro — foi exatamente
 *      esse o bug que fez a cobertura sair quinze vezes maior no recorte mais curto.
 *   3. O divisor sai do intervalo JÁ normalizado, nunca do que foi digitado.
 *
 * Quem chama recebe o intervalo efetivo de volta e a tela o exibe: normalizar calado
 * seria trocar um erro por uma surpresa.
 */
export function janelaPorData(de: string, ate: string): JanelaEfetiva {
  // Enquanto o usuário digita o ano, `de`/`ate` passam por valores impossíveis. Sair
  // com zero meses aqui é o que impede `format` de lançar e a tela de quebrar no meio
  // de uma digitação normal.
  if (!dataValida(de) || !dataValida(ate)) {
    return { de, ate, meses: 0, rotulo: '—', recuado: false };
  }
  const inicio = startOfMonth(parseISO(de));
  const pedido = endOfMonth(parseISO(ate));
  const recuado = pedido > ULTIMO_MES_COMPLETO;
  const fim = recuado ? ULTIMO_MES_COMPLETO : pedido;
  const meses = differenceInCalendarMonths(fim, inicio) + 1;
  if (meses <= 0) {
    // Intervalo invertido ou inteiramente no futuro. Zero meses faz `porMes` dar 0 e a
    // cobertura virar `null`, que a tela já sabe desenhar como traço.
    return { de, ate, meses: 0, rotulo: '—', recuado };
  }
  return {
    de: format(inicio, FORMATO_ISO),
    ate: format(fim, FORMATO_ISO),
    meses,
    rotulo: escrever(inicio, fim),
    recuado,
  };
}

/**
 * O que impede a consulta, em português, ou `null` se está tudo certo.
 *
 * Mora aqui porque DOIS lugares precisam da mesma resposta e por motivos diferentes: o
 * painel a exibe e desabilita o botão, a página a usa para barrar a ação. Calculada em
 * duplicata, uma das cópias envelhece — e a que envelhecer para o lado permissivo deixa
 * passar a consulta que a outra estava exibindo como impossível.
 *
 * A ordem das checagens é a ordem em que se conserta: com uma data pela metade, dizer
 * "a inicial não pode ser posterior à final" seria reclamar do problema errado.
 */
export function impedimentoDaConsulta(p: {
  de: string;
  ate: string;
  modoJanela: 'fixo' | 'data';
  mesesJanela: number;
}): string | null {
  if (!dataValida(p.de) || !dataValida(p.ate)) {
    return 'Preencha a data inicial e a final do período (dia/mês/ano).';
  }
  if (p.de > p.ate) return 'A data inicial do período não pode ser posterior à final.';
  if (p.modoJanela === 'data' && p.mesesJanela === 0) {
    return 'A base da cobertura não tem nenhum mês completo. Ajuste as datas dela.';
  }
  return null;
}

/** O padrão do modo Data: o mesmo intervalo que a base fixa corrente já produzia. */
export const janelaPadraoPorData = (meses: JanelaCobertura) => {
  const j = janelaFixa(meses);
  return { de: j.de, ate: j.ate };
};
