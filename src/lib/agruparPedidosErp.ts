import type { PedidoIndexado } from './filtrosPedidosErp';
import { COLUNAS_PEDIDO } from './colunasPedidosErp';

/**
 * Agrupamento por pedido da Consulta ao ERP.
 *
 * Uma nota tem uma linha por produto, então um pedido de 30 peças ocupa 30 linhas da
 * tabela. Agrupado, cada pedido é uma linha só com os totais, e os itens abrem sob
 * demanda — é como se lê "quanto saiu no pedido 1234" sem somar de cabeça.
 *
 * A CHAVE é `(empresa, número)`, nunca o número sozinho: a empresa 2 reiniciou a
 * numeração em 1 (2025) e caminha por dentro da faixa que a empresa 1 já gastou, então
 * hoje 100% dos pedidos da empresa 2 têm homônimo na 1. Agrupar só pelo número fundia
 * dois pedidos distintos — de clientes e notas diferentes — num card só, com itens e
 * total somados. Foi um bug real na ferramenta local, e o comentário está lá.
 */

/**
 * `null` num campo do grupo significa **"(vários)"**: o pedido tem mais de um valor
 * naquela coluna. String vazia significa que nenhum item tem valor ali.
 *
 * A distinção importa na tela: "(vários)" é informação — o pedido gerou duas notas, ou
 * misturou marcas — e em branco é ausência. As duas coisas num só `''` esconderiam a
 * primeira.
 */
export type ValorDoGrupo = string | null;

export interface GrupoPedido {
  /** Identidade estável do grupo, para chave de render e estado de expansão. */
  chave: string;
  empresa: number;
  /** `null` = notas sem pedido, que caem todas num balde por empresa. */
  numeroPedido: number | null;
  /** Itens na ordem em que chegaram (já ordenada pela tabela). */
  itens: PedidoIndexado[];
  quantidade: number;
  valor: number;
  /** Primeiro sinal de auditoria do pedido; vazio quando nenhum item tem. */
  divergencia: string;
  canceladas: number;
  /**
   * Valor do pedido em CADA coluna do registro, conforme o `noGrupo` dela: o valor do
   * pedido quando é constante, o valor único dos itens, ou `null` para "(vários)".
   *
   * É um mapa, e não campos nomeados, porque as colunas visíveis mudam com a visão — a
   * Analítica mostra 32. Campo a campo, cada coluna nova exigiria mexer aqui também.
   */
  valores: Record<string, ValorDoGrupo>;
  /**
   * Menor data e menor nota do pedido — existem para ORDENAR.
   *
   * A ordenação não pode usar `data`/`nota` acima: quem tem mais de um valor vale `null`
   * ali, e todo pedido com duas notas iria junto para uma das pontas da tabela, como se
   * não tivesse data nenhuma.
   */
  dataMin: string;
  notaMin: number;
}

const comoTexto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Valor da coluna quando é o mesmo em todo o pedido; `null` quando há mais de um.
 *
 * Vazio/nulo não conta como valor — é o `dropna().unique()` da ferramenta local. Sem
 * isso, um pedido com uma linha sem marca cadastrada apareceria como "(vários)" só por
 * causa do buraco.
 */
function unicoDe(itens: PedidoIndexado[], campo: keyof PedidoIndexado): ValorDoGrupo {
  let achado = '';
  for (const item of itens) {
    const valor = comoTexto(item[campo]);
    if (!valor) continue;
    if (!achado) achado = valor;
    else if (achado !== valor) return null;
  }
  return achado;
}

export function agruparPedidos(linhas: PedidoIndexado[]): GrupoPedido[] {
  // `Map` preserva a ordem de inserção: os grupos saem na ordem em que o pedido apareceu
  // pela primeira vez na tabela já ordenada.
  const porChave = new Map<string, PedidoIndexado[]>();
  for (const l of linhas) {
    const chave = `${l.empresa}-${l.numero_pedido ?? 'sem'}`;
    const atual = porChave.get(chave);
    if (atual) atual.push(l);
    else porChave.set(chave, [l]);
  }

  return [...porChave.entries()].map(([chave, itens]) => {
    let quantidade = 0;
    let valor = 0;
    let canceladas = 0;
    let divergencia = '';
    let dataMin = '';
    let notaMin = Number.POSITIVE_INFINITY;

    for (const item of itens) {
      quantidade += Number(item.quantidade) || 0;
      valor += Number(item.valor_liquido) || 0;
      if (item.nota_situacao_cod === 'C') canceladas += 1;
      if (!divergencia && item.divergencia) divergencia = item.divergencia;
      // ISO-8601 compara como texto na ordem cronológica.
      const data = comoTexto(item.nota_movimento);
      if (data && (!dataMin || data < dataMin)) dataMin = data;
      if (item.numero_nota !== null && item.numero_nota < notaMin) notaMin = item.numero_nota;
    }

    const valores: Record<string, ValorDoGrupo> = {};
    for (const coluna of COLUNAS_PEDIDO) {
      if (coluna.noGrupo === 'pedido') {
        valores[coluna.campo] = comoTexto(itens[0][coluna.campo]);
      } else if (coluna.noGrupo === 'unico') {
        valores[coluna.campo] = unicoDe(itens, coluna.campo);
      }
      // `soma` e `divergencia` não entram: saem de `quantidade`, `valor` e `divergencia`.
    }

    return {
      chave,
      empresa: itens[0].empresa,
      numeroPedido: itens[0].numero_pedido,
      itens,
      quantidade,
      valor,
      divergencia,
      canceladas,
      valores,
      dataMin,
      notaMin: Number.isFinite(notaMin) ? notaMin : 0,
    };
  });
}

/** `Pedido 1234` · `Pedido 1234 · Emp 2` · `(sem pedido)`. */
export function rotuloDoGrupo(g: GrupoPedido, mostrarEmpresa: boolean): string {
  const base = g.numeroPedido === null ? '(sem pedido)' : `Pedido ${g.numeroPedido}`;
  return mostrarEmpresa ? `${base} · Emp ${g.empresa}` : base;
}
