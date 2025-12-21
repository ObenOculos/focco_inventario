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

export const useCodigosDisponiveisQuery = () => {
  return useQuery<string[], Error>({
    queryKey: ['codigosDisponiveis'],
    queryFn: async () => {
      // Buscar todos os códigos de vendedor únicos dos pedidos
      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidos')
        .select('codigo_vendedor')
        .not('codigo_vendedor', 'is', null);

      if (pedidosError) {
        console.error('Erro ao buscar códigos:', pedidosError);
        return [];
      }

      // Buscar códigos já associados a vendedores
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      if (profilesError) {
        console.error('Erro ao buscar perfis:', profilesError);
        return [];
      }

      // Extrair códigos únicos dos pedidos
      const codigosPedidos = [
        ...new Set(pedidosData.map((p) => p.codigo_vendedor).filter(Boolean)),
      ] as string[];

      // Extrair códigos já associados
      const codigosAssociados = new Set(profilesData.map((p) => p.codigo_vendedor).filter(Boolean));

      // Filtrar apenas os códigos não associados
      const disponiveis = codigosPedidos.filter((codigo) => !codigosAssociados.has(codigo));

      return disponiveis.sort();
    },
  });
};

export const useInvalidateVendedores = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['vendedoresList'] });
    queryClient.invalidateQueries({ queryKey: ['codigosDisponiveis'] });
  };
};
