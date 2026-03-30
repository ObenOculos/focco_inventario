import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
  profiles?: { nome: string };
};

export const useInventariosPendentesQuery = (
  statusFilter: string = 'todos',
  vendedorFilter: string = 'todos'
) => {
  return useQuery<InventarioComItens[], Error>({
    queryKey: ['inventariosPendentes', statusFilter, vendedorFilter],
    queryFn: async () => {
      let query = supabase
        .from('inventarios')
        .select(`*, itens_inventario (*), profiles!inventarios_user_id_fkey (nome)`)
        .order('created_at', { ascending: false });

      if (statusFilter === 'pendentes') {
        query = query.in('status', ['pendente', 'revisao']);
      } else if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      if (vendedorFilter !== 'todos') {
        query = query.eq('codigo_vendedor', vendedorFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar inventários:', error);
        throw error;
      }

      return (data || []) as unknown as InventarioComItens[];
    },
  });
};

export type { InventarioComItens };
