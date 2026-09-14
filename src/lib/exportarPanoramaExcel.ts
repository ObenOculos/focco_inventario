import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { LinhaPanorama } from '@/hooks/usePanoramaQuery';
import { SEM_CLASSIFICACAO } from '@/lib/panorama';
import { SEM_CATEGORIA } from '@/lib/categoriasProduto';

/**
 * Exportação das movimentações do Panorama — entradas e saídas na MESMA grade.
 *
 * Uma aba só, com uma coluna `Sentido`, e não duas abas por lente. As duas lentes
 * respondem à mesma pergunta em direções opostas, e separá-las obrigaria a colar as
 * abas à mão para perguntar qualquer coisa que atravesse as duas ("quanto entrou e
 * saiu de OBEN em junho"). Com uma grade única, isso é uma tabela dinâmica.
 *
 * ## Quem quer só um sentido escolhe o ARQUIVO, nunca a aba
 *
 * O menu de exportação oferece os três recortes (`RecorteSentido`), e cada um gera um
 * arquivo com a grade inteira do que foi pedido. A alternativa — duas abas no mesmo
 * arquivo — foi recusada aqui e também em `exportarReposicaoExcel`, pelo mesmo motivo:
 * tabela dinâmica não atravessa abas, e o usuário acabaria colando à mão o que a
 * ferramenta tinha acabado de separar.
 *
 * ⚠️ **As colunas são as MESMAS nos três recortes, `Sentido` inclusive.** Num arquivo
 * só de saídas essa coluna parece redundante, e é ela que deixa os dois arquivos serem
 * reunidos com um Ctrl+V quando alguém mudar de ideia. Cabeçalhos que divergem por
 * recorte custariam exatamente o trabalho manual que a grade única existe para evitar.
 *
 * **O que sai é o RECORTE VISÍVEL**, não a consulta inteira: já sem `DIVERSOS` quando
 * a caixa está marcada e já recortado pelo mês em foco. Mesma decisão da Consulta ao
 * ERP — o arquivo é a resposta da pergunta que estava na tela.
 *
 * ## O grão é o AGREGADO, e isso não é escolha estética
 *
 * Cada linha é `mês × empresa × categoria × contraparte × natureza da nota`, que é
 * exatamente o que o gateway devolve. Descer à linha de nota exigiria uma rota nova e
 * não caberia: medido em 2026-09-09, o ano corrente das duas empresas tem **34.451
 * linhas de nota** contra 20 mil de teto no gateway. O agregado do mesmo período tem
 * 6.667.
 *
 * ## Custo fica de fora
 *
 * O Ciclone não guarda custo histórico — o único que existe é o do cadastro de HOJE,
 * então o CMV de um mês antigo se move quando o produto é reprecificado. Na tela isso
 * vive ao lado de um `ⓘ` que explica a ressalva; numa planilha que circula por e-mail
 * a coluna viajaria sozinha, sem o aviso, e uma margem errada com cara de exata é pior
 * que uma coluna ausente.
 */

type BaseData = 'movimento' | 'emissao';

/**
 * O cabeçalho da coluna de mês DECLARA a base da data, e isso não é enfeite.
 *
 * `movimento` (data da nota) e `emissao` (data do pedido) são o mesmo botão do filtro
 * da tela, e **só coincidem em 34,6% das linhas** — mediana de 2 dias de diferença.
 * Uma planilha que diz só "Mês" obriga quem a recebeu a adivinhar qual das duas está
 * lendo, e a resposta muda de qual mês a linha é. O escopo já vai nos metadados do
 * arquivo, mas metadado ninguém abre: o nome da coluna, sim.
 */
const rotuloMes = (base: BaseData): string =>
  base === 'emissao' ? 'Mês (emissão do pedido)' : 'Mês (movimento)';

/**
 * ⚠️ **Não há data de DIA aqui, e não é omissão.** O gateway responde com
 * `date_trunc('month', …)`: o dia já foi somado fora no Postgres, e uma linha desta
 * planilha é "junho inteiro, empresa 2, OBEN, VENDA, fulano" — não um documento.
 * Escrever `01/06/2026` daria a uma agregação a cara de uma data exata.
 */
