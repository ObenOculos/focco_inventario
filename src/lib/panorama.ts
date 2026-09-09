import { categoriaDa, SEM_CATEGORIA } from '@/lib/categoriasProduto';
import type { LinhaPanorama, RecortePanorama, Visao } from '@/hooks/usePanoramaQuery';

/**
 * Panorama — o pivô local sobre o agregado que veio do Ciclone.
 *
 * O gateway já somou por mês × empresa × categoria × eixo da lente. Daqui para
 * baixo nada volta ao ERP: filtrar, reagrupar, trocar de medida e descer um nível
 * são todos recortes sobre o mesmo array, e por isso são instantâneos. Mesmo
 * princípio do refino da Consulta ao ERP — a ida cara acontece uma vez.
 *
 * Tudo aqui é função pura, sem React: é o que permite recalcular a árvore inteira a
 * cada clique sem pensar em memoização.
 *
 * **Uma máquina, duas lentes.** Saídas e entradas compartilham medida, categoria e
 * drill-down; o que muda é o conjunto de eixos disponíveis. Por isso a lente é um
 * PARÂMETRO, não uma cópia do módulo.
 *
 * A hierarquia de PRODUTO (marca → tipo → subtipo → grupo) não é redefinida aqui:
 * ela vem de `categoriasProduto.ts`, que já é a definição única no app. O que este
 * módulo acrescenta são os eixos que só existem em movimentação.
 */

/** Qual grandeza está sendo lida. As duas nunca se misturam num mesmo número. */
export type Medida = 'quantidade' | 'valor';

export const MEDIDAS: { valor: Medida; rotulo: string }[] = [
  { valor: 'quantidade', rotulo: 'Unidades' },
  { valor: 'valor', rotulo: 'Valor' },
];

export type EixoId =
  | 'tudo'
  | 'classificacao'
  | 'tipoPedido'
  | 'classifEntrada'
  | 'contraparte'
  | 'uf'
  | 'vendedor'
  | 'terceiro'
  | 'situacao'
  | 'marca'
  | 'tipo'
  | 'subtipo'
  | 'grupo';

/**
 * Rótulo de quem não tem classificação.
 *
 * Separado do `SEM_CATEGORIA` de propósito: "sem categoria" fala de um produto sem
 * cadastro, "sem classificação" fala de uma nota sem CFOP reconhecido. São falhas
 * diferentes, em cadastros diferentes, e juntá-las num rótulo só esconderia qual
 * dos dois precisa de conserto.
 */
export const SEM_CLASSIFICACAO = 'Sem classificação';

/**
 * De que lado do fluxo a linha está.
 *
 * Existe por causa de UM eixo: a contraparte é o mesmo campo nas duas lentes, mas
 * chamá-la de "Origem" numa saída seria mentira. O sentido é o mínimo necessário
 * para o rótulo acertar sem partir o eixo em dois.
 */
export type Sentido = 'entrada' | 'saida';

interface Eixo {
  id: EixoId;
  /** Nome do eixo quando o sentido não vem ao caso. */
  rotulo: string;
  /** Nome por sentido, para o eixo cujo significado depende do lado do fluxo. */
  rotuloPorSentido?: Record<Sentido, string>;
  /**
   * Exemplos do que o eixo contém, para o `title` do botão.
   *
   * "Subtipo" e "Grupo" são os nomes dos NÍVEIS no Ciclone, não do que eles guardam —
   * quem não conhece o cadastro não tem como saber que um é público e o outro é
   * material. Renomear seria pior: o gestor confere esta tela contra os relatórios do
   * ERP, e dois vocabulários para a mesma coisa quebrariam essa conferência. Então o
   * nome fica e o exemplo explica.
   */
  exemplos?: string;
  /** Chave estável do grupo — é ela que entra no caminho do drill-down. */
  chaveDe: (l: LinhaPanorama) => string;
  /** Como o grupo aparece na tela. Pode ser mais rico que a chave. */
  rotuloDe: (l: LinhaPanorama) => string;
}

const codigo = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.trunc(n)) : String(v);
};

/** `2 - PEDIDO DE VENDA - MALA`, do jeito que o ERP identifica o código. */
const comDescricao = (valor: string, descricao: string | null | undefined) =>
  descricao ? `${valor} - ${descricao}` : valor;

