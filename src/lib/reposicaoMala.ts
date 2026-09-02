import { chaveCodigoAuxiliar, normalizarGrafia } from '@/lib/codigoAuxiliar';
import type { ComCategorias } from '@/lib/categoriasProduto';

/**
 * Reposição da mala — o estoque da loja e a contagem do representante, lado a lado.
 *
 * ## Uma lista só, e por que ela deixou de ser duas
 *
 * A primeira versão tinha duas populações: a listagem (estoque da loja) e um apêndice
 * "só na mala" (o que o representante tinha e a loja não). Elas existiam porque o laço
 * DESCARTAVA linhas — saldo zero, saldo negativo, cor inativa, item fora do catálogo — e
 * tudo que caía fora precisava de um segundo lugar para não sumir.
 *
 * Isso obrigava a planilha a ter duas abas e o usuário a comparar dois conjuntos que
 * respondem à mesma pergunta. **Parar de descartar resolve os dois de uma vez:** cada
 * SKU vira uma linha, com o saldo (mesmo negativo), a contagem, e um rótulo dizendo o
 * que fazer. Quem recorta é o usuário, por caixa de marcação, sobre uma lista completa.
 *
 * A união é: toda linha de saldo da loja **mais** todo item contado que não casou com
 * nenhuma delas — esses entram com saldo zero, que é o que a loja de fato tem deles.
 *
 * ## As duas perguntas que a linha responde, e por que são campos separados
 *
 * `situacao` responde **"o que fazer com este produto"** e `cadastroFurado` responde
 * **"dá para confiar neste saldo"**. Juntá-las num rótulo só perderia informação: um item
 * pode estar na mala do representante E com saldo negativo na loja — a primeira diz que
 * não precisa pedir, a segunda diz que o cadastro está errado. São achados diferentes,
 * para decisões diferentes, no mesmo dia.
 *
 * ## ⚠️ `C01` e `C1` podem ser grades DIFERENTES
 *
 * `chaveCodigoAuxiliar` apaga o zero à esquerda do sufixo de cor, porque o mesmo produto
 * entra com duas grafias no inventário. Mas no Ciclone há casos em que as duas grafias
 * são grades distintas: `OB1107 C01` tem saldo zero e `OB1107 C1` (cor 'PRETO V') tem
 * 214. Medido em 2026-09-02: de 5.070 chaves, 40 colidem.
 *
 * A regra: **o colapso vale enquanto for reversível.** Chave alcançada por uma grafia só
 * casa pela chave e segue absorvendo variação de digitação; chave alcançada por duas
 * exige grafia exata. E o código exibido é sempre o do ERP, nunca o do catálogo — era o
 * catálogo renomeando a linha que punha 214 unidades sob um código zerado.
 */

/** Uma linha do `/estoque?nivel=produto`. */
export interface SaldoDeGrade {
  /** Ausente só em cadastro sem referência de grade — medido: zero linhas hoje. */
  codigo_auxiliar?: string;
  codigo_produto: string | number | null;
  cor?: string | number | null;
  nome_produto: string | null;
  /** `'A'` / `'I'`, da GRADE quando ela tem situação própria. */
  situacao: string | null;
  quantidade: number;
  disponivel: number;
  /** Mercadoria nossa em poder de terceiros — o contexto que o saldo interno esconde. */
  em_terceiro?: number;
  marca: string;
  tipo: string;
  subtipo: string;
  grupo: string;
}

/** Uma grade do catálogo do app — é dela que sai o preço do item de pedido. */
export interface ProdutoDoCatalogo {
  codigo_auxiliar: string;
  modelo: string;
  cor: string;
  cor_nome: string | null;
  nome_produto: string;
  valor_produto: number | null;
  valor_remessa: number | null;
  /** Situação da GRADE no Ciclone. Inativa continua sendo óculos — só não se pede. */
  ativo: boolean;
}

/** O que o inventário escolhido contou. */
export interface ItemContado {
  codigo_auxiliar: string;
  quantidade_fisica: number;
}

/**
 * O que fazer com este produto. **Uma linha, um rótulo** — e a ordem abaixo é a de
 * precedência, deliberada: o que IMPEDE o pedido vem antes do que o motiva.
 */
export type SituacaoLinha =
  /** Não tem cadastro de óculos: estojo, flanela, expositor. Não vira item de pedido. */
  | 'nao-oculos'
  /** Cor inativada no Ciclone. Não se pede uma grade morta. */
  | 'inativa'
  /** O representante já tem. */
  | 'na-mala'
  /** Falta na mala e a loja tem saldo. **É a ação da tela.** */
  | 'repor'
  /** Falta na mala e a loja está zerada ou negativa. */
  | 'sem-saldo';

