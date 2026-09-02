import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ROTULO_SITUACAO, type LinhaReposicao } from '@/lib/reposicaoMala';

/**
 * Exportação da Reposição da mala — **uma aba só**.
 *
 * Exporta o recorte visível: o que as caixas de marcação, os filtros de categoria e a
 * busca deixaram na tela. Mesma decisão da Consulta ao ERP (ver `exportarPedidosErp.ts`):
 * o arquivo é a resposta da pergunta que estava na tela, não a consulta inteira.
 *
 * ## Por que uma aba, e não duas
 *
 * A versão anterior tinha uma segunda aba, "Só na mala", com o que o representante tinha
 * e a loja não. Ela existia por um defeito de modelagem, não por necessidade: a lista
 * principal descartava linhas (saldo zero, saldo negativo) e o descartado precisava de
 * algum lugar. Duas abas obrigavam a comparar dois conjuntos que respondem à MESMA
 * pergunta — e uma tabela dinâmica sobre duas abas é trabalho manual.
 *
 * Hoje cada SKU é uma linha só, e a coluna `Situação` diz o que ele é. Filtrar por ela
 * reproduz qualquer uma das antigas abas em um clique.
 *
 * ## A ordem das colunas é a ordem da leitura
 *
 * Identidade → os dois números que se comparam → o veredito → a ação → o dinheiro →
 * a classificação. Quem abre a planilha responde "o que preciso pedir" nas seis primeiras
 * colunas, sem rolar para o lado. O resto é para quem vai dinamizar.
 */

interface Contexto {
  nomeVendedor: string;
  codigoVendedor: string;
  loja: number;
  dataInventario: string;
  /** Quantidade marcada por código auxiliar — vira a coluna "A repor". */
  selecao: ReadonlyMap<string, number>;
  tabela: 'venda' | 'remessa';
}

const COLUNAS = [
  'Código',
  'Produto',
  'Cor',
  'Na loja',
  'Na mala',
  'Situação',
  'A repor',
  'Alerta',
  'Disponível',
  'Em malas (todas)',
  'Valor unitário',
  'Valor a repor',
  'Modelo',
  'Marca',
  'Tipo',
  'Subtipo',
  'Grupo',
] as const;

/** `reposicao_10_20260902_1445.xlsx` — mesmo padrão de nome da Consulta ao ERP. */
export function nomeArquivoReposicao(codigoVendedor: string, agora = new Date()): string {
  const vendedor = codigoVendedor.replace(/[^\w-]/g, '') || 'vendedor';
  return `reposicao_${vendedor}_${format(agora, 'yyyyMMdd_HHmm')}.xlsx`;
}

export function exportarReposicaoExcel(
  linhas: readonly LinhaReposicao[],
  { nomeVendedor, codigoVendedor, loja, dataInventario, selecao, tabela }: Contexto,
  nomeArquivo = nomeArquivoReposicao(codigoVendedor)
): string {
  const dados = linhas.map((l) => {
    const aRepor = selecao.get(l.codigo_auxiliar) ?? 0;
    const unitario = tabela === 'remessa' ? l.valor_remessa : l.valor_produto;
    return {
      Código: l.codigo_auxiliar,
      Produto: l.nome_produto,
      Cor: l.cor_nome || l.cor,
      // Números saem como NÚMERO para a planilha poder somar; formatá-los aqui os
      // tornaria texto e a soma do Excel devolveria zero.
      'Na loja': l.saldoLoja,
      'Na mala': l.naMala,
      Situação: ROTULO_SITUACAO[l.situacao],
      'A repor': aRepor,
      // Coluna própria, e não um valor de Situação: saldo negativo convive com qualquer
      // situação, e quem filtra "cadastro furado" quer as duas leituras ao mesmo tempo.
      Alerta: l.cadastroFurado ? 'Saldo negativo' : '',
      Disponível: l.disponivel,
      'Em malas (todas)': l.emTerceiro,
      'Valor unitário': unitario,
      'Valor a repor': aRepor * unitario,
      Modelo: l.modelo,
      Marca: l.marca ?? '',
      Tipo: l.tipo ?? '',
      Subtipo: l.subtipo ?? '',
      Grupo: l.grupo ?? '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(dados, {
    // Sem isto a ordem das colunas viria das chaves do primeiro objeto, e uma linha
    // inicial com campo faltando reordenaria a planilha inteira.
    header: [...COLUNAS],
  });

  // Larguras: o que se lê (código, produto) precisa caber; o resto é número curto.
  ws['!cols'] = [
    { wch: 16 }, { wch: 34 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 18 },
    { wch: 9 }, { wch: 15 }, { wch: 11 }, { wch: 16 }, { wch: 13 }, { wch: 13 },
    { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
  ];
  // Filtro automático já ligado no cabeçalho: a coluna `Situação` só serve se der para
  // filtrar por ela sem o usuário ter que criar a tabela à mão.
  if (dados.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: COLUNAS.length - 1, r: dados.length },
    }) };
  }
  // Cabeçalho congelado: com 1.300 linhas, rolar perde o nome das colunas na terceira
  // tela e o número deixa de significar coisa nenhuma.
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reposicao');

  // O escopo vive nos METADADOS e no nome do arquivo, não numa faixa acima da tabela:
  // qualquer linha antes do cabeçalho quebra o filtro automático, e a planilha existe
  // justamente para ser filtrada.
  wb.Props = {
    Title: `Reposição da mala — ${nomeVendedor}`,
    Subject:
      `Loja ${loja} · inventário de ${dataInventario} · tabela de ${tabela} · ` +
      `${dados.length} SKU(s)`,
    CreatedDate: new Date(),
  };

  XLSX.writeFile(wb, nomeArquivo);
  return nomeArquivo;
}
