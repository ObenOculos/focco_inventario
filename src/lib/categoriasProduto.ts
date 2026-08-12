/**
 * Categorias de produto — a hierarquia do Ciclone (Marca → Tipo → Subtipo → Grupo) e
 * as operações que as telas fazem sobre ela.
 *
 * POR QUE FORA DOS COMPONENTES: o Comparativo recorta por categoria em três lugares
 * (barra de filtros, `PainelGestor`, subtítulo da linha) e a Conferência recorta a
 * revisão de itens pelos mesmos campos. Todos precisam concordar sobre o que É uma
 * categoria — com a definição duplicada, um "Sem categoria" escrito diferente de um
 * lado produziria um filtro que esvazia a lista sem erro nenhum, e o número errado não
 * teria como ser notado.
 *
 * As opções saem sempre DAS LINHAS QUE ESTÃO NA TELA, nunca do catálogo inteiro
 * (`categorias_produtos()`). Oferecer uma marca que este inventário não tem é oferecer
 * um filtro que devolve zero — e o usuário só descobre depois de aplicar. De quebra,
 * não custa request nenhum: as linhas já estão no cliente.
 */

/**
 * O mínimo que uma linha precisa ter para ser filtrada por categoria.
 *
 * Estrutural em vez de genérico porque estas funções só LEEM: `LinhaExibida` do
 * comparativo e `ItemRevisao` da conferência satisfazem isto sem se conhecerem, e o
 * módulo não passa a depender de nenhuma das duas telas.
 */
export interface ComCategorias {
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
}

/** Categoria ausente. Produto contado sem cadastro em `produtos`, ou anterior à sincronização. */
export const SEM_CATEGORIA = 'Sem categoria';

export const NIVEIS = [
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'tipo', rotulo: 'Tipo' },
  { chave: 'subtipo', rotulo: 'Subtipo' },
  { chave: 'grupo', rotulo: 'Grupo' },
] as const;

export type NivelCategoria = (typeof NIVEIS)[number]['chave'];

/**
 * O valor NULO vira o rótulo "Sem categoria" em vez de sumir.
 *
 * Produto contado que não está em `produtos` é informação, não falha — e costuma ser
 * exatamente o que o gerente precisa ver. Descartá-lo do agrupamento faria os totais
 * por categoria não fecharem com o total da tela.
 */
export const categoriaDa = (l: ComCategorias, nivel: NivelCategoria) =>
  l[nivel] || SEM_CATEGORIA;

/** Escolha por nível; `null` é "todos" — o nível não restringe nada. */
export type SelecaoCategorias = Record<NivelCategoria, string | null>;

export const SELECAO_VAZIA: SelecaoCategorias = {
  marca: null,
  tipo: null,
  subtipo: null,
  grupo: null,
};

export const temSelecao = (s: SelecaoCategorias) =>
  NIVEIS.some(({ chave }) => s[chave] !== null);

export const contarSelecao = (s: SelecaoCategorias) =>
  NIVEIS.filter(({ chave }) => s[chave] !== null).length;

/** AND entre os níveis escolhidos. */
export function casaComSelecao(l: ComCategorias, s: SelecaoCategorias): boolean {
  return NIVEIS.every(({ chave }) => s[chave] === null || categoriaDa(l, chave) === s[chave]);
}

export interface OpcaoCategoria {
  valor: string;
  /** Quantas LINHAS (produtos distintos) caem nesta categoria. */
  total: number;
  /**
   * Soma das quantidades das linhas — as unidades contadas de verdade.
   *
   * `undefined` onde a tela não tem uma quantidade por linha para somar: o comparativo
   * e a conferência recortam divergência, não contagem, e ali um segundo número no
   * seletor seria inventado.
   */
  unidades?: number;
}

