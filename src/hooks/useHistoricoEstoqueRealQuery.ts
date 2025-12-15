import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface EstoqueRealItem {
  id: string;
  codigo_auxiliar: string;
  quantidade_real: number;
  data_atualizacao: string;
  inventario_id: string | null;
  codigo_vendedor: string;
}

interface HistoricoGroup {
  data_atualizacao: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string | null;
  itens: EstoqueRealItem[];
  total_itens: number;
  total_quantidade: number;
}

interface VendedorProfile {
  id: string;
  codigo_vendedor: string;
  nome: string;
}

export const useHistoricoEstoqueRealQuery = (
  isGerente: boolean,
  selectedVendor: string,
  userVendorCode: string | null | undefined,
  vendedores: VendedorProfile[]
) => {
  return useQuery<HistoricoGroup[], Error>({
    queryKey: ['historicoEstoqueReal', selectedVendor, userVendorCode, vendedores.length],
    queryFn: async () => {
      let query = supabase
        .from('estoque_real')
        .select('*')
        .order('data_atualizacao', { ascending: false })
        .order('codigo_auxiliar', { ascending: true });

      if (!isGerente && userVendorCode) {
        query = query.eq('codigo_vendedor', userVendorCode);
      } else if (isGerente && selectedVendor !== 'todos') {
        query = query.eq('codigo_vendedor', selectedVendor);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
      }

      // Group by data_atualizacao + codigo_vendedor
      const grouped = new Map<string, HistoricoGroup>();
      
      for (const item of (data || []) as EstoqueRealItem[]) {
        const key = `${item.data_atualizacao}_${item.codigo_vendedor}`;
        
        if (!grouped.has(key)) {
          const vendedor = vendedores.find(v => v.codigo_vendedor === item.codigo_vendedor);
          grouped.set(key, {
            data_atualizacao: item.data_atualizacao,
            codigo_vendedor: item.codigo_vendedor,
            nome_vendedor: vendedor?.nome || item.codigo_vendedor,
            inventario_id: item.inventario_id,
            itens: [],
            total_itens: 0,
            total_quantidade: 0,
          });
        }

        const group = grouped.get(key)!;
        group.itens.push(item);
        group.total_itens += 1;
        group.total_quantidade += item.quantidade_real;
      }

      return Array.from(grouped.values());
    },
    enabled: !!userVendorCode || isGerente,
  });
};
