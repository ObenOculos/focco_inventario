/**
 * Recontagem — recontar um recorte do inventário SUBSTITUINDO a contagem anterior.
 *
 * O PROBLEMA QUE ISTO RESOLVE: abrir um inventário já enviado carregava as contagens
 * antigas na tela, e todo bipe SOMAVA em cima delas. Um produto com 1 unidade, bipado
 * duas vezes na revisão, virava 3 em vez de 2 — e nada na tela dizia isso ao vendedor.
 *
 * A REGRA: recontar um recorte zera as quantidades daquele recorte e guarda o valor
 * antigo como referência. O que não entrou em nenhum recorte mantém a contagem original.
 *
 * POR QUE O RECORTE, E NÃO "O QUE FOI BIPADO": se só o produto bipado recebesse contagem
 * nova, a recontagem jamais corrigiria um produto contado A MAIS — ele não é encontrado,
 * ninguém o bipa, e o número errado sobrevive para sempre. Zerando o recorte inteiro, o
 * produto que não aparece cai para zero, que é a resposta certa.
 *
 * Sessão: uma passagem do vendedor pela tela. A referência é capturada UMA VEZ por sessão
 * (`baseline`), de modo que mandar "recontar" de novo no meio do trabalho recomeça o
 * recorte sem transformar a contagem parcial dele na "contagem anterior" — o vendedor
 * veria como referência um número que ele mesmo acabou de digitar.
 */

import { casaComSelecao, type ComCategorias, type SelecaoCategorias } from './categoriasProduto';

export interface ItemContagem extends ComCategorias {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
  /** Contagem gravada antes da recontagem deste item. `null` = nunca recontado. */
  quantidade_anterior: number | null;
}

/**
 * NÃO EXISTE "MODO CORRIGIR" SEPARADO DE "MODO RECONTAR".
 *
 * Chegou a existir, com dois botões no histórico, e era um erro: enquanto o vendedor não
 * aperta "Recontar este recorte", nada foi zerado — a lista está com os números originais
 * e ele pode ajustar qualquer um na mão. Corrigir é a recontagem sem usar a recontagem.
 * Dois botões obrigavam a classificar a própria intenção ANTES de saber o que ele ia
 * fazer, que é justamente a decisão que um usuário leigo erra.
 *
 * Sobra uma distinção só, e ela vem do endereço, não de escolha nenhuma: contagem nova
 * (nada gravado antes) ou inventário já gravado (tudo o que está na tela veio de antes,
 * e por isso um bipe precisa perguntar se soma ou reconta).
 */

/**
 * Estado da sessão de recontagem. Vive fora dos itens porque responde a perguntas sobre
 * a PASSAGEM do vendedor, não sobre o produto: quanto cada item valia quando ele chegou,
 * e o que ele já recontou desde então.
 */
export interface SessaoRecontagem {
  /** Quantidade de cada item no início da sessão, por código. */
  baseline: Record<string, number>;
  /** Códigos já zerados por algum recorte NESTA sessão. */
  recontados: string[];
}

export const SESSAO_VAZIA: SessaoRecontagem = { baseline: {}, recontados: [] };

/** Fotografa as quantidades atuais. Chamado ao abrir o inventário, uma vez só. */
export function iniciarSessao(items: readonly ItemContagem[]): SessaoRecontagem {
  const baseline: Record<string, number> = {};
  for (const i of items) baseline[i.codigo_auxiliar] = i.quantidade_fisica;
  return { baseline, recontados: [] };
}

export const jaRecontado = (sessao: SessaoRecontagem, codigo: string) =>
  sessao.recontados.includes(codigo);

/** Item que já existia quando a sessão começou (o oposto de "achado na recontagem"). */
export const existiaNaSessao = (sessao: SessaoRecontagem, codigo: string) =>
  codigo in sessao.baseline;

/** Os itens que um recorte alcança — os que serão zerados por "Recontar este recorte". */
export function itensDoRecorte(
  items: readonly ItemContagem[],
  escopo: SelecaoCategorias
): ItemContagem[] {
  return items.filter((i) => casaComSelecao(i, escopo));
}

/**
 * Zera o recorte e fixa a referência.
 *
 * A referência sai do `baseline` da sessão, e não do `quantidade_fisica` do momento:
 * repetir a ação depois de já ter bipado alguma coisa precisa recomeçar do valor com que
 * o vendedor chegou, não do parcial dele.
 */
