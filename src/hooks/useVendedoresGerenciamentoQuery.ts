import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/app';

export const useVendedoresListQuery = () => {
  return useQuery<Profile[], Error>({
    queryKey: ['vendedoresList'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'vendedor')
        .order('nome');

      if (error) {
        console.error('Erro ao buscar vendedores:', error);
        throw error;
      }

      return (data || []) as Profile[];
    },
  });
};

// `useCodigosDisponiveisQuery` foi removida: ela sugeria códigos de vendedor a partir dos
// codigo_vendedor distintos da tabela `pedidos`, alimentada pela importação do ERP. Com
// `pedidos` vazia a lista vinha sempre sem opções, o que impedia cadastrar o código de um
// vendedor novo. O código agora é digitado direto no formulário.

export const useInvalidateVendedores = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['vendedoresList'] });
  };
};
