import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type Movimentacao = Database['public']['Tables']['movimentacoes_estoque']['Row'];
type MovimentacaoInsert = Database['public']['Tables']['movimentacoes_estoque']['Insert'];

export const useMovimentacoesQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['movimentacoes', codigoVendedor, isGerente],
    queryFn: async () => {
      let query = supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('data_movimentacao', { ascending: false })
        .range(0, 9999); // Aumenta limite padrão

      if (!isGerente && codigoVendedor) {
        query = query.eq('codigo_vendedor', codigoVendedor);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Movimentacao[];
    },
    enabled: !!codigoVendedor || isGerente === true,
  });
};

export const useCreateMovimentacao = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (movimentacao: MovimentacaoInsert) => {
      const { error } = await supabase
        .from('movimentacoes_estoque')
        .insert(movimentacao);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimentacoes'] });
      toast.success('Movimentação registrada!');
    },
    onError: (error) => {
      console.error(error);
      toast.error('Erro ao registrar movimentação');
    },
  });
};
