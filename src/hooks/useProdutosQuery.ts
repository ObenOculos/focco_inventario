import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Produto } from '@/types/app';
import { supabase } from '@/integrations/supabase/client';

export const useProdutosQuery = (page: number, pageSize: number, searchTerm: string) => {
  return useQuery<{ data: Produto[]; count: number }, Error>({
    queryKey: ['produtos', page, pageSize, searchTerm],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('produtos')
        .select('*', { count: 'exact' })
        .order('codigo_auxiliar', { ascending: true })
        .range(from, to);

      if (searchTerm) {
        query = query.or(
          `codigo_auxiliar.ilike.%${searchTerm}%,nome_produto.ilike.%${searchTerm}%`
        );
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return { data: data || [], count: count || 0 };
    },
  });
};

export const useInvalidateProdutos = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['produtos'] });
};
