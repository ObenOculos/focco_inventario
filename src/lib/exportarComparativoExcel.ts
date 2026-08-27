/**
 * Exportação do comparativo em Excel, no mesmo desenho do `comparativo.py`.
 *
 * O layout é deliberadamente igual ao da ferramenta local: bandas coloridas por
 * origem do dado (contagem inicial, movimento, contagem final, divergência),
 * cabeçalho em duas linhas, filtro automático, painéis congelados e uma linha de
 * TOTAL com SUBTOTAL — que respeita o filtro do Excel em vez de somar tudo.
 *
 * POR QUE `exceljs` E NÃO O `xlsx` DO RESTO DO APP: o SheetJS na edição
 * comunitária não escreve estilo de célula — cor de fundo, fonte e borda são da
 * versão paga. Sem estilo não há o que replicar. O import é dinâmico para a
 * biblioteca não entrar no bundle de quem nunca exporta.
 */

/** Cores do `comparativo.py`. Mesmos hex, para os dois arquivos se parecerem. */
const COR = {
  cinza: 'FFD9D9D9',
  invA: 'FFC0552A',
  invAHdr: 'FFD36B3A',
  invAZebraClara: 'FFFDD9B5',
  invAZebraEscura: 'FFF5B97A',
  mov: 'FF2F6F4E',
  movZebraClara: 'FFE4F0EA',
  movZebraEscura: 'FFCFE6D8',
  invB: 'FF7B5EA7',
  invBHdr: 'FF9B7FC7',
  invBZebraClara: 'FFE2D4F5',
  invBZebraEscura: 'FFC4AEDE',
  dif: 'FF404040',
  difAlerta: 'FFFFD6D6',
  difZebraClara: 'FFEFEFEF',
  difZebraEscura: 'FFE4E4E4',
  branco: 'FFFFFFFF',
  preto: 'FF000000',
  vermelho: 'FFD00000',
} as const;

const FMT_BRL = '_-R$ * #,##0.00_-;-R$ * #,##0.00_-;_-R$ * "-"??_-;_-@_-';
const FMT_NUM = '#,##0';

export interface LinhaExportacao {
  codigo_auxiliar: string;
  nome_produto: string;
  /** Primeiro nível da hierarquia do Ciclone. `''` = produto fora do catálogo. */
  marca: string;
  valor_unitario: number;
  quantidade_a: number;
  remessa: number;
  venda: number;
  esperado: number;
  quantidade_b: number;
  diferenca: number;
}

/** Janela de busca de um movimento, em ISO (`2026-03-16`). */
export interface Janela {
  de: string;
  ate: string;
}

export interface OpcoesExportacao {
  linhas: LinhaExportacao[];
  /** dd/MM/yyyy — rótulos das bandas de contagem. */
  rotuloA: string;
  rotuloB: string;
  /**
   * Substitui o título da banda A. Existe para o modo primeiro inventário, em que
   * A não é uma contagem e sim a data em que a mala estava vazia — chamar aquilo de
   * "Inventário 10/07/2026" faria a planilha afirmar que houve uma contagem nesse dia.
   */
  tituloBandaA?: string;
  /** Sem reconciliação a banda de movimento não existe. */
  comMovimentos: boolean;
  comRemessas: boolean;
  comVendas: boolean;
  /**
   * Janelas REALMENTE usadas na busca, que não são necessariamente as datas dos
   * inventários — o usuário pode ajustá-las, e remessa e venda podem ter períodos
   * diferentes. Rotular a banda com as datas dos inventários faria a planilha
   * afirmar algo que não foi consultado.
   */
  janelaRemessa?: Janela | null;
  janelaVenda?: Janela | null;
  nomeArquivo: string;
}

const dataBr = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * Rótulo da banda de movimento.
 *
 * Junta as duas janelas quando coincidem ("Remessa e Venda 16/03 a 07/06") e as
 * separa quando divergem — é a informação que evita alguém ler a planilha
 * supondo um período único.
 */
function rotuloMovimento(remessa?: Janela | null, venda?: Janela | null): string {
  const iguais =
    remessa && venda && remessa.de === venda.de && remessa.ate === venda.ate;
  if (iguais) {
    return `Movimento — Remessa e Venda ${dataBr(remessa.de)} a ${dataBr(remessa.ate)}`;
  }
  const partes: string[] = [];
  if (remessa) partes.push(`Remessa ${dataBr(remessa.de)} a ${dataBr(remessa.ate)}`);
  if (venda) partes.push(`Venda ${dataBr(venda.de)} a ${dataBr(venda.ate)}`);
  return `Movimento — ${partes.join('   |   ')}`;
}

