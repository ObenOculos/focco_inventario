import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
  profiles?: { nome: string };
  is_mais_recente?: boolean;
};

const BATCH_SIZE = 1000;

async function fetchAllItensInventario(inventarioIds: string[]) {
  if (inventarioIds.length === 0) return [];
  const all: Database['public']['Tables']['itens_inventario']['Row'][] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('itens_inventario')
      .select('*')
      .in('inventario_id', inventarioIds)
      .order('id', { ascending: true })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return all;
}

export const useInventariosPendentesQuery = (
  statusFilter: string = 'todos',
  vendedorFilter: string = 'todos'
) => {
  return useQuery<InventarioComItens[], Error>({
    queryKey: ['inventariosPendentes', statusFilter, vendedorFilter],
    queryFn: async () => {
      let query = supabase
        .from('inventarios')
        .select(`*, profiles!inventarios_user_id_fkey (nome)`)
        .order('created_at', { ascending: false });

      if (statusFilter === 'pendentes') {
        query = query.in('status', ['pendente', 'revisao'] as any);
      } else if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter as any);
      }

      if (vendedorFilter !== 'todos') {
        query = query.eq('codigo_vendedor', vendedorFilter);
      }

      const { data: invs, error } = await query;
      if (error) {
        console.error('Erro ao buscar inventários:', error);
        throw error;
      }

      const inventarios = (invs || []) as any[];
      const ids = inventarios.map((i) => i.id);
      const itens = await fetchAllItensInventario(ids);

      const byInv = new Map<string, Database['public']['Tables']['itens_inventario']['Row'][]>();
      for (const it of itens) {
        const arr = byInv.get(it.inventario_id) || [];
        arr.push(it);
        byInv.set(it.inventario_id, arr);
      }

      // Identify most-recent APPROVED inventory per vendedor
      const maisRecenteAprovadoPorVendedor = new Map<string, string>();
      for (const inv of inventarios) {
        if (inv.status !== 'aprovado') continue;
        const cur = maisRecenteAprovadoPorVendedor.get(inv.codigo_vendedor);
        if (!cur) {
          maisRecenteAprovadoPorVendedor.set(inv.codigo_vendedor, inv.id);
        } else {
          const curInv = inventarios.find((i) => i.id === cur);
          if (curInv && new Date(inv.data_inventario) > new Date(curInv.data_inventario)) {
            maisRecenteAprovadoPorVendedor.set(inv.codigo_vendedor, inv.id);
          }
        }
      }

      return inventarios.map((inv) => ({
        ...inv,
        itens_inventario: byInv.get(inv.id) || [],
        is_mais_recente:
          inv.status === 'aprovado' &&
          maisRecenteAprovadoPorVendedor.get(inv.codigo_vendedor) === inv.id,
      })) as InventarioComItens[];
    },
  });
};

export type { InventarioComItens };
