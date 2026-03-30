import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface VendedorSimples {
  codigo_vendedor: string;
  nome: string;
}

export const useVendedoresSimpleQuery = (enabled: boolean) => {
  return useQuery<VendedorSimples[], Error>({
    queryKey: ['vendedoresSimples'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .eq('role', 'vendedor')
        .order('nome');

      if (error) {
        console.error('Erro ao buscar vendedores:', error);
        return [];
      }

      return (data || []).filter((v) => v.codigo_vendedor) as VendedorSimples[];
    },
    enabled,
  });
};

export type { VendedorSimples };
