import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ComparacaoItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  estoque_real: number;
  diferenca: number;
  data_atualizacao_real: string | null;
}

interface VendedorProfile {
  id: string;
  codigo_vendedor: string;
  nome: string;
}

const fetchComparacao = async (vendorCode: string): Promise<ComparacaoItem[]> => {
  const { data, error } = await supabase.rpc('comparar_estoque_teorico_vs_real', {
    p_codigo_vendedor: vendorCode
  });

  if (error) {
    console.error("Erro ao buscar comparação:", error);
    return [];
  }

  return (data || []) as ComparacaoItem[];
};

const fetchAllComparacao = async (): Promise<ComparacaoItem[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('codigo_vendedor')
    .eq('role', 'vendedor')
    .not('codigo_vendedor', 'is', null);

  if (error || !profiles) {
    console.error("Erro ao buscar vendedores:", error);
    return [];
  }

  const vendorCodes = profiles
    .map(p => p.codigo_vendedor)
    .filter((code): code is string => !!code);

  const results = await Promise.all(
    vendorCodes.map(code => fetchComparacao(code))
  );

  const consolidated = new Map<string, ComparacaoItem>();

  for (const vendorData of results) {
    for (const item of vendorData) {
      const existing = consolidated.get(item.codigo_auxiliar);
      if (existing) {
        existing.estoque_teorico += item.estoque_teorico;
        existing.estoque_real += item.estoque_real;
        existing.diferenca += item.diferenca;
      } else {
        consolidated.set(item.codigo_auxiliar, { ...item });
      }
    }
  }

  return Array.from(consolidated.values());
};

export const useEstoqueTeoricoQuery = (
  isGerente: boolean,
  selectedVendor: string,
  userVendorCode: string | null | undefined
) => {
  const vendorCode = isGerente ? selectedVendor : userVendorCode;

  return useQuery<ComparacaoItem[], Error>({
    queryKey: ['estoqueTeoricoComparacao', vendorCode],
    queryFn: async () => {
      if (isGerente && vendorCode === 'todos') {
        return fetchAllComparacao();
      } else if (vendorCode) {
        return fetchComparacao(vendorCode);
      }
      return [];
    },
    enabled: !!vendorCode || (isGerente && selectedVendor === 'todos'),
  });
};

export const useVendedoresQuery = (enabled: boolean) => {
  return useQuery<VendedorProfile[], Error>({
    queryKey: ['vendedoresProfiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      if (error) {
        console.error("Erro ao buscar vendedores:", error);
        return [];
      }

      return (data || []) as VendedorProfile[];
    },
    enabled,
  });
};