export const ROTULO_SITUACAO: Record<SituacaoLinha, string> = {
  repor: 'Repor',
  'na-mala': 'Já na mala',
  'sem-saldo': 'Sem saldo na loja',
  inativa: 'Cor inativa',
  'nao-oculos': 'Não é óculos',
};

/** Ordem de leitura: o que exige decisão primeiro, o que é referência depois. */
const PESO_SITUACAO: Record<SituacaoLinha, number> = {
  repor: 0,
  'sem-saldo': 1,
  'na-mala': 2,
  inativa: 3,
  'nao-oculos': 4,
};

export interface LinhaReposicao extends ComCategorias {
  /** Na grafia do **ERP**, não a do catálogo. Ver o aviso sobre `C01`/`C1` no topo. */
  codigo_auxiliar: string;
  modelo: string;
  nome_produto: string;
  cor: string;
  cor_nome: string | null;
  /** Saldo interno da loja. **Pode ser negativo** — e é informação, não erro. */
  saldoLoja: number;
  /** Saldo menos saída pendente. É o teto honesto de um pedido. */
  disponivel: number;
  /** Unidades desta grade em poder de terceiros — o que desmente "a empresa não tem". */
  emTerceiro: number;
  /** Unidades no inventário escolhido. */
  naMala: number;
  ativa: boolean;
  eOculos: boolean;
  valor_produto: number;
  valor_remessa: number;
  situacao: SituacaoLinha;
  /**
   * Saldo negativo: saiu mais do que o cadastro registrou.
   *
   * Campo próprio, e não um valor de `situacao`, porque convive com qualquer uma delas.
   * É o achado que o gestor leva para consertar no ERP, não um impedimento de pedido.
   */
  cadastroFurado: boolean;
}

/**
 * O total do inventário escolhido — o denominador da tela.
 *
 * Só dois números, e isso é deliberado: os recortes (quantos têm saldo, quantos estão
 * negativos, quanto há em terceiros) são contados na TELA sobre as linhas visíveis, e
 * precisam acompanhar as caixas de marcação. Guardá-los aqui produziria contadores
 * absolutos ao lado de indicadores filtrados — que é exatamente a confusão que fez o
 * usuário achar que a tela estava perdendo item contado.
 */
export interface ResumoContagem {
  /** SKUs distintos com quantidade no inventário escolhido. */
  produtos: number;
  unidades: number;
}

export interface Reposicao {
  /** TODOS os SKUs — da loja e da mala. Quem recorta é `filtrarReposicao`. */
  linhas: LinhaReposicao[];
  contagem: ResumoContagem;
  /**
   * O saldo chegou no grão de MODELO — nenhuma linha trouxe código auxiliar.
   *
   * Significa que o `/estoque` respondeu sem `nivel=produto`: gateway não reiniciado
   * depois de uma alteração, Edge Function desatualizada, ou rollback de um dos dois.
   * **A tela não tem como responder a pergunta dela nesse estado**, e a degradação era
   * silenciosa: sem código auxiliar toda linha é procurada no catálogo pelo código do
   * modelo, não encontra, e 661 modelos de óculos viram "não é óculos".
   */
  graoDeModelo: boolean;
}

/**
 * Chave do modelo, tolerante ao tipo que o pandas devolve.
 *
 * `eqpdg_codigo` é texto no Ciclone ('OB1190', 'ESTOJO PW'), mas o pandas promove a
 * coluna a número quando todos os valores do recorte são numéricos. Sem o `trunc`, um
 * modelo promovido chegaria como `1190.0` e não casaria com o `'1190'` do catálogo.
 */
export function chaveModelo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(Math.trunc(valor)) : '';
  }
  return String(valor).trim().toUpperCase();
}

/** Categoria vazia vira ausência: `''` e `null` são o mesmo grupo para `categoriasProduto`. */
const categoria = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

function classificar(
  eOculos: boolean,
  ativa: boolean,
  naMala: number,
  saldoLoja: number
): SituacaoLinha {
  if (!eOculos) return 'nao-oculos';
  if (!ativa) return 'inativa';
  if (naMala > 0) return 'na-mala';
  return saldoLoja > 0 ? 'repor' : 'sem-saldo';
}

