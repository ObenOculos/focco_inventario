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

/**
 * As cinco fontes que uma linha do comparativo carrega.
 *
 * Vive aqui, e não no componente que desenha a linha, porque é vocabulário do domínio:
 * a lib sabe quais fontes existem, e a árvore, o painel de detalhe e a página precisam
 * concordar sobre isso sem uma delas ser dona das outras.
 */
export type FonteDetalhe = 'entrou' | 'saiu' | 'interno' | 'externo' | 'inventario';

/** Eixos que fazem sentido para cada fonte — o vocabulário próprio de cada uma. */
export const EIXOS_DA_FONTE: Record<FonteDetalhe, EixoId[]> = {
  saiu: ['classificacao', 'tipoPedido'],
  entrou: ['classifEntrada', 'fornecedor', 'uf'],
  externo: ['terceiro', 'uf'],
  inventario: ['vendedor'],
  interno: ['situacao'],
};

export const TITULO_DA_FONTE: Record<FonteDetalhe, string> = {
  saiu: 'Saídas',
  entrou: 'Entradas',
  externo: 'Na mala (ERP)',
  inventario: 'Contado pelo representante',
  interno: 'Na empresa',
};

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
  /** A mesma mala CONTADA. Entra na linha para ser confrontada, nunca somada. */
  inventario: readonly LinhaPanorama[];
  /**
   * Saídas da JANELA DE COBERTURA — os últimos N meses completos.
   *
   * Separada de `saidas` de propósito. `saidas` responde "quanto saiu no período que
   * você escolheu"; esta responde "qual é o ritmo de saída do negócio", e as duas
   * perguntas não podem compartilhar a base. Ver `janelaCobertura`.
   */
  demanda: readonly LinhaPanorama[];
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
  /** A mala contada. Fora de `estoqueTotal` de propósito — ver `FontesComparativo`. */
  inventario: Totais;
  /**
   * `inventario − externo`, em unidades. O número mais valioso da linha: mede a
   * distância entre o que o ERP acha que está na mala e o que foi contado nela.
   *
   * `null` quando o vendedor daquele recorte não tem inventário aprovado — aí não há
   * divergência, há ausência de contagem, e mostrar "−1.200" acusaria um sumiço que
   * não aconteceu.
   */
  divergencia: number | null;
  /** `entrou − saiu`. O quanto o estoque total deveria ter mudado no período. */
  saldoPeriodo: number;
  estoqueTotal: number;
  /** Saída média por mês na janela de cobertura. É o denominador, exposto para a tela. */
  porMes: number;
  /**
   * Meses que o estoque de hoje dura no ritmo da JANELA DE COBERTURA — nunca no ritmo
   * do período exibido.
   *
   * `null` quando não houve saída na janela: dividir por zero daria infinito, e
   * "cobertura infinita" é ruído, não informação. A tela mostra um traço.
   */
  cobertura: number | null;
}

/** Eixos em que as quatro fontes concordam. É o que a lente comparativa oferece. */
export const EIXOS_COMPARATIVO: EixoId[] = ['marca', 'tipo', 'subtipo', 'grupo'];

/**
 * Agrupa as quatro fontes por um eixo e cruza os totais.
 *
 * `mesesJanela` é o tamanho da janela de COBERTURA (3, 6 ou 12 meses completos), não do
 * período exibido. Vem de fora porque deduzi-lo dos meses PRESENTES nas saídas daria um
 * número maior em categorias que ficaram paradas parte da janela — uma marca que vendeu
 * só em julho teria a cobertura calculada como se vendesse todo mês.
 */
