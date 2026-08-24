import { eixoDe, filtrarPeloCaminho, type EixoId, type Medida, type Totais } from '@/lib/panorama';
import type { LinhaPanorama } from '@/hooks/usePanoramaQuery';

/**
 * Comparativo — as quatro fontes do Panorama lado a lado.
 *
 * Responde a última pergunta da lista do gestor: "como o estoque atual se compara com
 * as entradas e saídas". Junta saídas, entradas, estoque interno e estoque externo
 * pela hierarquia de categoria e deriva o que só existe no cruzamento — saldo do
 * período, estoque total e cobertura.
 *
 * ## Por que só por CATEGORIA
 *
 * As quatro fontes falam a mesma língua em marca/tipo/subtipo/grupo, e **só ali**. Nos
 * outros eixos elas divergem de propósito (tipo de saída não existe em estoque) ou o
 * grão não bate: o estoque interno é por MODELO, enquanto externo, entradas e saídas
 * descem até o CÓDIGO AUXILIAR. Por isso este módulo não desce até o produto — seria
 * confrontar duas medidas que não são a mesma coisa.
 *
 * ## A correção que os números exigem
 *
 * **Remessa não é saída e retorno de remessa não é entrada.** As duas movem mercadoria
 * entre a empresa e a mala do representante — o estoque TOTAL não muda, só troca de
 * lugar. Somá-las junto de venda e compra inflaria os dois lados e faria o saldo do
 * período mentir.
 *
 * Então cada movimento cai em uma de duas contas:
 *
 *   - **com o mundo** (`entrou` / `saiu`): compra, devolução, venda, bonificação. É o
 *     que de fato aumenta ou diminui o que a empresa tem.
 *   - **transferência** (`paraMala`): remessa menos retorno de remessa. Não altera o
 *     total; explica a divisão entre estoque interno e externo.
 */

/** Classificação de SAÍDA que é transferência para a mala, não venda. */
const SAIDA_TRANSFERENCIA = 'REMESSA';

/** Classificação de ENTRADA que é retorno da mala, não compra. */
const ENTRADA_TRANSFERENCIA = 'RETORNO DE REMESSA';

/**
 * Os quatro conjuntos que a tela já carregou, cada um no seu grão.
 *
 * ⚠️ **O estoque total é `interno + externo`, e o inventário NÃO entra na soma.**
 * Interno (empresa) e externo (mala, saldo do ERP) são partes disjuntas do mesmo
 * saldo. O inventário é a mesma mala CONTADA — somá-lo ao externo contaria a mala
 * duas vezes. Ele tem lente própria justamente para ser confrontado, não somado.
 */
export interface FontesComparativo {
  saidas: readonly LinhaPanorama[];
  entradas: readonly LinhaPanorama[];
  /** Saldo na empresa. */
  interno: readonly LinhaPanorama[];
  /** Saldo da mala pelo ERP — nunca a contagem. */
  externo: readonly LinhaPanorama[];
}

const ZERO: Totais = { quantidade: 0, valor: 0, linhas: 0 };

const acumular = (acc: Totais, l: LinhaPanorama): Totais => ({
  quantidade: acc.quantidade + (Number(l.quantidade) || 0),
  valor: acc.valor + (Number(l.valor) || 0),
  linhas: acc.linhas + (Number(l.linhas) || 0),
});

export interface NoComparativo {
  chave: string;
  rotulo: string;
  /** Compras e devoluções — o que entrou vindo de fora. */
  entrou: Totais;
  /** Vendas e bonificações — o que saiu para fora. */
  saiu: Totais;
  /** Remessa menos retorno, em unidades. Positivo = foi para a mala no período. */
  paraMala: number;
  interno: Totais;
  externo: Totais;
  /** `entrou − saiu`. O quanto o estoque total deveria ter mudado no período. */
  saldoPeriodo: number;
  estoqueTotal: number;
  /**
   * Meses de estoque no ritmo de saída do período. `null` quando não houve saída —
   * dividir por zero daria infinito, e "infinitos meses de cobertura" é ruído, não
   * informação. A tela mostra um traço.
   */
  cobertura: number | null;
}

/** Eixos em que as quatro fontes concordam. É o que a lente comparativa oferece. */
export const EIXOS_COMPARATIVO: EixoId[] = ['marca', 'tipo', 'subtipo', 'grupo'];

/**
 * Agrupa as quatro fontes por um eixo e cruza os totais.
 *
 * `meses` é o tamanho do período em meses, usado só na cobertura. Vem de fora porque
 * quem sabe o intervalo pedido é a tela — deduzi-lo dos meses PRESENTES nas saídas
 * daria um número maior em categorias que ficaram paradas parte do período.
 */
