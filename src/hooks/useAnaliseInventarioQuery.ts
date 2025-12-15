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
        console.error("Erro ao buscar inventários:", error);
        throw error;
      }

      // Enrich inventories with seller names
      return (data || []).map((inv) => {
        const vendedor = vendedores.find(v => v.codigo_vendedor === inv.codigo_vendedor);
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

      const { data, error } = await supabase.rpc('comparar_estoque_inventario', {
        p_inventario_id: inventarioId,
      });

      if (error) {
        console.error('Erro ao buscar comparativo:', error);
        throw error;
      }

      return data || [];
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
        console.error("Erro ao buscar vendedores:", error);
        return [];
      }

      return (data || []).filter(v => v.codigo_vendedor) as VendedorSimples[];
    },
    enabled,
  });
};

export type { InventarioInfo, ComparativoItem, VendedorSimples };