/**
 * Rótulo de PESSOA (cliente, fornecedor, representante, terceiro): código na frente.
 *
 * O código já era a chave de agrupamento dos três eixos, mas ficava invisível — e é
 * ele que o gestor usa para achar o cadastro no Ciclone e para desempatar nome
 * repetido, que é justamente o motivo de a chave não ser o nome. Mesma forma do
 * `comDescricao` do tipo de pedido: **código primeiro**, porque o rótulo é truncado
 * na árvore e o que sobra na tela precisa ser a parte que identifica sem ambiguidade.
 *
 * Sem nome, mostra só o código; sem os dois, o texto de ausência — que é diferente
 * por eixo, então vem de fora.
 */
const comCodigo = (cod: string, nome: string | null | undefined, ausente: string) => {
  if (!cod) return nome || ausente;
  return nome ? `${cod} - ${nome}` : cod;
};

const eixoDeCategoria = (
  id: 'marca' | 'tipo' | 'subtipo' | 'grupo',
  rotulo: string,
  exemplos?: string
): Eixo => ({
  id,
  rotulo,
  exemplos,
  chaveDe: (l) => categoriaDa(l, id),
  rotuloDe: (l) => categoriaDa(l, id),
});

export const EIXOS: Eixo[] = [
  {
    // A RAIZ da árvore: um nó só, que abre em tudo o mais.
    //
    // Existe porque a árvore não tinha topo — ela começava em Marca, e não havia
    // nenhuma linha representando "a empresa inteira" para expandir. Não é caso
    // especial na máquina: é um eixo cuja chave é constante, então `agrupar` devolve
    // exatamente um grupo e o drill-down segue igual.
    //
    // NÃO é o padrão: abrir numa linha só obrigaria um clique antes de ver qualquer
    // número, e o padrão de um painel é mostrar, não pedir.
    id: 'tudo',
    rotulo: 'Tudo',
    exemplos: 'Uma linha só, com a empresa inteira',
    chaveDe: () => 'tudo',
    rotuloDe: () => 'Tudo',
  },
  {
    id: 'classificacao',
    rotulo: 'Tipo de saída',
    chaveDe: (l) => l.classif_operacao || SEM_CLASSIFICACAO,
    rotuloDe: (l) => l.classif_operacao || SEM_CLASSIFICACAO,
  },
  {
    id: 'tipoPedido',
    rotulo: 'Tipo de pedido',
    // A chave é só o CÓDIGO porque é ele que o Ciclone tem como identidade — o
    // mesmo código chega com descrições diferentes (o 13 é "MALA RN" e "MALA
    // RODRIGO"), e agrupar pelo texto partiria o tipo em dois grupos.
    chaveDe: (l) => codigo(l.tipo_pedido_cod),
    rotuloDe: (l) => comDescricao(codigo(l.tipo_pedido_cod), l.tipo_pedido_desc) || 'Sem pedido',
  },
  {
    id: 'classifEntrada',
    rotulo: 'Tipo de entrada',
    chaveDe: (l) => l.classif_entrada || SEM_CLASSIFICACAO,
    rotuloDe: (l) => l.classif_entrada || SEM_CLASSIFICACAO,
  },
  {
    // UM eixo para os dois lados do fluxo. O campo é o mesmo (`contraparte`), o que
    // muda é como se chama quem está do outro lado — ver `DimensoesContraparte`.
    id: 'contraparte',
    rotulo: 'Contraparte',
    rotuloPorSentido: { entrada: 'Origem', saida: 'Destino' },
    // Chave pelo CÓDIGO, rótulo pelo nome: dois cadastros podem repetir o nome, e o
    // código é o que o Ciclone garante único. Os rótulos nunca são "Fornecedor" nem
    // "Cliente" porque na remessa (dos dois lados) quem está ali é o representante.
    chaveDe: (l) => codigo(l.contraparte_cod),
    rotuloDe: (l) => comCodigo(codigo(l.contraparte_cod), l.contraparte, 'Sem contraparte'),
  },
  {
    id: 'uf',
    // Serve às duas lentes e ao estoque externo, então o rótulo não pode dizer
    // "de origem": na saída é a UF do destinatário.
    rotulo: 'UF',
    chaveDe: (l) => l.uf || '',
    rotuloDe: (l) => l.uf || 'Sem UF',
  },
  {
    id: 'terceiro',
    rotulo: 'Quem está com',
    // Chave pelo código: dois cadastros repetem nome, e o código é o que o Ciclone
    // garante único. O rótulo não é "Vendedor" porque nem todo terceiro é um: há
    // óticas e a própria matriz na lista.
    chaveDe: (l) => codigo(l.terceiro_cod),
    rotuloDe: (l) => comCodigo(codigo(l.terceiro_cod), l.terceiro, 'Sem terceiro'),
  },
  {
    id: 'vendedor',
    rotulo: 'Vendedor',
    chaveDe: (l) => l.codigo_vendedor ?? '',
    rotuloDe: (l) => comCodigo(l.codigo_vendedor ?? '', l.nome_vendedor, 'Sem vendedor'),
  },
  {
    id: 'situacao',
    rotulo: 'Situação do cadastro',
    // Produto INATIVO com saldo é achado gerencial, não erro de leitura: é estoque
    // parado de algo que a empresa decidiu não vender mais.
    chaveDe: (l) => l.situacao ?? '',
    rotuloDe: (l) =>
      l.situacao === 'A' ? 'Ativo' : l.situacao === 'I' ? 'Inativo' : 'Sem cadastro',
  },
  eixoDeCategoria('marca', 'Marca', 'Oben, Power, Core Eyes'),
  eixoDeCategoria('tipo', 'Tipo', 'Receituário, Solar, Estojo'),
  eixoDeCategoria('subtipo', 'Subtipo', 'Público: masculino, feminino'),
  eixoDeCategoria('grupo', 'Grupo', 'Material: acetato, metal'),
];