const COLUNAS_APOS_MES = [
  'Empresa',
  'Classificação',
  'Contraparte',
  'Cód. Contraparte',
  'Papel',
  'UF',
  'Marca',
  'Tipo',
  'Subtipo',
  'Grupo',
  'Tipo de pedido',
  'Operação',
  'CFOP',
  'CFOP Descrição',
  'Unidades',
  'Valor',
  'Linhas de nota',
] as const;

/**
 * Colunas na ordem final, com o rótulo do mês já resolvido.
 *
 * A ordem é de leitura: o que a movimentação É, com quem foi, o que era, e só então
 * quanto foi. Os números ficam no fim porque é onde a soma do Excel os espera, e
 * porque a identificação da linha precisa caber na primeira tela.
 */
const colunasDe = (base: BaseData): string[] => [
  'Sentido',
  rotuloMes(base),
  ...COLUNAS_APOS_MES,
];

type Sentido = 'Entrada' | 'Saída';

/** `2026-06-01` -> `2026-06`. ISO porque ordena certo como texto; `06/26` não. */
const mesCurto = (iso: string | undefined): string =>
  typeof iso === 'string' && iso.length >= 7 ? iso.slice(0, 7) : '';

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const numero = (v: unknown): number => Number(v) || 0;

/** `2 - PEDIDO DE VENDA - MALA`, ou só o código quando o Ciclone não descreve. */
const comDescricao = (cod: unknown, desc: unknown): string => {
  const c = texto(cod).trim();
  const d = texto(desc).trim();
  if (!c && !d) return '';
  return d ? `${c} - ${d}` : c;
};

/**
 * O papel de quem está do outro lado.
 *
 * ⚠️ Sai de `contraparte_representante`, que o gateway deriva do CADASTRO de
 * vendedores — **nunca da classificação**. Deduzir do CFOP ("remessa vai para
 * representante") erraria: em 2026, `VENDA` tem 125 unidades endereçadas a
 * representantes e `BONIFICAÇÃO/BRINDE` outras 980. É a mesma anomalia que a
 * auditoria da Consulta ao ERP levanta como sinal S2.
 *
 * Quando não é representante, o papel depende do lado: quem manda mercadoria para a
 * empresa é fornecedor, quem recebe é cliente.
 */
const papelDa = (l: LinhaPanorama, sentido: Sentido): string => {
  if (l.contraparte_cod === null || l.contraparte_cod === undefined) return '';
  if (l.contraparte_representante) return 'Representante';
  return sentido === 'Entrada' ? 'Fornecedor' : 'Cliente';
};

/**
 * A classificação da linha, que é o campo de nome diferente em cada lente.
 *
 * `classif_operacao` (saída) e `classif_entrada` (entrada) não podem virar um campo
 * só no gateway: são mapas de CFOP DIFERENTES — na saída o sufixo 102 é venda, na
 * entrada 2102 é compra. O que se unifica é a COLUNA da planilha, aqui.
 */
const classificacaoDa = (l: LinhaPanorama, sentido: Sentido): string =>
  (sentido === 'Entrada' ? l.classif_entrada : l.classif_operacao) || SEM_CLASSIFICACAO;

type Registro = Record<string, string | number>;

function registroDe(l: LinhaPanorama, sentido: Sentido, colMes: string): Registro {
  const cod = l.contraparte_cod;
  return {
    Sentido: sentido,
    [colMes]: mesCurto(l.mes),
    Empresa: numero(l.empresa),
    'Classificação': classificacaoDa(l, sentido),
    // O nome cai para o código quando o cadastro não tem nome — some-lo em branco
    // deixaria a linha sem nenhuma identificação de com quem ela foi.
    Contraparte: l.contraparte || (cod ? `Código ${cod}` : ''),
    'Cód. Contraparte': cod ?? '',
    Papel: papelDa(l, sentido),
    UF: l.uf || '',
    Marca: l.marca || SEM_CATEGORIA,
    Tipo: l.tipo || SEM_CATEGORIA,
    Subtipo: l.subtipo || SEM_CATEGORIA,
    Grupo: l.grupo || SEM_CATEGORIA,
    // Só a saída tem pedido; na entrada a coluna fica vazia em vez de ausente, senão
    // as duas metades da grade teriam formatos diferentes.
    'Tipo de pedido':
      sentido === 'Saída' ? comDescricao(l.tipo_pedido_cod, l.tipo_pedido_desc) : '',
    'Operação': comDescricao(l.operacao_cod, l.operacao_desc),
    CFOP: texto(l.cfop),
    'CFOP Descrição': texto(l.cfop_desc),
    // Números saem como NÚMERO para a planilha poder somar; formatá-los aqui os
    // tornaria texto e a soma do Excel devolveria zero.
    Unidades: numero(l.quantidade),
    Valor: numero(l.valor),
    'Linhas de nota': numero(l.linhas),
  };
}

