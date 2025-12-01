import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';

/**
 * Calcula o estoque teórico de um vendedor considerando:
 * - Remessas (tipo 7): entrada
 * - Vendas (tipo 2): saída
 * - Devolução Cliente (tipo 3): entrada
 * - Devolução Empresa (tipo 4): saída
 * - Perda/Avaria (tipo 5): saída
 * - Ajuste (tipo 6): entrada ou saída
 */
export async function calcularEstoqueTeorico(codigoVendedor: string): Promise<Map<string, EstoqueItem>> {
  // Buscar itens dos pedidos
  const { data: pedidosData } = await supabase
    .from('itens_pedido')
    .select(`
      codigo_auxiliar,
      nome_produto,
      quantidade,
      pedidos!inner (
        codigo_vendedor,
        codigo_tipo
      )
    `)
    .eq('pedidos.codigo_vendedor', codigoVendedor);

  // Buscar movimentações avulsas
  const { data: movimentacoesData } = await supabase
    .from('movimentacoes_estoque')
    .select('*')
    .eq('codigo_vendedor', codigoVendedor);

  const estoqueMap = new Map<string, EstoqueItem>();

  // Processar itens dos pedidos
  pedidosData?.forEach((item: any) => {
    const key = item.codigo_auxiliar;
    const existing = estoqueMap.get(key) || {
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      modelo: item.codigo_auxiliar.split(' ')[0] || '',
      cor: item.codigo_auxiliar.split(' ')[1] || '',
      quantidade_remessa: 0,
      quantidade_venda: 0,
      estoque_teorico: 0,
    };

    const quantidade = Number(item.quantidade) || 0;
    const codigoTipo = item.pedidos?.codigo_tipo;

    if (codigoTipo === 7) {
      // Remessa: entrada
      existing.quantidade_remessa += quantidade;
    } else if (codigoTipo === 2) {
      // Venda: saída
      existing.quantidade_venda += quantidade;
    }

    existing.estoque_teorico = existing.quantidade_remessa - existing.quantidade_venda;
    estoqueMap.set(key, existing);
  });

  // Processar movimentações avulsas
  movimentacoesData?.forEach((mov: any) => {
    const key = mov.codigo_auxiliar;
    const existing = estoqueMap.get(key) || {
      codigo_auxiliar: mov.codigo_auxiliar,
      nome_produto: mov.nome_produto || mov.codigo_auxiliar,
      modelo: mov.codigo_auxiliar.split(' ')[0] || '',
      cor: mov.codigo_auxiliar.split(' ')[1] || '',
      quantidade_remessa: 0,
      quantidade_venda: 0,
      estoque_teorico: 0,
    };

    const quantidade = Number(mov.quantidade) || 0;
    const tipo = mov.tipo_movimentacao;

    // Tipo 3: Devolução Cliente (entrada)
    // Tipo 4: Devolução Empresa (saída - já vem negativo)
    // Tipo 5: Perda/Avaria (saída - já vem negativo)
    // Tipo 6: Ajuste (pode ser entrada ou saída conforme sinal)
    
    // Movimentações já vêm com o sinal correto (+ para entrada, - para saída)
    existing.estoque_teorico += quantidade;
    
    estoqueMap.set(key, existing);
  });

  // Recalcular estoque teórico final para todos os itens
  for (const [key, item] of estoqueMap) {
    item.estoque_teorico = item.quantidade_remessa - item.quantidade_venda;
    
    // Somar/subtrair movimentações
    const movs = movimentacoesData?.filter(m => m.codigo_auxiliar === key) || [];
    for (const mov of movs) {
      item.estoque_teorico += Number(mov.quantidade);
    }
    
    estoqueMap.set(key, item);
  }

  return estoqueMap;
}
