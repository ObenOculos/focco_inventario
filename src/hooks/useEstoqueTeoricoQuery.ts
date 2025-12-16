import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllInBatches } from '@/lib/supabaseUtils';

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
  const { data, error } = await supabase
    .rpc('comparar_estoque_teorico_vs_real', {
      p_codigo_vendedor: vendorCode,
    })
    .limit(10000);

  if (error) {
    console.error('Erro ao buscar comparação:', error);
    return [];
  }

  return (data || []) as ComparacaoItem[];
};

const fetchComparacaoInBatches = async (vendorCode: string): Promise<ComparacaoItem[]> => {
  const allData: ComparacaoItem[] = [];
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.rpc('comparar_estoque_teorico_vs_real_paginado', {
      p_codigo_vendedor: vendorCode,
      p_limit: batchSize,
      p_offset: offset,
    });

    if (error) {
      console.error(`Erro ao buscar comparação (offset ${offset}):`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData.push(...(data as ComparacaoItem[]));
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
};

const fetchAllComparacao = async (): Promise<ComparacaoItem[]> => {
  const profiles = await fetchAllInBatches<{ codigo_vendedor: string }>('profiles', {
    select: 'codigo_vendedor',
    filters: [
      { column: 'role', operator: 'eq', value: 'vendedor' },
      { column: 'codigo_vendedor', operator: 'not', inner_operator: 'is', value: null },
    ],
  });

  const vendorCodes = profiles
    .map((p) => p.codigo_vendedor)
    .filter((code): code is string => !!code);

  const results = await Promise.all(vendorCodes.map((code) => fetchComparacaoInBatches(code)));

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
        return fetchComparacaoInBatches(vendorCode);
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
      const data = await fetchAllInBatches<VendedorProfile>('profiles', {
        select: 'id, nome, codigo_vendedor',
        filters: [
          { column: 'role', operator: 'eq', value: 'vendedor' },
          { column: 'codigo_vendedor', operator: 'not', inner_operator: 'is', value: null },
        ],
      });

      return data;
    },
    enabled,
  });
};
