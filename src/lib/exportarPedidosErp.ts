import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import type { PedidoErp } from '@/hooks/useConsultaErpQuery';
import { COLUNAS_PEDIDO, type ColunaPedido } from './colunasPedidosErp';

/**
 * Exportação do resultado da Consulta ao ERP para Excel.
 *
 * Exporta o RECORTE VISÍVEL (o que o refino deixou), e não a consulta inteira: o
 * arquivo é a resposta da pergunta que estava na tela. É a mesma decisão da ferramenta
 * local, que exporta `df_view`.
 *
 * Leva sempre as 32 colunas do registro, mesmo na visão Sintética: a tela é onde se
 * procura e o arquivo é onde se guarda — quem exporta quer o registro inteiro, não a
 * amostra que caber na largura do monitor. Os títulos são os da ferramenta local, então as
 * duas planilhas dão para comparar lado a lado.
 */

function celula(linha: PedidoErp, coluna: ColunaPedido): string | number {
  const valor = linha[coluna.campo];
  if (valor === null || valor === undefined) return '';

  if (coluna.tipo === 'data') {
    try {
      return format(parseISO(String(valor)), 'dd/MM/yyyy');
    } catch {
      return String(valor);
    }
  }
  // Número e dinheiro saem como NÚMERO para a planilha poder somar; formatar aqui os
  // tornaria texto e a soma do Excel devolveria zero.
  if (coluna.tipo === 'numero' || coluna.tipo === 'moeda') return Number(valor) || 0;
  return typeof valor === 'number' ? valor : String(valor);
}

/** `pedidos_erp_20260813_1445.xlsx` — o mesmo padrão de nome da ferramenta local. */
export function nomeArquivoPedidos(agora = new Date()): string {
  return `pedidos_erp_${format(agora, 'yyyyMMdd_HHmm')}.xlsx`;
}

export function exportarPedidosErp(linhas: PedidoErp[], nomeArquivo = nomeArquivoPedidos()) {
  const dados = linhas.map((l) => {
    const registro: Record<string, string | number> = {};
    for (const coluna of COLUNAS_PEDIDO) registro[coluna.titulo] = celula(l, coluna);
    return registro;
  });

  const ws = XLSX.utils.json_to_sheet(dados, {
    // Sem isto a ordem das colunas viria das chaves do primeiro objeto, e uma linha
    // inicial com campo faltando reordenaria a planilha inteira.
    header: COLUNAS_PEDIDO.map((c) => c.titulo),
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
  XLSX.writeFile(wb, nomeArquivo);

  return nomeArquivo;
}