const EIXO_POR_ID = new Map(EIXOS.map((e) => [e.id, e]));

export const eixoDe = (id: EixoId): Eixo => {
  const e = EIXO_POR_ID.get(id);
  if (!e) throw new Error(`Eixo desconhecido: ${id}`);
  return e;
};

/** Como o eixo se chama neste lado do fluxo. Sem sentido, cai no nome neutro. */
export const rotuloEixo = (id: EixoId, sentido?: Sentido): string => {
  const e = eixoDe(id);
  return (sentido && e.rotuloPorSentido?.[sentido]) || e.rotulo;
};

/**
 * Ordem de leitura padrão de cada lente — e também quais eixos ela oferece.
 *
 * A saída começa pelo que o gestor pediu: "Saídas → Tipo de saída → Marca → Tipo →
 * Produto". A entrada começa pela classificação e não pela contraparte porque a
 * contraparte sozinha mistura fornecedor com representante devolvendo mala; a
 * classificação é o que separa os dois, então ela vem antes. Vale igual do lado da
 * saída, onde a mesma contraparte pode ser cliente (venda) ou representante
 * (remessa) — por isso ela também entra DEPOIS do tipo de saída.
 *
 * `subtipo` e `grupo` ficam no fim nas duas: respondem uma pergunta mais fina
 * (público e material) que só interessa depois de escolher marca e tipo.
 */
export const ORDEM_PADRAO: Record<Visao, EixoId[]> = {
  saidas: ['classificacao', 'marca', 'tipo', 'subtipo', 'grupo'],
  entradas: ['classifEntrada', 'contraparte', 'marca', 'tipo', 'subtipo', 'grupo'],
  // O estoque começa pela composição, que é a pergunta dele: "como está distribuído
  // entre as marcas e tipos". Não há eixo de documento para vir antes.
  'estoque-interno': ['marca', 'tipo', 'subtipo', 'grupo'],
  // O externo começa por VENDEDOR porque cada um tem uma data de contagem diferente:
  // olhar o total sem ver de quem ele é esconde justamente o que o torna frágil.
  // Os dois lados da mala abrem por QUEM ESTÁ COM ELA, e não por categoria: o total
  // sozinho esconde que ele é a soma de dezenas de posições independentes.
  'estoque-externo': ['terceiro', 'marca', 'tipo', 'subtipo', 'grupo'],
  'estoque-inventario': ['vendedor', 'marca', 'tipo', 'subtipo', 'grupo'],
  // O comparativo só tem categoria: é o único vocabulário em que as quatro fontes
  // concordam. Ver `panoramaComparativo.ts`.
  comparativo: ['marca', 'tipo', 'subtipo', 'grupo'],
};

/** Eixos que a visão aceita — o que a barra "Abrir por" oferece. */
export const EIXOS_DA_VISAO: Record<Visao, EixoId[]> = {
  saidas: ['classificacao', 'tipoPedido', 'contraparte', 'uf', 'marca', 'tipo', 'subtipo', 'grupo'],
  entradas: ['classifEntrada', 'contraparte', 'uf', 'marca', 'tipo', 'subtipo', 'grupo'],
  'estoque-interno': ['marca', 'tipo', 'subtipo', 'grupo', 'situacao'],
  'estoque-externo': ['terceiro', 'uf', 'marca', 'tipo', 'subtipo', 'grupo'],
  'estoque-inventario': ['vendedor', 'marca', 'tipo', 'subtipo', 'grupo'],
  comparativo: ['marca', 'tipo', 'subtipo', 'grupo'],
};

