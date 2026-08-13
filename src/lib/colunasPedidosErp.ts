import type { PedidoErp } from '@/hooks/useConsultaErpQuery';

/**
 * Registro de colunas da Consulta ao ERP — a fonte única de quais colunas existem, como se
 * chamam, como se ordenam, o que fazem na linha de um pedido agrupado e em qual visão
 * aparecem.
 *
 * Existe porque três lugares precisavam da MESMA lista: a tabela, o Excel e o agrupamento.
 * Com as colunas escritas no JSX, acrescentar uma exigia editar os três — e o Excel já
 * carregava uma segunda cópia dos 32 títulos.
 *
 * ── As duas visões ────────────────────────────────────────────────────────────
 * ANALÍTICA: as 32 colunas, com rolagem horizontal. É a visão de investigação.
 * SINTÉTICA: 14 colunas que cabem na tela. O corte NÃO é "esconder o que é largo": cada
 * coluna de fora tem motivo medido na ferramenta local (amostra de 29.304 linhas), e o
 * comentário grande está lá, em `app.py`. Em resumo:
 *
 *   Dependência funcional perfeita — o valor já está em outra coluna:
 *     Tipo Pedido determina Tipo (nº) · CFOP determina CFOP Descrição e Classif. (CFOP)
 *     Operação e Oper. são bijetivos · Cód. Auxiliar determina Produto e Cor
 *     Nota determina Série
 *   Segunda leitura do mesmo eixo:
 *     Classif. (Pedido) é o par de Classif. (CFOP) — quando divergem, "A conferir" já avisa
 *     Descrição tem 722 valores distintos para 721 produtos (≈1:1 com o código)
 *   Quase constante no uso normal:
 *     Sit. Produto 99,3% "Ativo" · Sit. Nota 100% "Autorizada" com canceladas ocultas
 *     Vínculo Vendedor vazio enquanto não se filtra por vendedor
 *
 * Mantidas de propósito, apesar de parecerem redundantes: Marca (o prefixo "ES" gera OBEN
 * e POWER — ninguém lê a marca a partir do código), Tam (não está no código auxiliar, que é
 * produto + cor) e Emp (é metade da chave do pedido).
 */

export type Visao = 'sintetica' | 'analitica';

export const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: 'sintetica', rotulo: 'Sintética' },
  { valor: 'analitica', rotulo: 'Analítica' },
];

/** Governa formatação, alinhamento e direção do primeiro clique de ordenação. */
export type TipoColuna = 'texto' | 'numero' | 'moeda' | 'data';

/**
 * O que a coluna mostra na linha do PEDIDO, no modo agrupado.
 *
 * - `pedido`: é constante dentro do pedido — mostra o valor.
 * - `soma`: agrega (quantidade, valor).
 * - `unico`: é de item/nota — mostra o valor se for o mesmo em todos, senão "(vários)".
 * - `divergencia`: o primeiro sinal de auditoria do pedido.
 */
export type NoGrupo = 'pedido' | 'soma' | 'unico' | 'divergencia';

export interface ColunaPedido {
  campo: keyof PedidoErp;
  titulo: string;
  tipo: TipoColuna;
  noGrupo: NoGrupo;
  /**
   * `true` = está na Sintética. `'movimento'`/`'emissao'` = está na Sintética **apenas**
   * quando a consulta usou aquela base de data: uma coluna de data só, a que foi usada
   * para delimitar o período. Duas datas na visão enxuta gastariam 190px para mostrar a
   * mesma informação duas vezes.
   */
  sintetica?: boolean | 'movimento' | 'emissao';
  /** Largura mínima na Analítica, onde a tabela rola em vez de comprimir. */
  largura?: string;
}

/**
 * Ordem = a da visão analítica da ferramenta local. Filtrar esta lista por `sintetica`
 * devolve exatamente a ordem da sintética de lá, então uma lista só serve às duas.
 */
