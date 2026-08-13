import type { PedidoErp } from '@/hooks/useConsultaErpQuery';

/**
 * Refino LOCAL da Consulta ao ERP — os filtros que trabalham sobre o resultado já
 * carregado, sem voltar ao Ciclone.
 *
 * É a mesma divisão da ferramenta de auditoria local (`app.py`): um cartão de
 * parâmetros que vai ao banco e um cartão de refino que é instantâneo. A consulta
 * atravessa VPN e leva segundos; o refino não pode custar nada, senão a conferência
 * de um período grande vira uma sequência de esperas.
 *
 * Tudo aqui é função pura de propósito: é o que permite rodar o filtro sete vezes por
 * interação (uma por dimensão da cascata, mais a máscara final) sem envolver React.
 */

/**
 * Sentinela de "sem recorte neste filtro".
 *
 * String vazia não serve: o Select do Radix trata `''` como "sem valor" e volta a
 * mostrar o placeholder — o item ficaria inselecionável. Mesma decisão do
 * `FiltroCategorias`.
 */
export const TODOS = 'todos';

/**
 * Onde a busca textual procura.
 *
 * Duas camadas, e a separação é de NATUREZA do dado: as colunas de cadastro dizem o
 * que a linha É; `obs_pedido` é texto livre digitado por gente — o que ESCREVERAM
 * sobre ela — e vive citando o código de outro produto ("mandar BR1320 C1 no lugar").
 * Num alvo só, buscar por código devolvia a linha errada: o produto era BR1320 C2 e
 * quem casava era a observação de outra linha.
 */
export type EscopoBusca = 'cadastro' | 'cadastro_obs' | 'obs';

export const ESCOPOS_BUSCA: { valor: EscopoBusca; rotulo: string }[] = [
  { valor: 'cadastro', rotulo: 'Cadastro' },
  { valor: 'cadastro_obs', rotulo: 'Cadastro + Obs.' },
  { valor: 'obs', rotulo: 'Só Obs.' },
];

export interface FiltrosPedidos {
  busca: string;
  escopo: EscopoBusca;
  /** Um número ou vários ("123,456"); casa por pedaço, como no ERP. */
  pedido: string;
  nf: string;
  classificacao: string;
  /** Código da operação fiscal, como texto (é valor de `Select`). */
  operacao: string;
  tipo: string;
  cfop: string;
  criou: string;
  /** `'A'` | `'I'` — situação do cadastro do produto. */
  situacaoProduto: string;
  /** Vazio = todas as marcas. */
  marcas: string[];
  soDivergencias: boolean;
  ocultarCanceladas: boolean;
}

/**
 * `ocultarCanceladas` nasce LIGADO, como na ferramenta local.
 *
 * Nota cancelada não é divergência acionável — já foi anulada — e some do universo de
 * quem está auditando operação. Deixá-la visível por padrão infla a contagem de linhas
 * e o valor total com documentos que não existem mais, que é justamente o número que a
 * conferência usa para bater com o ERP.
 */
export const FILTROS_PEDIDOS_INICIAIS: FiltrosPedidos = {
  busca: '',
  escopo: 'cadastro',
  pedido: '',
  nf: '',
  classificacao: TODOS,
  operacao: TODOS,
  tipo: TODOS,
  cfop: TODOS,
  criou: TODOS,
  situacaoProduto: TODOS,
  marcas: [],
  soDivergencias: false,
  ocultarCanceladas: true,
};

/** Nome de um filtro, para omiti-lo ao montar as opções em cascata. */
export type NomeFiltro = keyof FiltrosPedidos;

/**
 * Separador entre as colunas do alvo de busca.
 *
 * Precisa ser um caractere que não dê para digitar: com espaço, um termo com espaço
 * casava atravessando a fronteira entre dois campos — "silva joão" achava a linha cujo
 * CLIENTE terminava em "SILVA" e cujo VENDEDOR começava com "JOÃO", sem que nenhum dos
 * dois contivesse o termo. O US (unit separator) não existe nos dados nem no teclado.
 */
