import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Produto } from '@/types/app';
import { fetchAllInBatches } from '@/lib/supabaseUtils';

export const useProdutosQuery = () => {
  return useQuery<Produto[], Error>({
    queryKey: ['produtos'],
    queryFn: async () => {
      const data = await fetchAllInBatches<Produto>('produtos', {
        select: '*',
        orderBy: 'codigo_auxiliar',
        ascending: true,
      });

      return data;
    },
  });
};

export const useInvalidateProdutos = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['produtos'] });
};