/**
 * As opções de um nível, contadas sobre as linhas que passam por TODOS OS OUTROS
 * níveis — mas não pelo próprio.
 *
 * Ignorar a própria escolha é o que permite trocá-la: contando com ela, o seletor de
 * Marca ficaria com uma opção só depois da primeira escolha, e sair de OBEN exigiria
 * limpar o filtro antes. Honrar os outros é o que impede oferecer um recorte vazio —
 * com Marca OBEN, o seletor de Tipo só mostra os tipos que existem DENTRO de OBEN.
 *
 * `quantidadeDa` é opcional porque as três telas que usam isto não concordam sobre o
 * que é "quantidade": na contagem é o que foi bipado, no comparativo não existe uma só.
 * Quem sabe responder passa a função; quem não sabe fica só com o número de produtos.
 */
export function opcoesDoNivel<T extends ComCategorias>(
  linhas: readonly T[],
  selecao: SelecaoCategorias,
  nivel: NivelCategoria,
  quantidadeDa?: (linha: T) => number
): OpcaoCategoria[] {
  const semOProprio: SelecaoCategorias = { ...selecao, [nivel]: null };
  const contagem = new Map<string, { total: number; unidades: number }>();

  for (const l of linhas) {
    if (!casaComSelecao(l, semOProprio)) continue;
    const valor = categoriaDa(l, nivel);
    const acumulado = contagem.get(valor) ?? { total: 0, unidades: 0 };
    acumulado.total += 1;
    acumulado.unidades += quantidadeDa ? quantidadeDa(l) : 0;
    contagem.set(valor, acumulado);
  }

  return [...contagem.entries()]
    .map(([valor, { total, unidades }]) =>
      quantidadeDa ? { valor, total, unidades } : { valor, total }
    )
    // "Sem categoria" por último: é o balde do que falta cadastrar, não uma categoria
    // do negócio, e no meio da lista alfabética compete com as reais.
    .sort((a, b) => {
      if (a.valor === SEM_CATEGORIA) return 1;
      if (b.valor === SEM_CATEGORIA) return -1;
      return a.valor.localeCompare(b.valor, 'pt-BR');
    });
}

/**
 * Descarta as escolhas que deixaram de existir depois de uma troca em outro nível.
 *
 * Trocar Marca de OBEN para POWER com Subtipo FEMININO preso deixaria a tela vazia se
 * POWER não tiver FEMININO — e sem nada na tela indicando qual dos quatro seletores é
 * o culpado. Limpar o nível impossível é a única saída que não mente.
 *
 * Uma passada na ordem da hierarquia basta: cada nível é saneado já vendo os de cima
 * corrigidos, e um nível limpo só AUMENTA as opções dos de baixo.
 */
export function sanearSelecao(
  linhas: readonly ComCategorias[],
  selecao: SelecaoCategorias
): SelecaoCategorias {
  let resultado = selecao;
  for (const { chave } of NIVEIS) {
    const escolhido = resultado[chave];
    if (escolhido === null) continue;
    const existe = opcoesDoNivel(linhas, resultado, chave).some((o) => o.valor === escolhido);
    if (!existe) resultado = { ...resultado, [chave]: null };
  }
  return resultado;
}

/**
 * O maior prefixo da hierarquia coberto pela seleção, no formato do `caminho` do
 * `PainelGestor` — `['OBEN', 'OCULOS RECEITUARIO']` para Marca+Tipo escolhidos.
 *
 * Serve para o modo Gestor abrir já dentro do recorte filtrado, em vez de mostrar uma
 * árvore com uma raiz só que o usuário precisa clicar para descer. Para em qualquer
 * buraco: com Marca vazia e Grupo escolhido não há prefixo, e o drill-down começa do
 * topo sobre as linhas já filtradas — que continua correto, só não adianta passos.
 */
export function caminhoDaSelecao(selecao: SelecaoCategorias): string[] {
  const caminho: string[] = [];
  for (const { chave } of NIVEIS) {
    const valor = selecao[chave];
    if (valor === null) break;
    caminho.push(valor);
  }
  return caminho;
}