const SEPARADOR = '\x1f';

const COLUNAS_CADASTRO = [
  'produto_cod',
  'codigo_auxiliar',
  'produto_desc',
  'marca',
  'cliente_nome',
  'vendedor_nome',
  'resp_cliente_nome',
  'criou_pedido',
] as const satisfies readonly (keyof PedidoErp)[];

const minusculo = (v: unknown) => (v === null || v === undefined ? '' : String(v).toLowerCase());

/**
 * Código numérico como o ERP o mostra: inteiro, sem casa decimal.
 *
 * O gateway devolve alguns códigos como float (o pandas promove a coluna quando há
 * nulo), e sem isto o pedido 1234 viraria "1234.0" — o filtro por "1234" ainda casaria,
 * mas a comparação exata da operação/tipo/CFOP com o valor do `Select` não.
 */
const codigo = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.trunc(n)) : String(v);
};

/**
 * Linha com os alvos de busca já prontos.
 *
 * A cascata roda o filtro sete vezes por interação. Refazer a concatenação de oito
 * colunas em cada passada é o que travava a ferramenta local por segundos em resultados
 * grandes (274 mil formatações por tecla digitada, medido lá). Aqui isso é calculado uma
 * vez por consulta, em `indexarPedidos`.
 */
export interface PedidoIndexado extends PedidoErp {
  _cadastro: string;
  _obs: string;
  _pedido: string;
  _nota: string;
}

export function indexarPedidos(linhas: PedidoErp[]): PedidoIndexado[] {
  return linhas.map((l) => ({
    ...l,
    _cadastro: COLUNAS_CADASTRO.map((c) => minusculo(l[c])).join(SEPARADOR),
    _obs: minusculo(l.obs_pedido),
    _pedido: codigo(l.numero_pedido),
    _nota: codigo(l.numero_nota),
  }));
}

/**
 * Quebra o que o usuário digitou em Pedido/NF numa lista de termos.
 *
 * `"123"` → `["123"]` e `"123,456, 789"` → `["123","456","789"]`. Com vários, os termos
 * SOMAM (OR): é a união, como a busca no banco faria.
 */
export function termosNumero(texto: string): string[] {
  const vistos = new Set<string>();
  for (const termo of texto.trim().split(/[,;\s]+/)) {
    if (termo) vistos.add(termo);
  }
  return [...vistos];
}

const casaNumero = (alvo: string, texto: string): boolean => {
  const termos = termosNumero(texto);
  if (termos.length === 0) return true;
  // Correspondência PARCIAL, como na ferramenta local: digitar "123" acha 123, 1234 e
  // 5123. Quem sabe o número inteiro digita o número inteiro.
  return termos.some((t) => alvo.includes(t));
};

function passa(l: PedidoIndexado, f: FiltrosPedidos, excluir?: NomeFiltro): boolean {
  if (excluir !== 'ocultarCanceladas' && f.ocultarCanceladas && l.nota_situacao_cod === 'C') {
    return false;
  }
  if (excluir !== 'soDivergencias' && f.soDivergencias && !l.divergencia) return false;

  if (excluir !== 'classificacao' && f.classificacao !== TODOS) {
    if ((l.classif_operacao ?? '') !== f.classificacao) return false;
  }
  if (excluir !== 'operacao' && f.operacao !== TODOS) {
    if (codigo(l.operacao_cod) !== f.operacao) return false;
  }
  if (excluir !== 'tipo' && f.tipo !== TODOS) {
    if (codigo(l.tipo_pedido_cod) !== f.tipo) return false;
  }
  if (excluir !== 'cfop' && f.cfop !== TODOS) {
    if (codigo(l.cfop) !== f.cfop) return false;
  }
  if (excluir !== 'criou' && f.criou !== TODOS) {
    if ((l.criou_pedido ?? '') !== f.criou) return false;
  }
  if (excluir !== 'situacaoProduto' && f.situacaoProduto !== TODOS) {
    if ((l.produto_situacao_cod ?? '') !== f.situacaoProduto) return false;
  }
  if (excluir !== 'marcas' && f.marcas.length > 0) {
    if (!f.marcas.includes(l.marca ?? '')) return false;
  }

  if (excluir !== 'pedido' && !casaNumero(l._pedido, f.pedido)) return false;
  if (excluir !== 'nf' && !casaNumero(l._nota, f.nf)) return false;

  if (excluir !== 'busca') {
    const termo = f.busca.trim().toLowerCase();
    if (termo) {
      const alvo =
        f.escopo === 'cadastro'
          ? l._cadastro
          : f.escopo === 'obs'
            ? l._obs
            : `${l._cadastro}${SEPARADOR}${l._obs}`;
      if (!alvo.includes(termo)) return false;
    }
  }

  return true;
}

