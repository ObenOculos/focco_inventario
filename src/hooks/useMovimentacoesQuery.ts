import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Movimentacao {
  id: string;
  codigo_vendedor: string;
  codigo_auxiliar: string;
  nome_produto: string | null;
  tipo_movimentacao: number;
  quantidade: number;
  motivo: string | null;
  observacoes: string | null;
  data_movimentacao: string;
  created_at: string;
}

export const useMovimentacoesQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['movimentacoes', codigoVendedor, isGerente],
    queryFn: async () => {
      let query = supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('data_movimentacao', { ascending: false });

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
    mutationFn: async (movimentacao: {
      user_id: string;
      codigo_vendedor: string;
      codigo_auxiliar: string;
      nome_produto: string;
      tipo_movimentacao: number;
      quantidade: number;
      motivo: string;
      observacoes: string | null;
    }) => {
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