export function compararPorEixo(
  fontes: FontesComparativo,
  eixo: EixoId,
  ordem: readonly EixoId[],
  caminho: readonly string[],
  mesesJanela: number
): NoComparativo[] {
  const e = eixoDe(eixo);
  const saiuNaJanela = new Map<string, number>();
  const nos = new Map<string, NoComparativo>();

  const vazio = (chave: string, rotulo: string): NoComparativo => ({
    chave,
    rotulo,
    entrou: { ...ZERO },
    saiu: { ...ZERO },
    paraMala: 0,
    interno: { ...ZERO },
    externo: { ...ZERO },
    inventario: { ...ZERO },
    divergencia: null,
    saldoPeriodo: 0,
    estoqueTotal: 0,
    porMes: 0,
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

  const comInventario = new Set<string>();
  for (const l of filtrarPeloCaminho(fontes.inventario, ordem, caminho)) {
    const no = pegar(l);
    no.inventario = acumular(no.inventario, l);
    comInventario.add(no.chave);
  }

  // A demanda NÃO cria nós: uma categoria que vendeu na janela mas sumiu do período e
  // do estoque não deve aparecer como linha — ela não tem nada a mostrar hoje.
  for (const l of filtrarPeloCaminho(fontes.demanda, ordem, caminho)) {
    if (l.classif_operacao === SAIDA_TRANSFERENCIA) continue;
    const chave = e.chaveDe(l);
    saiuNaJanela.set(chave, (saiuNaJanela.get(chave) ?? 0) + (Number(l.quantidade) || 0));
  }

  for (const no of nos.values()) {
    // Só há divergência onde houve contagem. Sem inventário, `0 − externo` acusaria um
    // sumiço que ninguém mediu.
    no.divergencia = comInventario.has(no.chave)
      ? no.inventario.quantidade - no.externo.quantidade
      : null;
    no.saldoPeriodo = no.entrou.quantidade - no.saiu.quantidade;
    no.estoqueTotal = no.interno.quantidade + no.externo.quantidade;
    no.porMes = mesesJanela > 0 ? (saiuNaJanela.get(no.chave) ?? 0) / mesesJanela : 0;
    no.cobertura = no.porMes > 0 ? no.estoqueTotal / no.porMes : null;
  }

  return [...nos.values()];
}

/** O total de tudo, para a faixa de indicadores. Mesma conta, sem agrupar. */
export function totalComparativo(
  fontes: FontesComparativo,
  ordem: readonly EixoId[],
  caminho: readonly string[],
  mesesJanela: number
): NoComparativo {
  // Reusa `compararPorEixo` com um eixo qualquer e soma os nós: garante que o total da
  // faixa e a soma da lista venham da MESMA conta. Calculá-lo à parte é como duas
  // somas do mesmo número acabam divergindo por um filtro esquecido de um lado.
  const nos = compararPorEixo(fontes, 'marca', ordem, caminho, mesesJanela);
  const total: NoComparativo = {
    chave: '',
    rotulo: 'Total',
    entrou: { ...ZERO },
    saiu: { ...ZERO },
    paraMala: 0,
    interno: { ...ZERO },
    externo: { ...ZERO },
    inventario: { ...ZERO },
    divergencia: null,
    saldoPeriodo: 0,
    estoqueTotal: 0,
    porMes: 0,
    cobertura: null,
  };

  let algumInventario = false;
  for (const no of nos) {
    if (no.divergencia !== null) algumInventario = true;
    for (const campo of ['entrou', 'saiu', 'interno', 'externo', 'inventario'] as const) {
      total[campo] = {
        quantidade: total[campo].quantidade + no[campo].quantidade,
        valor: total[campo].valor + no[campo].valor,
        linhas: total[campo].linhas + no[campo].linhas,
      };
    }
    total.paraMala += no.paraMala;
    total.porMes += no.porMes;
  }

  total.divergencia = algumInventario
    ? total.inventario.quantidade - total.externo.quantidade
    : null;
  total.saldoPeriodo = total.entrou.quantidade - total.saiu.quantidade;
  total.estoqueTotal = total.interno.quantidade + total.externo.quantidade;
  total.cobertura = total.porMes > 0 ? total.estoqueTotal / total.porMes : null;
  return total;
}

export interface PontoMensalComparativo {
  mes: string;
  entrou: number;
  saiu: number;
}

/**
 * Entradas e saídas do recorte, mês a mês, na medida ativa.
 *
 * As duas juntas respondem o que nenhuma sozinha responde: se a empresa está comprando
 * no ritmo em que vende. Só o FLUXO tem série — estoque é saldo de agora e não existe
 * "estoque de março" no ERP.
 */
export function serieComparativa(
  fontes: FontesComparativo,
  ordem: readonly EixoId[],
  caminho: readonly string[],
  medida: Medida
): PontoMensalComparativo[] {
  const meses = new Map<string, PontoMensalComparativo>();
  const pegar = (mes: string) => {
    const atual = meses.get(mes) ?? { mes, entrou: 0, saiu: 0 };
    meses.set(mes, atual);
    return atual;
  };

  for (const l of filtrarPeloCaminho(fontes.saidas, ordem, caminho)) {
    if (!l.mes || l.classif_operacao === SAIDA_TRANSFERENCIA) continue;
    pegar(l.mes).saiu += Number(l[medida]) || 0;
  }
  for (const l of filtrarPeloCaminho(fontes.entradas, ordem, caminho)) {
    if (!l.mes || l.classif_entrada === ENTRADA_TRANSFERENCIA) continue;
    pegar(l.mes).entrou += Number(l[medida]) || 0;
  }

  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Recorta o FLUXO a um mês, deixando o estoque intacto.
 *
 * ⚠️ E o estoque fica intacto de propósito, não por esquecimento: saldo é foto de
 * agora e não existe "estoque em março". Filtrar por mês responde "o que entrou e saiu
 * naquele mês", enquanto as colunas de estoque continuam dizendo "quanto temos hoje" —
 * a tela precisa rotulá-las assim para a leitura não sugerir um saldo histórico que
 * ninguém guardou.
 */
export function recortarPorMes(fontes: FontesComparativo, mes: string | null): FontesComparativo {
  if (!mes) return fontes;
  return {
    ...fontes,
    saidas: fontes.saidas.filter((l) => l.mes === mes),
    entradas: fontes.entradas.filter((l) => l.mes === mes),
  };
}

/** Separador de chaves no caminho. Caractere que não existe nos dados nem no teclado. */
const SEP = '\x1f';

export const chaveDoCaminho = (caminho: readonly string[]) => caminho.join(SEP);

export interface NoArvore extends NoComparativo {
  /** Profundidade, 0 na raiz. Vira indentação. */
  nivel: number;
  /** Chaves da raiz até aqui, inclusive — é o identificador de expansão. */
  caminho: string[];
  temFilhos: boolean;
}

/**
 * A hierarquia inteira num scroll só, com os nós abertos já resolvidos.
 *
 * **Por que árvore expansível e não um nível por vez.** Navegar substituindo a tela a
 * cada clique é visão de túnel: para comparar OBEN com POWER dentro de RECEITUARIO o
 * gestor precisava subir e descer duas vezes, guardando o primeiro número de cabeça.
 * Expandindo no lugar, os dois ficam visíveis juntos. O `PainelGestor` já tinha
 * aprendido isso — foi reescrito assim depois da queixa "vou clicando e vai abrindo as
 * camadas".
 *
 * O custo é recalcular os filhos de cada nó aberto a cada render. É aceitável porque
 * tudo aqui é soma sobre arrays já em memória, e só os nós ABERTOS são calculados —
 * uma árvore fechada custa uma passada, igual à lista antiga.
 */
export function construirArvore(
  fontes: FontesComparativo,
  ordem: readonly EixoId[],
  expandidos: ReadonlySet<string>,
  mesesJanela: number,
  medida: Medida
): NoArvore[] {
  const saida: NoArvore[] = [];

  const descer = (caminho: string[], nivel: number) => {
    const eixo = ordem[nivel];
    if (!eixo) return;
    const nos = ordenarComparativo(
      compararPorEixo(fontes, eixo, ordem, caminho, mesesJanela),
      medida
    );

    for (const no of nos) {
      const caminhoDoNo = [...caminho, no.chave];
      const temFilhos = nivel + 1 < ordem.length;
      saida.push({ ...no, nivel, caminho: caminhoDoNo, temFilhos });
      if (temFilhos && expandidos.has(chaveDoCaminho(caminhoDoNo))) {
        descer(caminhoDoNo, nivel + 1);
      }
    }
  };

  descer([], 0);
  return saida;
}

/** Todas as chaves expansíveis da árvore — alimenta o "expandir tudo". */
export function chavesExpansiveis(
  fontes: FontesComparativo,
  ordem: readonly EixoId[],
  mesesJanela: number
): string[] {
  const chaves: string[] = [];
  const descer = (caminho: string[], nivel: number) => {
    const eixo = ordem[nivel];
    if (!eixo || nivel + 1 >= ordem.length) return;
    for (const no of compararPorEixo(fontes, eixo, ordem, caminho, mesesJanela)) {
      const c = [...caminho, no.chave];
      chaves.push(chaveDoCaminho(c));
      descer(c, nivel + 1);
    }
  };
  descer([], 0);
  return chaves;
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