export function compararPorEixo(
  fontes: FontesComparativo,
  eixo: EixoId,
  ordem: readonly EixoId[],
  caminho: readonly string[],
  meses: number
): NoComparativo[] {
  const e = eixoDe(eixo);
  const nos = new Map<string, NoComparativo>();

  const vazio = (chave: string, rotulo: string): NoComparativo => ({
    chave,
    rotulo,
    entrou: { ...ZERO },
    saiu: { ...ZERO },
    paraMala: 0,
    interno: { ...ZERO },
    externo: { ...ZERO },
    saldoPeriodo: 0,
    estoqueTotal: 0,
    cobertura: null,
  });

  const pegar = (l: LinhaPanorama): NoComparativo => {
    const chave = e.chaveDe(l);
    const atual = nos.get(chave) ?? vazio(chave, e.rotuloDe(l));
    nos.set(chave, atual);
    return atual;
  };

  for (const l of filtrarPeloCaminho(fontes.saidas, ordem, caminho)) {
    const no = pegar(l);
    if (l.classif_operacao === SAIDA_TRANSFERENCIA) no.paraMala += Number(l.quantidade) || 0;
    else no.saiu = acumular(no.saiu, l);
  }

  for (const l of filtrarPeloCaminho(fontes.entradas, ordem, caminho)) {
    const no = pegar(l);
    if (l.classif_entrada === ENTRADA_TRANSFERENCIA) no.paraMala -= Number(l.quantidade) || 0;
    else no.entrou = acumular(no.entrou, l);
  }

  for (const l of filtrarPeloCaminho(fontes.interno, ordem, caminho)) {
    const no = pegar(l);
    no.interno = acumular(no.interno, l);
  }

  for (const l of filtrarPeloCaminho(fontes.externo, ordem, caminho)) {
    const no = pegar(l);
    no.externo = acumular(no.externo, l);
  }

  for (const no of nos.values()) {
    no.saldoPeriodo = no.entrou.quantidade - no.saiu.quantidade;
    no.estoqueTotal = no.interno.quantidade + no.externo.quantidade;
    const porMes = meses > 0 ? no.saiu.quantidade / meses : 0;
    no.cobertura = porMes > 0 ? no.estoqueTotal / porMes : null;
  }

  return [...nos.values()];
}

/** O total de tudo, para a faixa de indicadores. Mesma conta, sem agrupar. */
export function totalComparativo(
  fontes: FontesComparativo,
  ordem: readonly EixoId[],
  caminho: readonly string[],
  meses: number
): NoComparativo {
  // Reusa `compararPorEixo` com um eixo qualquer e soma os nós: garante que o total da
  // faixa e a soma da lista venham da MESMA conta. Calculá-lo à parte é como duas
  // somas do mesmo número acabam divergindo por um filtro esquecido de um lado.
  const nos = compararPorEixo(fontes, 'marca', ordem, caminho, meses);
  const total: NoComparativo = {
    chave: '',
    rotulo: 'Total',
    entrou: { ...ZERO },
    saiu: { ...ZERO },
    paraMala: 0,
    interno: { ...ZERO },
    externo: { ...ZERO },
    saldoPeriodo: 0,
    estoqueTotal: 0,
    cobertura: null,
  };

  for (const no of nos) {
    for (const campo of ['entrou', 'saiu', 'interno', 'externo'] as const) {
      total[campo] = {
        quantidade: total[campo].quantidade + no[campo].quantidade,
        valor: total[campo].valor + no[campo].valor,
        linhas: total[campo].linhas + no[campo].linhas,
      };
    }
    total.paraMala += no.paraMala;
  }

  total.saldoPeriodo = total.entrou.quantidade - total.saiu.quantidade;
  total.estoqueTotal = total.interno.quantidade + total.externo.quantidade;
  const porMes = meses > 0 ? total.saiu.quantidade / meses : 0;
  total.cobertura = porMes > 0 ? total.estoqueTotal / porMes : null;
  return total;
}

/**
 * Ordena pela medida ativa, maior primeiro, usando o ESTOQUE TOTAL como critério.
 *
 * É o estoque que dá sentido à linha inteira aqui: "onde está o meu dinheiro parado"
 * é a pergunta da lente. Ordenar por saída faria a lista virar mais um ranking de
 * vendas, que as outras duas lentes já respondem melhor.
 */
export function ordenarComparativo(nos: NoComparativo[], medida: Medida): NoComparativo[] {
  const valorDe = (n: NoComparativo) =>
    medida === 'valor' ? n.interno.valor + n.externo.valor : n.estoqueTotal;
  return [...nos].sort(
    (a, b) => valorDe(b) - valorDe(a) || a.rotulo.localeCompare(b.rotulo, 'pt-BR')
  );
}