export function recontarRecorte(
  items: readonly ItemContagem[],
  escopo: SelecaoCategorias,
  sessao: SessaoRecontagem
): { items: ItemContagem[]; sessao: SessaoRecontagem } {
  const alvo = new Set(itensDoRecorte(items, escopo).map((i) => i.codigo_auxiliar));
  if (alvo.size === 0) return { items: [...items], sessao };

  const novosItens = items.map((i) => {
    if (!alvo.has(i.codigo_auxiliar)) return i;
    return {
      ...i,
      quantidade_fisica: 0,
      quantidade_anterior: sessao.baseline[i.codigo_auxiliar] ?? i.quantidade_anterior ?? 0,
    };
  });

  const recontados = [...new Set([...sessao.recontados, ...alvo])];
  return { items: novosItens, sessao: { ...sessao, recontados } };
}

/** Desfaz a recontagem de um item: devolve a contagem que ele tinha e apaga a referência. */
export function desfazerRecontagemDoItem(
  items: readonly ItemContagem[],
  codigo: string,
  sessao: SessaoRecontagem
): { items: ItemContagem[]; sessao: SessaoRecontagem } {
  const anterior = sessao.baseline[codigo];
  if (anterior === undefined) return { items: [...items], sessao };

  return {
    items: items.map((i) =>
      i.codigo_auxiliar === codigo
        ? { ...i, quantidade_fisica: anterior, quantidade_anterior: null }
        : i
    ),
    sessao: { ...sessao, recontados: sessao.recontados.filter((c) => c !== codigo) },
  };
}

export interface Balanco {
  subiram: ItemContagem[];
  desceram: ItemContagem[];
  /** Recontados que terminaram em zero — o produto que não foi encontrado. */
  zerados: ItemContagem[];
  /** Não existiam no início da sessão: apareceram durante a recontagem. */
  novos: ItemContagem[];
  /** Recontados que bateram com a contagem anterior. */
  confirmados: number;
  /** Nunca recontados nesta sessão: mantêm a contagem original. */
  intocados: ItemContagem[];
  totalPecas: number;
}

/**
 * O que mudou, para a tela de confirmação antes do envio.
 *
 * Existe porque o momento de maior risco não é o bipe — é o envio: é ali que uma
 * contagem some sem ninguém ter percebido. Os `zerados` são a linha que mais importa,
 * e por isso são categoria própria em vez de ficarem escondidos dentro de "desceram".
 */
export function balancoDaRecontagem(
  items: readonly ItemContagem[],
  sessao: SessaoRecontagem
): Balanco {
  const b: Balanco = {
    subiram: [],
    desceram: [],
    zerados: [],
    novos: [],
    confirmados: 0,
    intocados: [],
    totalPecas: 0,
  };

  for (const i of items) {
    b.totalPecas += i.quantidade_fisica;

    if (!existiaNaSessao(sessao, i.codigo_auxiliar)) {
      b.novos.push(i);
      continue;
    }
    if (!jaRecontado(sessao, i.codigo_auxiliar)) {
      b.intocados.push(i);
      continue;
    }

    const antes = sessao.baseline[i.codigo_auxiliar];
    if (i.quantidade_fisica === 0 && antes > 0) b.zerados.push(i);
    else if (i.quantidade_fisica > antes) b.subiram.push(i);
    else if (i.quantidade_fisica < antes) b.desceram.push(i);
    else b.confirmados += 1;
  }

  return b;
}

/**
 * As duas listas representam a mesma contagem?
 *
 * Serve para saber se há trabalho não enviado — o que decide se vale avisar ao sair e se
 * o "Descartar alterações" tem o que descartar. A ordem não importa (o item bipado pula
 * para o topo o tempo todo); o conjunto de produtos e os números, sim.
 *
 * `quantidade_anterior` entra na comparação de propósito: um recorte recontado que bateu
 * exatamente com a contagem antiga tem os MESMOS números e ainda assim é trabalho de
 * verdade — é o vendedor dizendo ao gerente "eu recontei e confere". Ignorá-la trataria
 * essa confirmação como "nada mudou" e a descartaria sem avisar.
 */
export function mesmaContagem(a: readonly ItemContagem[], b: readonly ItemContagem[]): boolean {
  if (a.length !== b.length) return false;
  const mapa = new Map(a.map((i) => [i.codigo_auxiliar, i]));
  return b.every((i) => {
    const outro = mapa.get(i.codigo_auxiliar);
    return (
      outro !== undefined &&
      outro.quantidade_fisica === i.quantidade_fisica &&
      outro.quantidade_anterior === i.quantidade_anterior
    );
  });
}

export const balancoTemMudanca = (b: Balanco) =>
  b.subiram.length > 0 || b.desceram.length > 0 || b.zerados.length > 0 || b.novos.length > 0;
