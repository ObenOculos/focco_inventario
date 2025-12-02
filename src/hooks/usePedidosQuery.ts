import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Pedido {
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

interface ItemPedido {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
}

export const usePedidosQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['pedidos', codigoVendedor, isGerente],
    queryFn: async () => {
      let query = supabase
        .from('pedidos')
        .select('*')
        .order('data_emissao', { ascending: false })
        .range(0, 9999); // Aumenta o limite padrão de 1000

      if (!isGerente && codigoVendedor) {
        query = query.eq('codigo_vendedor', codigoVendedor);
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
        new Map(data?.map(p => [p.codigo_vendedor, { codigo: p.codigo_vendedor, nome: p.nome_vendedor || p.codigo_vendedor }])).values()
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