/**
 * Aplica o refino. `excluir` omite UM filtro — é assim que se monta a cascata: as
 * opções de "Operação" saem do recorte feito por todos os outros filtros, menos o
 * próprio, senão escolher uma operação apagaria as demais da lista e travaria a troca.
 */
export function filtrarPedidos(
  linhas: PedidoIndexado[],
  f: FiltrosPedidos,
  excluir?: NomeFiltro
): PedidoIndexado[] {
  return linhas.filter((l) => passa(l, f, excluir));
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  /** Linhas que sobram ao escolher esta opção, dado o resto do refino. */
  total: number;
}

type Ordem = 'numero' | 'texto';

function opcoesDe(
  linhas: PedidoIndexado[],
  f: FiltrosPedidos,
  nome: NomeFiltro,
  valorDe: (l: PedidoIndexado) => string,
  rotuloDe: (l: PedidoIndexado, valor: string) => string,
  ordem: Ordem,
  selecionado?: string
): OpcaoFiltro[] {
  const contagem = new Map<string, OpcaoFiltro>();
  for (const l of filtrarPedidos(linhas, f, nome)) {
    const valor = valorDe(l);
    if (!valor) continue;
    const atual = contagem.get(valor);
    if (atual) atual.total += 1;
    else contagem.set(valor, { valor, rotulo: rotuloDe(l, valor), total: 1 });
  }

  // A opção ESCOLHIDA permanece na lista mesmo quando zera.
  //
  // A ferramenta local reverte para "(Todos)" quando o valor sai da cascata; aqui isso
  // apagaria o filtro do usuário sem aviso, e o Radix mostraria o seletor em branco.
  // Mantê-la com "(0)" diz exatamente o que aconteceu — a combinação escolhida não tem
  // linha nenhuma — e deixa desfazer.
  if (selecionado && selecionado !== TODOS && !contagem.has(selecionado)) {
    contagem.set(selecionado, { valor: selecionado, rotulo: selecionado, total: 0 });
  }

  const lista = [...contagem.values()];
  lista.sort((a, b) =>
    ordem === 'numero'
      ? Number(a.valor) - Number(b.valor)
      : a.rotulo.localeCompare(b.rotulo, 'pt-BR')
  );
  return lista;
}

export interface OpcoesPedidos {
  classificacao: OpcaoFiltro[];
  operacao: OpcaoFiltro[];
  tipo: OpcaoFiltro[];
  cfop: OpcaoFiltro[];
  criou: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
}

/** Rótulo `5403 - VENDA DE MERCADORIA…`, do jeito que o ERP identifica o código. */
const comDescricao = (valor: string, descricao: string | null) =>
  descricao ? `${valor} - ${descricao}` : valor;

/**
 * Opções de cada dimensão, em cascata sobre o resultado.
 *
 * As listas saem dos DADOS, nunca de constante no código. A classificação é o caso que
 * mais importa: a ferramenta local oferece sete rótulos fixos e joga o resto em
 * "OUTRAS", porque um combo não enumera. Aqui, enumerar do resultado mostra
 * "VENDA (ENTREGA FUTURA)" e "OUTRO (5949)" com nome e contagem próprios — e nenhuma
 * lista para desatualizar quando `regras.py` classificar algo novo.
 */
