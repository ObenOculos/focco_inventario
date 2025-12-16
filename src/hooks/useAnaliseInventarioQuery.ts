import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface InventarioInfo {
  id: string;
  data_inventario: string;
  status: string;
  codigo_vendedor: string;
  vendedor_nome?: string;
}

interface ComparativoItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  divergencia: number;
}

interface VendedorSimples {
  codigo_vendedor: string;
  nome: string;
}

export const useInventariosAnaliseQuery = (
  isGerente: boolean,
  userVendorCode: string | null | undefined,
  selectedVendedor: string,
  vendedores: VendedorSimples[]
) => {
  return useQuery<InventarioInfo[], Error>({
    queryKey: ['inventariosAnalise', selectedVendedor, userVendorCode, vendedores.length],
    queryFn: async () => {
      let query = supabase
        .from('inventarios')
        .select('id, data_inventario, status, codigo_vendedor')
        .order('data_inventario', { ascending: false });

      if (!isGerente) {
        query = query.eq('codigo_vendedor', userVendorCode);
      } else if (selectedVendedor !== 'todos') {
        query = query.eq('codigo_vendedor', selectedVendedor);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar inventários:', error);
        throw error;
      }

      // Enrich inventories with seller names
      return (data || []).map((inv) => {
        const vendedor = vendedores.find((v) => v.codigo_vendedor === inv.codigo_vendedor);
        return {
          ...inv,
          vendedor_nome: vendedor?.nome || inv.codigo_vendedor,
        };
      });
    },
    enabled: !!userVendorCode || isGerente,
  });
};

export const useComparativoInventarioQuery = (inventarioId: string | null) => {
  return useQuery<ComparativoItem[], Error>({
    queryKey: ['comparativoInventario', inventarioId],
    queryFn: async () => {
      if (!inventarioId) return [];

      // Função para buscar dados em lotes
      const fetchComparativoInBatches = async (): Promise<ComparativoItem[]> => {
        const allData: ComparativoItem[] = [];
        let offset = 0;
        const batchSize = 500;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase.rpc('comparar_estoque_inventario_paginado', {
            p_inventario_id: inventarioId,
            p_limit: batchSize,
            p_offset: offset,
          });

          if (error) {
            console.error(`Erro ao buscar comparativo (offset ${offset}):`, error);
            throw error;
          }

          if (data && data.length > 0) {
            // Mapeia os campos retornados pela função SQL para a interface esperada
            const mappedData = (data as any[]).map((item) => ({
              codigo_auxiliar: item.codigo_auxiliar,
              nome_produto: item.nome_produto,
              estoque_teorico: Number(item.estoque_teorico ?? item.quantidade_inventario ?? 0),
              quantidade_fisica: Number(item.quantidade_fisica ?? item.quantidade_contada ?? 0),
              divergencia: Number(item.divergencia ?? item.diferenca ?? 0),
            }));
            allData.push(...mappedData);
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        return allData;
      };

      return fetchComparativoInBatches();
    },
    enabled: !!inventarioId,
  });
};

export const useVendedoresSimpleQuery = (enabled: boolean) => {
  return useQuery<VendedorSimples[], Error>({
    queryKey: ['vendedoresSimples'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .eq('role', 'vendedor')
        .order('nome');

      if (error) {
        console.error('Erro ao buscar vendedores:', error);
        return [];
      }

      return (data || []).filter((v) => v.codigo_vendedor) as VendedorSimples[];
    },
    enabled,
  });
};

export type { InventarioInfo, ComparativoItem, VendedorSimples };