/** Cruza saldo por SKU × catálogo × contagem numa lista só. */
export function montarReposicao(
  saldos: readonly SaldoDeGrade[],
  catalogo: readonly ProdutoDoCatalogo[],
  contagem: readonly ItemContado[]
): Reposicao {
  // ── Quando o colapso de zero é seguro ────────────────────────────────────────
  //
  // A ambiguidade é apurada sobre o CATÁLOGO INTEIRO somado ao saldo. O catálogo é o
  // registro completo de grades — traz a cor mesmo com estoque zero —, enquanto o
  // `/estoque` já vem sem os zerados. Apurar só pelo saldo faria a colisão aparecer e
  // sumir conforme o estoque do dia, e o `OB1107 C01` está justamente zerado.
  const grafiasPorChave = new Map<string, Set<string>>();
  const registrar = (codigo: string) => {
    if (!codigo) return;
    const k = chaveCodigoAuxiliar(codigo);
    const grafias = grafiasPorChave.get(k);
    if (grafias) grafias.add(normalizarGrafia(codigo));
    else grafiasPorChave.set(k, new Set([normalizarGrafia(codigo)]));
  };
  for (const p of catalogo) registrar(p.codigo_auxiliar);
  for (const s of saldos) {
    registrar((s.codigo_auxiliar ?? '').trim() || chaveModelo(s.codigo_produto));
  }
  const ambiguas = new Set<string>();
  for (const [k, grafias] of grafiasPorChave) if (grafias.size > 1) ambiguas.add(k);

  const catalogoPorGrafia = new Map<string, ProdutoDoCatalogo>();
  const catalogoPorChave = new Map<string, ProdutoDoCatalogo>();
  for (const p of catalogo) {
    catalogoPorGrafia.set(normalizarGrafia(p.codigo_auxiliar), p);
    const k = chaveCodigoAuxiliar(p.codigo_auxiliar);
    if (!catalogoPorChave.has(k)) catalogoPorChave.set(k, p);
  }

  const malaPorGrafia = new Map<string, number>();
  const malaPorChave = new Map<string, number>();
  for (const it of contagem) {
    const q = Number(it.quantidade_fisica) || 0;
    if (q <= 0) continue;
    const g = normalizarGrafia(it.codigo_auxiliar);
    const k = chaveCodigoAuxiliar(it.codigo_auxiliar);
    malaPorGrafia.set(g, (malaPorGrafia.get(g) ?? 0) + q);
    malaPorChave.set(k, (malaPorChave.get(k) ?? 0) + q);
  }

  /** Exato quando a chave é ambígua; pela chave quando não é. */
  const acharNoCatalogo = (grafia: string, k: string) =>
    catalogoPorGrafia.get(grafia) ?? (ambiguas.has(k) ? undefined : catalogoPorChave.get(k));

  const contadoNaMala = (grafia: string, k: string) =>
    ambiguas.has(k)
      ? (malaPorGrafia.get(grafia) ?? 0)
      : (malaPorChave.get(k) ?? malaPorGrafia.get(grafia) ?? 0);

  // ── As linhas do estoque ─────────────────────────────────────────────────────
  //
  // NADA é descartado aqui. Saldo negativo, cor inativa e item que não é óculos entram
  // como linha e recebem rótulo; quem some é decisão do usuário, na caixa de marcação.
  // Descartar no meio da conta foi o que criou a segunda aba da planilha.
  const porGrafia = new Map<string, LinhaReposicao>();
  /** Chaves já cobertas por alguma linha de saldo — evita duplicar o contado. */
  const chavesComLinha = new Set<string>();

  for (const s of saldos) {
    const bruto = (s.codigo_auxiliar ?? '').trim() || chaveModelo(s.codigo_produto);
    if (!bruto) continue;

    const grafia = normalizarGrafia(bruto);
    const k = chaveCodigoAuxiliar(bruto);
    const quantidade = Number(s.quantidade) || 0;

    // O saldo vem por empresa × filial: a mesma grade aparece em várias linhas. Somar é
    // por GRAFIA, nunca por chave — `C01` e `C1` são grades diferentes.
    const existente = porGrafia.get(grafia);
    if (existente) {
      existente.saldoLoja += quantidade;
      existente.disponivel += Number(s.disponivel) || 0;
      existente.emTerceiro += Number(s.em_terceiro) || 0;
      continue;
    }

    const produto = acharNoCatalogo(grafia, k);
    const naMala = contadoNaMala(grafia, k);
    if (naMala > 0) chavesComLinha.add(k);

    porGrafia.set(grafia, {
      codigo_auxiliar: bruto.trim(),
      modelo: chaveModelo(produto?.modelo || s.codigo_produto),
      nome_produto: produto?.nome_produto || s.nome_produto || bruto.trim(),
      cor: produto?.cor ?? String(s.cor ?? ''),
      cor_nome: produto?.cor_nome ?? null,
      saldoLoja: quantidade,
      disponivel: Number(s.disponivel) || 0,
      emTerceiro: Number(s.em_terceiro) || 0,
      naMala,
      // Duas fontes para a mesma pergunta, e as duas contam: o ERP marca a grade como
      // 'I' e o catálogo do app guarda o `ativo` da última sincronização. Se qualquer
      // uma disser que está morta, está morta.
      ativa: (s.situacao ?? '').trim().toUpperCase() !== 'I' && (produto?.ativo ?? true),
      eOculos: produto !== undefined,
      valor_produto: Number(produto?.valor_produto) || 0,
      valor_remessa: Number(produto?.valor_remessa) || 0,
      situacao: 'sem-saldo', // recalculado abaixo, depois de somar as filiais
      cadastroFurado: false,
      marca: categoria(s.marca),
      tipo: categoria(s.tipo),
      subtipo: categoria(s.subtipo),
      grupo: categoria(s.grupo),
    });
  }

  // ── Os contados de que a loja não tem linha nenhuma ──────────────────────────
  //
  // O `/estoque` só devolve saldo diferente de zero, então a grade zerada não vem. Ela
  // entra aqui com saldo zero — que é exatamente o que a loja tem dela. Antes esta era
  // a segunda aba da planilha.
  for (const [grafia, quantidade] of malaPorGrafia) {
    if (porGrafia.has(grafia)) continue;
    const k = chaveCodigoAuxiliar(grafia);
    // Sem isto, o contado que já foi absorvido por uma linha de saldo (via colapso de
    // grafia) apareceria DE NOVO como linha própria, e o total do inventário na tela
    // passaria a somar mais que o inventário.
    //
    // ⚠️ O `!ambiguas` é obrigatório: em chave ambígua a linha de saldo casou por grafia
    // EXATA, então ela não absorveu esta contagem — pular aqui perderia as unidades. É o
    // caso do `OB1107 C01` contado enquanto a loja só tem linha de `OB1107 C1`.
    if (!ambiguas.has(k) && chavesComLinha.has(k)) continue;

    const produto = acharNoCatalogo(grafia, k);
    porGrafia.set(grafia, {
      codigo_auxiliar: produto?.codigo_auxiliar ?? grafia,
      modelo: chaveModelo(produto?.modelo ?? grafia.split(' ')[0]),
      nome_produto: produto?.nome_produto ?? '',
      cor: produto?.cor ?? '',
      cor_nome: produto?.cor_nome ?? null,
      saldoLoja: 0,
      disponivel: 0,
      emTerceiro: 0,
      naMala: quantidade,
      ativa: true,
      eOculos: produto !== undefined,
      valor_produto: Number(produto?.valor_produto) || 0,
      valor_remessa: Number(produto?.valor_remessa) || 0,
      situacao: 'sem-saldo',
      cadastroFurado: false,
      marca: null,
      tipo: null,
      subtipo: null,
      grupo: null,
    });
  }

  const linhas = [...porGrafia.values()];
  for (const l of linhas) {
    l.situacao = classificar(l.eOculos, l.ativa, l.naMala, l.saldoLoja);
    l.cadastroFurado = l.saldoLoja < 0;
  }

  // O que exige decisão primeiro; dentro de cada bloco, as cores do mesmo modelo juntas,
  // que é como uma grade se decide.
  linhas.sort(
    (a, b) =>
      PESO_SITUACAO[a.situacao] - PESO_SITUACAO[b.situacao] ||
      a.modelo.localeCompare(b.modelo, 'pt-BR') ||
      a.codigo_auxiliar.localeCompare(b.codigo_auxiliar, 'pt-BR')
  );

  // ── A contagem confrontada ───────────────────────────────────────────────────
  const contados = linhas.filter((l) => l.naMala > 0);
  const resumo: ResumoContagem = {
    produtos: contados.length,
    unidades: contados.reduce((t, l) => t + l.naMala, 0),
  };

  // `every` sobre a resposta crua: a pergunta é sobre o FORMATO do que o ERP mandou.
  const graoDeModelo =
    saldos.length > 0 && saldos.every((s) => !(s.codigo_auxiliar ?? '').trim());

  return { linhas, contagem: resumo, graoDeModelo };
}