export function opcoesDosFiltros(linhas: PedidoIndexado[], f: FiltrosPedidos): OpcoesPedidos {
  return {
    classificacao: opcoesDe(
      linhas,
      f,
      'classificacao',
      (l) => l.classif_operacao ?? '',
      (_l, v) => v,
      'texto',
      f.classificacao
    ),
    operacao: opcoesDe(
      linhas,
      f,
      'operacao',
      (l) => codigo(l.operacao_cod),
      (l, v) => comDescricao(v, l.operacao_desc),
      'numero',
      f.operacao
    ),
    tipo: opcoesDe(
      linhas,
      f,
      'tipo',
      (l) => codigo(l.tipo_pedido_cod),
      (l, v) => comDescricao(v, l.tipo_pedido_desc),
      'numero',
      f.tipo
    ),
    cfop: opcoesDe(
      linhas,
      f,
      'cfop',
      (l) => codigo(l.cfop),
      (l, v) => comDescricao(v, l.cfop_desc),
      'numero',
      f.cfop
    ),
    criou: opcoesDe(
      linhas,
      f,
      'criou',
      (l) => l.criou_pedido ?? '',
      (_l, v) => v,
      'texto',
      f.criou
    ),
    marcas: opcoesDe(linhas, f, 'marcas', (l) => l.marca ?? '', (_l, v) => v, 'texto'),
  };
}

/** Situação do cadastro do produto — lista fixa, são os dois códigos de `regras.py`. */
export const SITUACOES_PRODUTO: { valor: string; rotulo: string }[] = [
  { valor: 'A', rotulo: 'Ativos' },
  { valor: 'I', rotulo: 'Inativos' },
];

/** Se algo no refino difere do padrão — é o que acende o "Limpar refino". */
export function temRefino(f: FiltrosPedidos): boolean {
  const p = FILTROS_PEDIDOS_INICIAIS;
  return (
    f.busca.trim() !== '' ||
    f.escopo !== p.escopo ||
    f.pedido.trim() !== '' ||
    f.nf.trim() !== '' ||
    f.classificacao !== p.classificacao ||
    f.operacao !== p.operacao ||
    f.tipo !== p.tipo ||
    f.cfop !== p.cfop ||
    f.criou !== p.criou ||
    f.situacaoProduto !== p.situacaoProduto ||
    f.marcas.length > 0 ||
    f.soDivergencias !== p.soDivergencias ||
    f.ocultarCanceladas !== p.ocultarCanceladas
  );
}

export interface ResumoPedidos {
  linhas: number;
  /** Pedidos DISTINTOS, contados por (empresa, número). */
  pedidos: number;
  quantidade: number;
  valor: number;
  comDivergencia: number;
  canceladas: number;
}

/**
 * Totais do recorte visível.
 *
 * Pedido é contado por `(empresa, número)`: o número se repete entre as duas empresas do
 * grupo, e contar só o número subestimava o total de pedidos.
 */
export function resumirPedidos(linhas: PedidoIndexado[]): ResumoPedidos {
  const pedidos = new Set<string>();
  let quantidade = 0;
  let valor = 0;
  let comDivergencia = 0;
  let canceladas = 0;

  for (const l of linhas) {
    if (l.numero_pedido !== null) pedidos.add(`${l.empresa}-${l.numero_pedido}`);
    quantidade += Number(l.quantidade) || 0;
    valor += Number(l.valor_liquido) || 0;
    if (l.divergencia) comDivergencia += 1;
    if (l.nota_situacao_cod === 'C') canceladas += 1;
  }

  return { linhas: linhas.length, pedidos: pedidos.size, quantidade, valor, comDivergencia, canceladas };
}