/**
 * O rótulo das empresas no metadado.
 *
 * ⚠️ `empresas` chega **ausente** quando o filtro está em "Ambas" — é a convenção de
 * todo o app (`empresasDaEscolha`), que omite o parâmetro para o padrão do gateway
 * continuar valendo sem o cliente repetir quais são as duas. Ler `.join` direto
 * quebrava a exportação inteira justamente no caso mais comum, e com `strict: false`
 * no `tsconfig` o compilador não reclamava: `number[] | undefined` entrava num
 * `number[]` sem um aviso sequer.
 */
const rotuloEmpresas = (empresas?: number[]): string =>
  empresas && empresas.length > 0 ? `empresa(s) ${empresas.join(', ')}` : 'ambas as empresas';

export interface EscopoExportado {
  de: string;
  ate: string;
  /** Ausente = ambas, pelo padrão do gateway. Ver `rotuloEmpresas`. */
  empresas?: number[];
  /** Mês em foco, quando há um. Já veio aplicado às linhas. */
  mes?: string | null;
  /** Ausente = os dois sentidos. Ver `RecorteSentido`. */
  sentido?: RecorteSentido;
  baseData: 'movimento' | 'emissao';
  ocultarDiversos: boolean;
}

/**
 * Qual metade da movimentação vai no arquivo.
 *
 * Não é deduzido de qual array veio vazio: um período pode genuinamente não ter
 * entrada nenhuma, e aí o arquivo se renomearia sozinho para "só saídas" sem ninguém
 * ter pedido isso. O recorte é intenção do usuário, então viaja declarado.
 */
export type RecorteSentido = 'ambos' | 'saidas' | 'entradas';

/** O que cada recorte nomeia — arquivo, aba do Excel e o texto do metadado. */
const RECORTE: Record<RecorteSentido, { arquivo: string; aba: string; rotulo: string }> = {
  ambos: { arquivo: 'movimentacoes', aba: 'Movimentacoes', rotulo: 'saídas e entradas' },
  saidas: { arquivo: 'saidas', aba: 'Saidas', rotulo: 'só saídas' },
  entradas: { arquivo: 'entradas', aba: 'Entradas', rotulo: 'só entradas' },
};

/**
 * `panorama_saidas_20250101-20251231_20260914_1445.xlsx`.
 *
 * Recorte E período entram no NOME, não só nos metadados, porque os arquivos caem
 * todos na mesma pasta de Downloads com a mesma cara. Metadado ninguém abre; nome de
 * arquivo é o único rótulo que sobrevive a um anexo de e-mail e a uma pasta.
 *
 * ⚠️ **O período também desempata.** Só com o carimbo de hora, exportar 2024 e 2025
 * dentro do mesmo minuto produzia dois arquivos de nome IDÊNTICO — o navegador
 * acrescenta "(1)" e a pessoa abre o primeiro achando que é o novo. Foi assim que a
 * exportação pareceu ignorar o filtro.
 *
 * A hora fica mesmo assim: duas leituras do MESMO período com camadas diferentes
 * (Diversos, mês em foco) continuam sendo arquivos distintos.
 */
export function nomeArquivoPanorama(
  agora = new Date(),
  sentido: RecorteSentido = 'ambos',
  periodo?: { de: string; ate: string }
): string {
  // `split/join` e não `replaceAll`: o alvo do `tsconfig` é ES2020, onde ele não existe.
  const compacto = (iso: string) => iso.split('-').join('');
  const trecho = periodo ? `${compacto(periodo.de)}-${compacto(periodo.ate)}_` : '';
  return `panorama_${RECORTE[sentido].arquivo}_${trecho}${format(agora, 'yyyyMMdd_HHmm')}.xlsx`;
}

