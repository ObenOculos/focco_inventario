import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/app';

/**
 * Calcula o estoque teórico de um vendedor usando função SQL agregada.
 * Retorna apenas os totais por produto (máximo ~4k linhas vs 79k linhas brutas).
 */
export async function calcularEstoqueTeorico(codigoVendedor: string): Promise<Map<string, EstoqueItem>> {
  const { data, error } = await supabase.rpc('calcular_estoque_vendedor', {
    p_codigo_vendedor: codigoVendedor
  });

  if (error) {
    console.error('Erro ao calcular estoque:', error);
    throw error;
  }

  const estoqueMap = new Map<string, EstoqueItem>();

  data?.forEach((item: any) => {
    estoqueMap.set(item.codigo_auxiliar, {
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      modelo: item.modelo,
      cor: item.cor,
      quantidade_remessa: Number(item.quantidade_remessa),
      quantidade_venda: Number(item.quantidade_venda),
      estoque_teorico: Number(item.estoque_teorico),
    });
  });

  return estoqueMap;
}
