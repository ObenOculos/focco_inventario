import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
  profiles?: { nome: string };
};

export const useInventariosPendentesQuery = () => {
  return useQuery<InventarioComItens[], Error>({
    queryKey: ['inventariosPendentes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventarios')
        .select(`*, itens_inventario (*), profiles!inventarios_user_id_fkey (nome)`)
        .in('status', ['pendente', 'revisao'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar inventários:', error);
        throw error;
      }

      return (data || []) as unknown as InventarioComItens[];
    },
  });
};

export type { InventarioComItens };
