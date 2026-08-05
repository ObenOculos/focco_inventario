import { supabase } from '@/integrations/supabase/client';

/**
 * Chave usada para reconhecer grafias diferentes do MESMO código auxiliar.
 *
 * Ela serve apenas para casar um código com o cadastro de produtos — **nunca é
 * gravada**. O valor persistido é sempre a grafia do próprio cadastro ou, quando
 * não há produto correspondente, o código original intacto. É essa separação que
 * torna a normalização segura: uma regra agressiva demais deixa de casar, mas não
 * tem como corromper um código.
 *
 * O código auxiliar tem a forma `MODELO COR` (ver `Produtos.tsx`, que separa os
 * dois pelo espaço). Só a COR perde zeros à esquerda, porque `OB1038 C02` e
 * `OB1038 C2` são o mesmo produto. Aplicar a regra à string inteira converteria o
 * modelo `PW0012` em `PW12`, que é outro produto — por isso o corte pelo espaço.
 */
export function chaveCodigoAuxiliar(codigo: string): string {
  const limpo = normalizarGrafia(codigo);
  const corte = limpo.lastIndexOf(' ');
  if (corte === -1) return limpo;

  const modelo = limpo.slice(0, corte);
  // 'C02' → 'C2'. 'C0' permanece 'C0': ali o zero é o próprio valor, não um
  // preenchimento, e o `(\d)` final é o que garante isso.
  const cor = limpo.slice(corte + 1).replace(/^([A-Z]*)0+(\d)/, '$1$2');
  return `${modelo} ${cor}`;
}

/**
 * Caixa alta, sem espaços nas pontas e sem espaço interno repetido. É o mínimo
 * aplicado a qualquer código, inclusive aos que não existem no cadastro — o
 * `trim().toUpperCase()` que já havia nos parsers não colapsava `OB1038  C2`.
 */
export function normalizarGrafia(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/\s+/g, ' ');
}

interface ProdutoCatalogo {
  codigo_auxiliar: string;
  nome_produto: string;
}

/** PostgREST limita a resposta a 1000 linhas; o catálogo vem em lotes desse tamanho. */
const TAMANHO_LOTE = 1000;

async function carregarCatalogo(): Promise<ProdutoCatalogo[]> {
  const todos: ProdutoCatalogo[] = [];
  let inicio = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('produtos')
      .select('codigo_auxiliar, nome_produto')
      .order('codigo_auxiliar', { ascending: true })
      .range(inicio, inicio + TAMANHO_LOTE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    todos.push(...data);
    if (data.length < TAMANHO_LOTE) break;
    inicio += TAMANHO_LOTE;
  }

  return todos;
}

export interface ItemResolvivel {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
}

export interface ResultadoResolucao<T extends ItemResolvivel> {
  items: T[];
  /** Trocados via `codigos_correcao`, igual ao que o scanner já fazia. */
  corrigidos: number;
  /** Casaram com o cadastro por uma grafia diferente e adotaram a do cadastro. */
  normalizados: number;
  /** Linhas fundidas por terem virado o mesmo código depois da resolução. */
  fundidos: number;
  /** Códigos sem produto correspondente; entram como vieram. */
  desconhecidos: string[];
}

/**
 * Resolve os códigos de um arquivo importado contra o cadastro de produtos.
 *
 * O caminho do scanner (`processCode` em `Inventario.tsx`) aplica
 * `codigos_correcao` e recusa código que não exista em `produtos`. A importação
 * não passava por nada disso: gravava o que viesse no arquivo, apenas em caixa
 * alta. Uma cor escrita `C02` num arquivo e `C2` noutro virava dois produtos
 * distintos em `itens_inventario`, e a comparação — que agrupa por
 * `codigo_auxiliar` exato — reportava os dois lados como divergência.
 *
 * Aqui a importação passa pelas mesmas regras, com uma diferença deliberada: um
 * código desconhecido **não é recusado**, só relatado. Bloquear importação é
 * decisão de produto, e recusar em silêncio um arquivo inteiro seria pior que o
 * problema que este ajuste resolve.
 */
export async function resolverCodigosImportados<T extends ItemResolvivel>(
  items: T[],
  correcoes: ReadonlyArray<{ cod_errado: string; cod_auxiliar_correto: string }>
): Promise<ResultadoResolucao<T>> {
  const catalogo = await carregarCatalogo();

  const porCodigo = new Map<string, ProdutoCatalogo>();
  const porChave = new Map<string, ProdutoCatalogo>();
  for (const produto of catalogo) {
    porCodigo.set(normalizarGrafia(produto.codigo_auxiliar), produto);
    // Havendo duas grafias cadastradas para a mesma chave, a primeira em ordem
    // alfabética vence. É arbitrário, mas estável entre execuções.
    const chave = chaveCodigoAuxiliar(produto.codigo_auxiliar);
    if (!porChave.has(chave)) porChave.set(chave, produto);
  }

  const porErrado = new Map<string, string>();
  for (const c of correcoes) porErrado.set(normalizarGrafia(c.cod_errado), c.cod_auxiliar_correto);

  let corrigidos = 0;
  let normalizados = 0;
  const desconhecidos: string[] = [];
  const acumulado = new Map<string, T>();

  for (const item of items) {
    const original = normalizarGrafia(item.codigo_auxiliar);

    const corrigido = porErrado.get(original);
    if (corrigido) corrigidos++;
    const codigo = corrigido ? normalizarGrafia(corrigido) : original;

    const produto = porCodigo.get(codigo) ?? porChave.get(chaveCodigoAuxiliar(codigo));
    if (produto && normalizarGrafia(produto.codigo_auxiliar) !== codigo) normalizados++;
    if (!produto) desconhecidos.push(codigo);

    const resolvido = {
      ...item,
      codigo_auxiliar: produto ? produto.codigo_auxiliar : codigo,
      // O nome do cadastro é a fonte da verdade quando existe; o do arquivo pode
      // estar defasado. Sem cadastro, preserva o que veio.
      nome_produto: produto ? produto.nome_produto : item.nome_produto,
    } as T;

    const existente = acumulado.get(resolvido.codigo_auxiliar);
    if (existente) {
      existente.quantidade_fisica += resolvido.quantidade_fisica;
    } else {
      acumulado.set(resolvido.codigo_auxiliar, resolvido);
    }
  }

  return {
    items: Array.from(acumulado.values()),
    corrigidos,
    normalizados,
    fundidos: items.length - acumulado.size,
    desconhecidos,
  };
}