/**
 * O recorte por INTERESSE — o que o usuário quer olhar agora.
 *
 * Os três primeiros são valores de `situacao`; `cadastro` é o outro eixo (saldo
 * negativo), que atravessa todos eles. `null` é a lista inteira.
 *
 * Existe como um foco só, e não como uma caixa de marcação por situação, porque estas
 * opções são MUTUAMENTE EXCLUDENTES na prática: ninguém pergunta "o que repor e o que
 * já está na mala" ao mesmo tempo — pergunta uma, resolve, pergunta a outra.
 *
 * `pedido` é o de fora da série: não descreve o produto, descreve o que o usuário JÁ
 * DECIDIU sobre ele. Existe para tornar a seleção inspecionável na própria tabela — sem
 * isso, "o que exatamente vai no arquivo" só se responderia gerando o arquivo.
 */
export type FocoReposicao = 'repor' | 'na-mala' | 'sem-saldo' | 'cadastro' | 'pedido';

export interface RecorteReposicao {
  /** Fora os que não têm cadastro de óculos: estojo, flanela, expositor, sandália… */
  soOculos: boolean;
  /** Fora as cores inativadas no Ciclone. */
  ocultarInativas: boolean;
  /**
   * Piso de saldo na loja. `0` desliga o filtro.
   *
   * Serve à pergunta "só quero mexer com produto que a loja tem em quantidade" — abaixo
   * de um punhado de peças o pedido não vale a viagem. Entra no RUÍDO e não no `foco`
   * porque muda a base de contagem: sem isso, pôr o piso em 5 deixaria o indicador
   * "A repor" anunciando 863 enquanto a lista mostra 300.
   *
   * É um piso INCLUSIVO: `5` mantém quem tem exatamente 5.
   */
  estoqueMinimo: number;
  /** O interesse do momento. `null` = a lista inteira. */
  foco: FocoReposicao | null;
}