export const COLUNAS_PEDIDO: ColunaPedido[] = [
  { campo: 'divergencia', titulo: 'A conferir', tipo: 'texto', noGrupo: 'divergencia', sintetica: true, largura: 'min-w-[9rem]' },
  { campo: 'classif_operacao', titulo: 'Classif. (CFOP)', tipo: 'texto', noGrupo: 'unico', sintetica: true, largura: 'min-w-[8rem]' },
  { campo: 'classif_pedido', titulo: 'Classif. (Pedido)', tipo: 'texto', noGrupo: 'pedido', largura: 'min-w-[8rem]' },
  { campo: 'empresa', titulo: 'Emp', tipo: 'numero', noGrupo: 'pedido', sintetica: true },
  { campo: 'numero_pedido', titulo: 'Pedido', tipo: 'numero', noGrupo: 'pedido', sintetica: true },
  { campo: 'criou_pedido', titulo: 'Criou Pedido', tipo: 'texto', noGrupo: 'pedido', largura: 'min-w-[10rem]' },
  { campo: 'tipo_pedido_cod', titulo: 'Tipo (nº)', tipo: 'numero', noGrupo: 'pedido' },
  { campo: 'tipo_pedido_desc', titulo: 'Tipo Pedido', tipo: 'texto', noGrupo: 'pedido', sintetica: true, largura: 'min-w-[11rem]' },
  { campo: 'numero_nota', titulo: 'Nota', tipo: 'numero', noGrupo: 'unico', sintetica: true },
  { campo: 'serie_nota', titulo: 'Série', tipo: 'texto', noGrupo: 'unico' },
  { campo: 'nota_movimento', titulo: 'Dt. Movimento', tipo: 'data', noGrupo: 'unico', sintetica: 'movimento' },
  { campo: 'pedido_emissao', titulo: 'Dt. Emissão Ped.', tipo: 'data', noGrupo: 'pedido', sintetica: 'emissao' },
  { campo: 'operacao_cod', titulo: 'Oper.', tipo: 'numero', noGrupo: 'unico' },
  { campo: 'operacao_desc', titulo: 'Operação', tipo: 'texto', noGrupo: 'unico', largura: 'min-w-[14rem]' },
  { campo: 'cfop', titulo: 'CFOP', tipo: 'numero', noGrupo: 'unico' },
  { campo: 'cfop_desc', titulo: 'CFOP Descrição', tipo: 'texto', noGrupo: 'unico', largura: 'min-w-[14rem]' },
  { campo: 'produto_cod', titulo: 'Produto', tipo: 'numero', noGrupo: 'unico' },
  { campo: 'codigo_auxiliar', titulo: 'Cód. Auxiliar', tipo: 'texto', noGrupo: 'unico', sintetica: true, largura: 'min-w-[9rem]' },
  { campo: 'produto_desc', titulo: 'Descrição', tipo: 'texto', noGrupo: 'unico', largura: 'min-w-[12rem]' },
  { campo: 'situacao_produto', titulo: 'Sit. Produto', tipo: 'texto', noGrupo: 'unico' },
  { campo: 'marca', titulo: 'Marca', tipo: 'texto', noGrupo: 'unico', sintetica: true },
  { campo: 'cor_cod', titulo: 'Cor', tipo: 'texto', noGrupo: 'unico' },
  { campo: 'tamanho_cod', titulo: 'Tam', tipo: 'texto', noGrupo: 'unico', sintetica: true },
  { campo: 'quantidade', titulo: 'Qtd', tipo: 'numero', noGrupo: 'soma', sintetica: true },
  { campo: 'preco_atacado', titulo: 'Preço Atacado', tipo: 'moeda', noGrupo: 'unico' },
  { campo: 'valor_liquido', titulo: 'Valor Líq.', tipo: 'moeda', noGrupo: 'soma', sintetica: true },
  { campo: 'cliente_nome', titulo: 'Cliente/Destinatário', tipo: 'texto', noGrupo: 'pedido', sintetica: true, largura: 'min-w-[13rem]' },
  { campo: 'vendedor_nome', titulo: 'Vendedor', tipo: 'texto', noGrupo: 'pedido', sintetica: true, largura: 'min-w-[10rem]' },
  { campo: 'resp_cliente_nome', titulo: 'Resp. Cliente', tipo: 'texto', noGrupo: 'pedido', largura: 'min-w-[10rem]' },
  { campo: 'papel_vendedor', titulo: 'Vínculo Vendedor', tipo: 'texto', noGrupo: 'pedido', largura: 'min-w-[10rem]' },
  // `situacao_nota` é de NOTA, não de pedido — a ferramenta local a trata como constante do
  // pedido e mostra a da primeira nota. Aqui é `unico`: um pedido com uma nota autorizada e
  // outra cancelada mostra "(vários)", que é o que de fato aconteceu.
  { campo: 'situacao_nota', titulo: 'Sit. Nota', tipo: 'texto', noGrupo: 'unico' },
  { campo: 'obs_pedido', titulo: 'Obs. Pedido', tipo: 'texto', noGrupo: 'pedido', largura: 'min-w-[14rem]' },
];

export type BaseData = 'movimento' | 'emissao';

/** Colunas da visão, na ordem. Ver `sintetica` para o caso das duas datas. */
export function colunasDaVisao(visao: Visao, baseData: BaseData): ColunaPedido[] {
  if (visao === 'analitica') return COLUNAS_PEDIDO;
  return COLUNAS_PEDIDO.filter((c) => c.sintetica === true || c.sintetica === baseData);
}

/** Índice por campo — a tabela precisa do tipo da coluna para ordenar e formatar. */
export const COLUNA_POR_CAMPO = new Map<string, ColunaPedido>(
  COLUNAS_PEDIDO.map((c) => [c.campo, c])
);

/** Número e dinheiro à direita; o resto à esquerda. */
export const alinhamentoDaColuna = (c: ColunaPedido): 'left' | 'right' =>
  c.tipo === 'numero' || c.tipo === 'moeda' ? 'right' : 'left';

/**
 * Direção do PRIMEIRO clique: texto abre em A→Z, número e data abrem no maior.
 *
 * Quem clica em "Valor" numa auditoria está atrás da linha fora da curva, e abrir nos zeros
 * gasta um clique toda vez.
 */
export const direcaoInicialDaColuna = (c: ColunaPedido): 'asc' | 'desc' =>
  c.tipo === 'texto' ? 'asc' : 'desc';
