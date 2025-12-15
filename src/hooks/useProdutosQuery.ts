import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Produto } from '@/types/app';

export const useProdutosQuery = () => {
  return useQuery<Produto[], Error>({
    queryKey: ['produtos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('produtos').select('*').order('codigo_auxiliar');

      if (error) {
        console.error('Erro ao buscar produtos:', error);
        throw error;
      }

      return (data || []) as Produto[];
    },
  });
};

export const useInvalidateProdutos = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['produtos'] });
};