export interface Totais {
  quantidade: number;
  valor: number;
  /** Linhas de nota somadas. Não é medida de negócio — é o contador de origem. */
  linhas: number;
}

const ZERO: Totais = { quantidade: 0, valor: 0, linhas: 0 };

export function somar(linhas: readonly LinhaPanorama[]): Totais {
  return linhas.reduce<Totais>(
    (acc, l) => ({
      quantidade: acc.quantidade + (Number(l.quantidade) || 0),
      valor: acc.valor + (Number(l.valor) || 0),
      linhas: acc.linhas + (Number(l.linhas) || 0),
    }),
    ZERO
  );
}

export interface NoAgregado extends Totais {
  chave: string;
  rotulo: string;
  /** Fração do total do recorte, na medida escolhida. `0` quando o total é zero. */
  participacao: number;
}

/** Ordena pela medida ativa; desempata pelo rótulo. Compartilhado pelos dois níveis. */
function ordenarEParticipar(
  bruto: { chave: string; rotulo: string; totais: Totais }[],
  medida: Medida
): NoAgregado[] {
  const total = bruto.reduce((s, g) => s + g.totais[medida], 0);
  return bruto
    .map((g) => ({
      chave: g.chave,
      rotulo: g.rotulo,
      ...g.totais,
      participacao: total === 0 ? 0 : g.totais[medida] / total,
    }))
    .sort((a, b) => {
      const diferenca = b[medida] - a[medida];
      // Desempate pelo rótulo, e não pela outra medida, para a lista não reordenar
      // sozinha quando dois grupos empatam — reordenação sem causa visível faz o
      // usuário perder o item que estava lendo.
      return diferenca !== 0 ? diferenca : a.rotulo.localeCompare(b.rotulo, 'pt-BR');
    });
}

/**
 * Agrupa por um eixo e ordena pela medida escolhida, maior primeiro.
 *
 * A ordenação é pela medida ATIVA, não por uma fixa: em unidades a bonificação pode
 * liderar e em valor sumir, e é exatamente essa troca de posição que responde
 * "onde está o dinheiro" contra "onde está o volume".
 */
export function agrupar(
  linhas: readonly LinhaPanorama[],
  eixo: EixoId,
  medida: Medida
): NoAgregado[] {
  const e = eixoDe(eixo);
  const grupos = new Map<string, { chave: string; rotulo: string; totais: Totais }>();

  for (const l of linhas) {
    const chave = e.chaveDe(l);
    const atual = grupos.get(chave) ?? { chave, rotulo: e.rotuloDe(l), totais: { ...ZERO } };
    atual.totais.quantidade += Number(l.quantidade) || 0;
    atual.totais.valor += Number(l.valor) || 0;
    atual.totais.linhas += Number(l.linhas) || 0;
    grupos.set(chave, atual);
  }

  return ordenarEParticipar([...grupos.values()], medida);
}

/** A folha: agrupa por produto, que não é um eixo (só existe no nível de produto). */
export function agruparPorProduto(
  linhas: readonly LinhaPanorama[],
  medida: Medida
): NoAgregado[] {
  const grupos = new Map<string, { chave: string; rotulo: string; totais: Totais }>();

  for (const l of linhas) {
    // O estoque INTERNO não tem código auxiliar — o grão dele é o modelo. A queda
    // para `codigo_produto` é o que faz a folha funcionar nas duas medidas de
    // produto sem a máquina precisar saber qual lente está aberta.
    const chave = l.codigo_auxiliar ?? l.codigo_produto?.toString() ?? '';
    const atual = grupos.get(chave) ?? {
      chave,
      rotulo: l.nome_produto ? `${chave} · ${l.nome_produto}` : chave,
      totais: { ...ZERO },
    };
    atual.totais.quantidade += Number(l.quantidade) || 0;
    atual.totais.valor += Number(l.valor) || 0;
    atual.totais.linhas += Number(l.linhas) || 0;
    grupos.set(chave, atual);
  }

  return ordenarEParticipar([...grupos.values()], medida);
}

/**
 * As linhas que sobram depois de percorrer o caminho.
 *
 * Cada passo do caminho é a chave escolhida no eixo daquela posição. Percorrer é
 * um AND: `['VENDA', 'OBEN']` com a ordem padrão significa classificação VENDA E
 * marca OBEN.
 */
