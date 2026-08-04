import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Consultas do Dashboard. Só leem `inventarios` e `profiles`.
 *
 * Foram removidos daqui, junto com o subsistema de estoque por pedidos:
 *   - `useEstoqueQuery` (estoque teórico via calcular_estoque_vendedor_paginado)
 *   - `useMovimentacaoResumoQuery` (remessas e vendas em pedidos/itens_pedido)
 *   - `useEstoqueRealStatsQuery` (tabela estoque_real)
 *   - `useStatusInventariosQuery`, que já não tinha nenhum consumidor
 */

interface InventarioEmRevisao {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string;
  data: string;
}

/** Últimos inventários devolvidos para revisão, para o gerente acompanhar. */
export const useInventariosEmRevisaoQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['inventarios-em-revisao', isGerente],
    queryFn: async (): Promise<InventarioEmRevisao[]> => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario')
        .eq('status', 'revisao')
        .order('data_inventario', { ascending: false })
        .limit(5);

      if (error) throw error;

      const vendedorCodigos = [...new Set(data?.map((d) => d.codigo_vendedor) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .in('codigo_vendedor', vendedorCodigos);

      const nomeMap = new Map(profiles?.map((p) => [p.codigo_vendedor, p.nome]) || []);

      return (
        data?.map((d) => ({
          codigo_vendedor: d.codigo_vendedor,
          nome_vendedor: nomeMap.get(d.codigo_vendedor) || d.codigo_vendedor,
          inventario_id: d.id,
          data: d.data_inventario,
        })) || []
      );
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000,
  });
};