/**
 * Os padrões da tela: tira o ruído, não escolhe o assunto.
 *
 * Acessório e cor morta são ruído em qualquer leitura, então saem por padrão. O FOCO
 * nasce nulo de propósito: escolher um assunto por conta própria esconderia justamente a
 * comparação que dá sentido ao resto da tela.
 */
export const RECORTE_PADRAO: RecorteReposicao = {
  soOculos: true,
  ocultarInativas: true,
  estoqueMinimo: 0,
  foco: null,
};

/**
 * O recorte que o usuário controla por caixa de marcação.
 *
 * Separado de `montarReposicao` porque é releitura do que já está no cliente: desmarcar
 * uma caixa não pode custar uma ida ao ERP. Mesmo princípio do "Ocultar Diversos" do
 * Panorama.
 */
export function filtrarReposicao(
  linhas: readonly LinhaReposicao[],
  { soOculos, ocultarInativas, estoqueMinimo, foco }: RecorteReposicao,
  /** Só necessária para `foco: 'pedido'`. */
  selecao?: ReadonlyMap<string, number>
): LinhaReposicao[] {
  return linhas.filter((l) => {
    if (soOculos && !l.eOculos) return false;
    if (ocultarInativas && !l.ativa) return false;
    if (estoqueMinimo > 0 && l.saldoLoja < estoqueMinimo) return false;
    if (foco === 'pedido') return selecao?.has(l.codigo_auxiliar) ?? false;
    if (foco === 'cadastro') return l.cadastroFurado;
    if (foco !== null && l.situacao !== foco) return false;
    return true;
  });
}

/** O recorte de RUÍDO sozinho — a base sobre a qual os indicadores são contados. */
export function semRuido(
  linhas: readonly LinhaReposicao[],
  recorte: RecorteReposicao
): LinhaReposicao[] {
  return filtrarReposicao(linhas, { ...recorte, foco: null });
}

/** Dá para transformar esta linha em item de pedido? */
export const podePedir = (l: LinhaReposicao) => l.eOculos && l.ativa && l.saldoLoja > 0;

/** As sugeridas de saída: tudo que falta na mala e a loja pode mandar, uma unidade cada. */
export function selecaoInicial(linhas: readonly LinhaReposicao[]): Map<string, number> {
  const selecao = new Map<string, number>();
  for (const l of linhas) {
    if (l.situacao === 'repor') selecao.set(l.codigo_auxiliar, 1);
  }
  return selecao;
}

/**
 * Pedir mais do que a loja tem disponível.
 *
 * Não bloqueia — o gestor pode saber de uma entrada a caminho que o ERP ainda não
 * registrou. Mas precisa aparecer: antes do saldo por cor existir, esse erro era
 * invisível por construção.
 */
export const excedeDisponivel = (l: LinhaReposicao, quantidade: number) =>
  quantidade > l.disponivel;