export function filtrarPeloCaminho<T extends LinhaPanorama>(
  linhas: readonly T[],
  ordem: readonly EixoId[],
  caminho: readonly string[]
): T[] {
  if (caminho.length === 0) return [...linhas];
  return linhas.filter((l) =>
    caminho.every((chave, i) => {
      const eixo = ordem[i];
      return eixo !== undefined && eixoDe(eixo).chaveDe(l) === chave;
    })
  );
}

export interface PontoMensal extends Totais {
  /** ISO-8601 do 1º dia do mês, como o gateway devolve. */
  mes: string;
}

/** Série temporal do recorte, um ponto por mês, em ordem cronológica. */
export function serieMensal(linhas: readonly LinhaPanorama[]): PontoMensal[] {
  const meses = new Map<string, Totais>();
  for (const l of linhas) {
    if (!l.mes) continue;
    const atual = meses.get(l.mes) ?? { ...ZERO };
    atual.quantidade += Number(l.quantidade) || 0;
    atual.valor += Number(l.valor) || 0;
    atual.linhas += Number(l.linhas) || 0;
    meses.set(l.mes, atual);
  }
  return [...meses.entries()]
    .map(([mes, totais]) => ({ mes, ...totais }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * O recorte a enviar ao gateway para buscar a folha (os produtos).
 *
 * ⚠️ **É um SUPERCONJUNTO, de propósito, e quem consome precisa saber disso.** As
 * dimensões viajam como listas independentes, então o servidor devolve o produto
 * cartesiano delas — com marcas `[A, B]` e tipos `[X, Y]` voltam linhas de `A/Y`
 * mesmo que essa combinação não exista no recorte da tela.
 *
 * Não é bug e não vale consertar no servidor: filtrar por combinações exatas exigiria
 * mandar uma cláusula por linha do agregado, e a resposta seria a mesma. O conserto
 * é no cliente e é barato — as linhas de produto carregam TODAS as dimensões, então
 * aplicar `filtrarPeloCaminho` de novo sobre o que voltou recorta com exatidão. Fazer
 * isso é obrigatório; pular faz aparecer produto que não pertence ao recorte aberto.
 *
 * Na prática o excesso é pequeno: a folha só é pedida depois de alguns níveis de
 * drill-down, e aí cada lista tem um item só.
 */
export function recorteDoCaminho(
  linhas: readonly LinhaPanorama[],
  visao: Visao
): RecortePanorama {
  const distintos = <T>(valores: T[]): T[] => [...new Set(valores)];
  const inteiros = (valores: (number | null | undefined)[]) =>
    distintos(valores.map((v) => Number(v)).filter((n) => Number.isFinite(n)));

  const comum: RecortePanorama = {
    marcas: distintos(linhas.map((l) => l.marca ?? '')),
    tipos: distintos(linhas.map((l) => l.tipo ?? '')),
    subtipos: distintos(linhas.map((l) => l.subtipo ?? '')),
    grupos: distintos(linhas.map((l) => l.grupo ?? '')),
    cfops: distintos(linhas.map((l) => codigo(l.cfop)).filter((c) => c !== '')),
  };

  // A contraparte entra nas DUAS lentes — é o mesmo parâmetro do gateway dos dois
  // lados, e é o que faz a folha respeitar um drill-down aberto por ela.
  const contrapartes = inteiros(linhas.map((l) => l.contraparte_cod));

  return visao === 'entradas'
    ? { ...comum, contrapartes }
    : { ...comum, contrapartes, tipos_pedido: inteiros(linhas.map((l) => l.tipo_pedido_cod)) };
}

/**
 * Ordem de eixos válida a partir de uma escolha de topo.
 *
 * Trocar o primeiro eixo não pode simplesmente sobrescrever: o eixo escolhido
 * precisa SAIR da posição antiga, senão ele apareceria duas vezes na árvore e o
 * segundo nível não recortaria nada.
 */
export function comEixoNoTopo(ordem: readonly EixoId[], eixo: EixoId): EixoId[] {
  return [eixo, ...ordem.filter((e) => e !== eixo)];
}

/** Os baldes de "faltou cadastro" vão para o fim de qualquer lista ordenada por nome. */
export const compararRotulos = (a: string, b: string) => {
  const balde = (r: string) => (r === SEM_CATEGORIA || r === SEM_CLASSIFICACAO ? 1 : 0);
  const diferenca = balde(a) - balde(b);
  return diferenca !== 0 ? diferenca : a.localeCompare(b, 'pt-BR');
};
