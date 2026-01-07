import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CodigoCorrecao {
  id: string;
  cod_auxiliar_correto: string;
  cod_errado: string;
  created_at: string;
}

export const useCodigosCorrecaoQuery = () => {
  return useQuery<CodigoCorrecao[], Error>({
    queryKey: ['codigosCorrecao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('codigos_correcao')
        .select('*')
        .order('cod_errado');

      if (error) {
        console.error('Erro ao buscar códigos de correção:', error);
        throw error;
      }

      return (data || []) as CodigoCorrecao[];
    },
  });
};

export const useInvalidateCodigosCorrecao = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['codigosCorrecao'] });
  };
};