export async function exportarComparativoExcel(op: OpcoesExportacao): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Comparativo');

  // Colunas montadas conforme o que está ligado — a banda de movimento só existe
  // quando há movimento, e cada uma das duas colunas segue o seu toggle.
  const colunas: {
    chave: keyof LinhaExportacao | 'nada';
    titulo: string;
    banda: string;
    /** Largura da coluna; as numéricas usam a padrão. */
    largura?: number;
  }[] = [
    { chave: 'codigo_auxiliar', titulo: 'Código Auxiliar', banda: 'id', largura: 16 },
    { chave: 'nome_produto', titulo: 'Nome Produto', banda: 'id', largura: 32 },
    // A marca entra na banda de identificação, junto do código e do nome: é atributo
    // do produto, não medida do período. É também o que torna a planilha útil em
    // tabela dinâmica sem precisar quebrar a trilha de categoria em fórmula.
    { chave: 'marca', titulo: 'Marca', banda: 'id', largura: 18 },
    { chave: 'quantidade_a', titulo: 'Qtd Inicial', banda: 'a' },
  ];
  if (op.comMovimentos) {
    if (op.comRemessas) colunas.push({ chave: 'remessa', titulo: 'Remessa', banda: 'mov' });
    if (op.comVendas) colunas.push({ chave: 'venda', titulo: 'Venda', banda: 'mov' });
    colunas.push({ chave: 'esperado', titulo: 'Qtd Esperada', banda: 'mov' });
  }
  colunas.push({ chave: 'quantidade_b', titulo: 'Qtd Final', banda: 'b' });
  colunas.push({ chave: 'diferenca', titulo: 'Dif. Qtd', banda: 'dif' });
  colunas.push({ chave: 'valor_unitario', titulo: 'Valor Unit.', banda: 'dif' });
  colunas.push({ chave: 'nada', titulo: 'Dif. Valor', banda: 'dif' });

  const idx = (banda: string) => {
    const primeiro = colunas.findIndex((c) => c.banda === banda) + 1;
    const ultimo = colunas.length - [...colunas].reverse().findIndex((c) => c.banda === banda);
    return { primeiro, ultimo };
  };

  /**
   * Largura padrão das colunas de número. As de texto declaram a sua na lista.
   *
   * Antes as larguras vinham por POSIÇÃO (`getColumn(1) = 16`, `getColumn(2) = 32`, o
   * resto 14). Acrescentar uma coluna de texto no meio da banda de identificação dava
   * a ela a largura de um número e empurrava a régua inteira — o tipo de defeito que
   * só aparece depois de aberto o arquivo.
   */
  const LARGURA_NUM = 14;
  colunas.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.largura ?? LARGURA_NUM;
  });

  /** Colunas de TEXTO: alinham à esquerda e não entram no SUBTOTAL do rodapé. */
  const ehTexto = (chave: (typeof colunas)[number]['chave']) =>
    chave === 'codigo_auxiliar' || chave === 'nome_produto' || chave === 'marca';

  const borda = {
    top: { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
    left: { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
    right: { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
  };

  const pintar = (
    linha: number,
    col: number,
    valor: string | number | { formula: string } | null,
    fundo: string,
    opts: { negrito?: boolean; cor?: string; alinha?: 'left' | 'center' | 'right'; fmt?: string } = {}
  ) => {
    const cell = ws.getCell(linha, col);
    if (valor !== null) cell.value = valor as never;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
    cell.font = {
      name: 'Arial',
      size: 10,
      bold: opts.negrito ?? false,
      color: { argb: opts.cor ?? COR.preto },
    };
    cell.alignment = { horizontal: opts.alinha ?? 'center', vertical: 'middle' };
    cell.border = borda;
    if (opts.fmt) cell.numFmt = opts.fmt;
    return cell;
  };

  // ── Linha 1: bandas por origem do dado ───────────────────────────────────
  const bandas: { banda: string; titulo: string; cor: string }[] = [
    { banda: 'id', titulo: '', cor: COR.cinza },
    { banda: 'a', titulo: op.tituloBandaA ?? `Inventário ${op.rotuloA}`, cor: COR.invA },
  ];
  if (op.comMovimentos) {
    bandas.push({
      banda: 'mov',
      titulo: rotuloMovimento(
        op.comRemessas ? op.janelaRemessa : null,
        op.comVendas ? op.janelaVenda : null
      ),
      cor: COR.mov,
    });
  }
  bandas.push({ banda: 'b', titulo: `Inventário ${op.rotuloB}`, cor: COR.invB });
  bandas.push({ banda: 'dif', titulo: 'Divergência e valores', cor: COR.dif });

  for (const b of bandas) {
    const { primeiro, ultimo } = idx(b.banda);
    if (ultimo > primeiro) ws.mergeCells(1, primeiro, 1, ultimo);
    const cell = pintar(1, primeiro, b.titulo, b.cor, { negrito: true, cor: COR.branco });
    // Quebra de linha: com duas janelas distintas o rótulo passa de 70 caracteres
    // e a banda mesclada tem cerca de 42 de largura — sem isso o Excel corta.
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = primeiro; c <= ultimo; c++) {
      const outra = ws.getCell(1, c);
      outra.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: b.cor } };
      outra.border = borda;
    }
  }

  // Altura da linha 1 conforme o rótulo mais longo caber em uma ou duas linhas.
  const larguraBanda = (banda: string) => {
    const { primeiro, ultimo } = idx(banda);
    let soma = 0;
    for (let c = primeiro; c <= ultimo; c++) soma += Number(ws.getColumn(c).width) || LARGURA_NUM;
    return soma;
  };
  const precisaDuasLinhas = bandas.some(
    (b) => b.titulo.length > larguraBanda(b.banda) * 0.95
  );
  ws.getRow(1).height = precisaDuasLinhas ? 32 : 18;

  // ── Linha 2: cabeçalhos ──────────────────────────────────────────────────
  const fundoCabecalho: Record<string, string> = {
    id: COR.cinza,
    a: COR.invAHdr,
    mov: COR.mov,
    b: COR.invBHdr,
    dif: COR.dif,
  };
  colunas.forEach((c, i) => {
    const claro = c.banda === 'id';
    pintar(2, i + 1, c.titulo, fundoCabecalho[c.banda], {
      negrito: true,
      cor: claro ? COR.preto : COR.branco,
    });
  });

  const R0 = 3;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colunas.length } };
  // Congela a banda de IDENTIFICAÇÃO inteira, não duas colunas fixas: com a marca
  // dentro dela, um `xSplit: 2` deixaria a marca rolando para fora junto dos números.
  ws.views = [{ state: 'frozen', xSplit: idx('id').ultimo, ySplit: 2 }];

  // ── Dados ────────────────────────────────────────────────────────────────
  const zebra: Record<string, [string, string]> = {
    id: [COR.invAZebraClara, COR.invAZebraEscura],
    a: [COR.invAZebraClara, COR.invAZebraEscura],
    mov: [COR.movZebraClara, COR.movZebraEscura],
    b: [COR.invBZebraClara, COR.invBZebraEscura],
    dif: [COR.difZebraClara, COR.difZebraEscura],
  };

  op.linhas.forEach((l, i) => {
    const r = R0 + i;
    const par = i % 2 === 0;
    const alerta = l.diferenca !== 0;
    const difValor = l.diferenca * l.valor_unitario;

    colunas.forEach((c, j) => {
      const col = j + 1;
      const [claro, escuro] = zebra[c.banda];
      let fundo = par ? claro : escuro;
      // A banda de divergência ganha tinta de alerta quando há diferença — é o
      // sinal que o olho procura ao abrir a planilha.
      if (c.banda === 'dif' && alerta) fundo = COR.difAlerta;

      if (ehTexto(c.chave)) {
        pintar(r, col, l[c.chave as 'codigo_auxiliar'], fundo, { alinha: 'left' });
      } else if (c.chave === 'valor_unitario') {
        pintar(r, col, l.valor_unitario, fundo, { alinha: 'right', fmt: FMT_BRL });
      } else if (c.chave === 'nada') {
        pintar(r, col, difValor, fundo, {
          negrito: alerta,
          cor: difValor < 0 ? COR.vermelho : COR.preto,
          alinha: 'right',
          fmt: FMT_BRL,
        });
      } else if (c.chave === 'diferenca') {
        pintar(r, col, l.diferenca, fundo, {
          negrito: alerta,
          cor: l.diferenca < 0 ? COR.vermelho : COR.preto,
          fmt: FMT_NUM,
        });
      } else {
        pintar(r, col, l[c.chave] as number, fundo, { fmt: FMT_NUM });
      }
    });
  });

  // ── TOTAL ────────────────────────────────────────────────────────────────
  // SUBTOTAL(9) e não SUM: respeita o filtro automático, então filtrar por
  // "só divergências" mostra o total daquele recorte, não o geral.
  const rt = R0 + op.linhas.length;
  colunas.forEach((c, j) => {
    const col = j + 1;
    const letra = ws.getColumn(col).letter;
    const somavel = !ehTexto(c.chave);
    if (j === 0) {
      pintar(rt, col, 'TOTAL', COR.dif, { negrito: true, cor: COR.branco, alinha: 'left' });
    } else if (somavel && c.chave !== 'valor_unitario') {
      const moeda = c.chave === 'nada';
      pintar(rt, col, { formula: `SUBTOTAL(9,${letra}${R0}:${letra}${rt - 1})` }, COR.dif, {
        negrito: true,
        cor: COR.branco,
        alinha: moeda ? 'right' : 'center',
        fmt: moeda ? FMT_BRL : FMT_NUM,
      });
    } else {
      pintar(rt, col, null, COR.dif, { negrito: true, cor: COR.branco });
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = op.nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