export function exportarPanoramaExcel(
  saidas: readonly LinhaPanorama[],
  entradas: readonly LinhaPanorama[],
  escopo: EscopoExportado,
  // `undefined` e não um padrão no parâmetro: o nome depende do `sentido`, que só se
  // conhece DENTRO da função. Um `= nomeArquivoPanorama()` na assinatura seria
  // avaliado antes de olhar o escopo, e todo arquivo sairia como "movimentacoes".
  nomeArquivo?: string
): { nomeArquivo: string; linhas: number } {
  const colunas = colunasDe(escopo.baseData);
  const colMes = rotuloMes(escopo.baseData);
  const recorte = RECORTE[escopo.sentido ?? 'ambos'];
  const arquivo =
    nomeArquivo ??
    nomeArquivoPanorama(new Date(), escopo.sentido ?? 'ambos', {
      de: escopo.de,
      ate: escopo.ate,
    });

  const dados: Registro[] = [
    ...saidas.map((l) => registroDe(l, 'Saída', colMes)),
    ...entradas.map((l) => registroDe(l, 'Entrada', colMes)),
  ];

  // Ordem de leitura, não a ordem em que as consultas voltaram: entrada e saída do
  // mesmo mês precisam ficar juntas para a grade responder "o que aconteceu em junho"
  // sem o usuário ordenar à mão.
  dados.sort(
    (a, b) =>
      String(a[colMes]).localeCompare(String(b[colMes])) ||
      String(a.Sentido).localeCompare(String(b.Sentido)) ||
      String(a['Classificação']).localeCompare(String(b['Classificação'])) ||
      // Maior volume primeiro dentro do grupo — comparação NUMÉRICA: como texto,
      // "9" viria antes de "10" e a ordem do arquivo mentiria sobre o tamanho.
      Number(b.Unidades) - Number(a.Unidades)
  );

  const ws = XLSX.utils.json_to_sheet(dados, {
    // Sem isto a ordem das colunas viria das chaves do primeiro objeto, e uma linha
    // inicial com campo faltando reordenaria a planilha inteira.
    header: colunas,
  });

  // Larguras: o que se lê (contraparte, descrições) precisa caber; o resto é curto.
  ws['!cols'] = [
    { wch: 9 }, { wch: 22 }, { wch: 8 }, { wch: 20 }, { wch: 38 }, { wch: 15 },
    { wch: 14 }, { wch: 5 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
    { wch: 26 }, { wch: 28 }, { wch: 8 }, { wch: 30 }, { wch: 11 }, { wch: 14 },
    { wch: 14 },
  ];

  // Filtro automático no cabeçalho: a grade existe para ser recortada por Sentido,
  // Papel ou Classificação, e obrigar o usuário a criar a tabela à mão desperdiçaria
  // justamente as colunas que este arquivo veio acrescentar.
  if (dados.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { c: 0, r: 0 },
        e: { c: colunas.length - 1, r: dados.length },
      }),
    };
  }
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, recorte.aba);

  // O escopo vive nos METADADOS, não numa faixa acima do cabeçalho: qualquer linha
  // antes dele quebraria o filtro automático. Mesma decisão da exportação da mala.
  wb.Props = {
    Title: `Panorama — ${recorte.rotulo}`,
    Subject:
      `${escopo.de} a ${escopo.ate} · ${rotuloEmpresas(escopo.empresas)} · ` +
      `${recorte.rotulo} · ` +
      `agregado por mês, base ${escopo.baseData === 'emissao' ? 'emissão do pedido' : 'movimento'}` +
      (escopo.mes ? ` · mês em foco ${mesCurto(escopo.mes)}` : '') +
      (escopo.ocultarDiversos ? ' · sem DIVERSOS' : '') +
      ` · ${dados.length} linha(s) de agregado`,
    CreatedDate: new Date(),
  };

  XLSX.writeFile(wb, arquivo);

  return { nomeArquivo: arquivo, linhas: dados.length };
}
