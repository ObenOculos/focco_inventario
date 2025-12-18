import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Pedido {
  id: string;
  numero_pedido: string;
  data_emissao: string;
  codigo_vendedor: string;
  nome_vendedor: string | null;
  valor_total: number;
  codigo_tipo: number;
  situacao: string | null;
  numero_nota_fiscal: string | null;
  serie_nota_fiscal: string | null;
  codigo_cliente: string | null;
}

export interface ItemPedido {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
}

interface PedidosFilters {
  codigoVendedor?: string | null;
  isGerente?: boolean;
  tipoFilter?: string;
  vendedorFilter?: string;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

interface PedidosResult {
  data: Pedido[];
  totalCount: number;
  totalPages: number;
}

export const usePedidosPaginatedQuery = (filters: PedidosFilters) => {
  const {
    codigoVendedor,
    isGerente,
    tipoFilter = 'todos',
    vendedorFilter = 'todos',
    searchTerm = '',
    page = 1,
    pageSize = 20,
  } = filters;

  return useQuery({
    queryKey: [
      'pedidos-paginated',
      codigoVendedor,
      isGerente,
      tipoFilter,
      vendedorFilter,
      searchTerm,
      page,
      pageSize,
    ],
    queryFn: async (): Promise<PedidosResult> => {
      // Build base query for count
      let countQuery = supabase.from('pedidos').select('*', { count: 'exact', head: true });

      // Build base query for data
      let dataQuery = supabase
        .from('pedidos')
        .select(`
          *,
          itens_pedido (
            quantidade,
            valor_produto
          )
        `)
        .order('data_emissao', { ascending: false });

      // Apply vendedor filter based on role
      if (!isGerente && codigoVendedor) {
        countQuery = countQuery.eq('codigo_vendedor', codigoVendedor);
        dataQuery = dataQuery.eq('codigo_vendedor', codigoVendedor);
      }

      // Apply tipo filter
      if (tipoFilter !== 'todos') {
        countQuery = countQuery.eq('codigo_tipo', parseInt(tipoFilter));
        dataQuery = dataQuery.eq('codigo_tipo', parseInt(tipoFilter));
      }

      // Apply vendedor filter (for gerentes filtering by specific vendedor)
      if (vendedorFilter !== 'todos') {
        countQuery = countQuery.eq('codigo_vendedor', vendedorFilter);
        dataQuery = dataQuery.eq('codigo_vendedor', vendedorFilter);
      }

      // Apply search filter
      if (searchTerm) {
        const searchFilter = `numero_pedido.ilike.%${searchTerm}%,nome_vendedor.ilike.%${searchTerm}%,numero_nota_fiscal.ilike.%${searchTerm}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      // Get total count
      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      dataQuery = dataQuery.range(from, to);

      const { data, error } = await dataQuery;
      if (error) throw error;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      return {
        data: (data || []).map((pedido: any) => ({
          ...pedido,
          valor_total: pedido.itens_pedido?.reduce(
            (acc: number, item: any) => acc + Number(item.quantidade) * Number(item.valor_produto),
            0
          ) || pedido.valor_total,
        })) as Pedido[],
        totalCount,
        totalPages,
      };
    },
    enabled: !!codigoVendedor || isGerente === true,
  });
};

// Manter hook antigo para compatibilidade com outras páginas (busca limitada por vendedor)
export const usePedidosQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['pedidos', codigoVendedor, isGerente],
    queryFn: async () => {
      let query = supabase.from('pedidos').select('*').order('data_emissao', { ascending: false });

      // Para vendedores, busca apenas seus pedidos (limite natural)
      // Para gerentes, precisa de paginação - usar usePedidosPaginatedQuery
      if (!isGerente && codigoVendedor) {
        query = query.eq('codigo_vendedor', codigoVendedor);
      } else {
        // Limita a 1000 mais recentes para evitar sobrecarga
        query = query.limit(1000);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Pedido[];
    },
    enabled: !!codigoVendedor || isGerente === true,
  });
};

export const useVendedoresQuery = () => {
  return useQuery({
    queryKey: ['vendedores-pedidos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('codigo_vendedor, nome_vendedor')
        .not('nome_vendedor', 'is', null);

      if (error) throw error;

      const uniqueVendedores = Array.from(
        new Map(
          data?.map((p) => [
            p.codigo_vendedor,
            { codigo: p.codigo_vendedor, nome: p.nome_vendedor || p.codigo_vendedor },
          ])
        ).values()
      );
      return uniqueVendedores;
    },
  });
};

export const usePedidoDetalhesQuery = (pedidoId: string | null) => {
  return useQuery({
    queryKey: ['pedido-detalhes', pedidoId],
    queryFn: async () => {
      if (!pedidoId) return null;

      const { data: itens, error } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedidoId);

      if (error) throw error;
      return (itens || []) as ItemPedido[];
    },
    enabled: !!pedidoId,
  });
};
