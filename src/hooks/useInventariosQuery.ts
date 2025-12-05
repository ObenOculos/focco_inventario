import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
};

export const useInventariosQuery = (codigoVendedor?: string | null) => {
  return useQuery({
    queryKey: ['inventarios', codigoVendedor],
    queryFn: async () => {
      if (!codigoVendedor) return [];

      const { data, error } = await supabase
        .from('inventarios')
        .select(`
          *,
          itens_inventario (*)
        `)
        .eq('codigo_vendedor', codigoVendedor)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InventarioComItens[];
    },
    enabled: !!codigoVendedor,
  });
};

export const useInventariosCountQuery = (codigoVendedor?: string | null, status?: InventoryStatus) => {
  return useQuery({
    queryKey: ['inventarios-count', codigoVendedor, status],
    queryFn: async () => {
      let query = supabase
        .from('inventarios')
        .select('id', { count: 'exact' });

      if (status) {
        query = query.eq('status', status);
      }

      if (codigoVendedor) {
        query = query.eq('codigo_vendedor', codigoVendedor);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!codigoVendedor || !codigoVendedor,
  });
};
