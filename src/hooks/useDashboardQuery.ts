import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';

export const useEstoqueQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['estoque', codigoVendedor, isGerente],
    queryFn: async () => {
      let query = supabase
        .from('itens_pedido')
        .select(`
          codigo_auxiliar,
          nome_produto,
          quantidade,
          pedidos!inner (
            codigo_vendedor,
            codigo_tipo
          )
        `)
        .range(0, 49999); // Aumenta limite para cálculo de estoque

      if (!isGerente && codigoVendedor) {
        query = query.eq('pedidos.codigo_vendedor', codigoVendedor);
      }

      const { data, error } = await query;
      if (error) throw error;

      const estoqueMap = new Map<string, EstoqueItem>();

      data?.forEach((item: any) => {
        const key = item.codigo_auxiliar;
        const existing = estoqueMap.get(key) || {
          codigo_auxiliar: item.codigo_auxiliar,
          nome_produto: item.nome_produto,
          modelo: item.codigo_auxiliar.split(' ')[0] || '',
          cor: item.codigo_auxiliar.split(' ')[1] || '',
          quantidade_remessa: 0,
          quantidade_venda: 0,
          estoque_teorico: 0,
        };

        const quantidade = Number(item.quantidade) || 0;
        const codigoTipo = item.pedidos?.codigo_tipo;

        if (codigoTipo === 7) {
          existing.quantidade_remessa += quantidade;
        } else if (codigoTipo === 2) {
          existing.quantidade_venda += quantidade;
        }

        existing.estoque_teorico = existing.quantidade_remessa - existing.quantidade_venda;
        estoqueMap.set(key, existing);
      });

      return Array.from(estoqueMap.values()).filter(e => e.estoque_teorico !== 0);
    },
    enabled: !!codigoVendedor || isGerente === true,
  });
};

export const useMovimentacaoResumoQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['movimentacao-resumo', codigoVendedor, isGerente],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let pedidosQuery = supabase
        .from('pedidos')
        .select('id, codigo_tipo, valor_total')
        .gte('data_emissao', thirtyDaysAgo.toISOString())
        .range(0, 9999);

      if (!isGerente && codigoVendedor) {
        pedidosQuery = pedidosQuery.eq('codigo_vendedor', codigoVendedor);
      }

      const { data: pedidos, error: pedidosError } = await pedidosQuery;
      if (pedidosError) throw pedidosError;

      const pedidoIds = pedidos?.map(p => p.id) || [];

      // Buscar itens em lotes para evitar limite
      let allItens: { pedido_id: string; quantidade: number }[] = [];
      const batchSize = 500;
      for (let i = 0; i < pedidoIds.length; i += batchSize) {
        const batch = pedidoIds.slice(i, i + batchSize);
        const { data: itens } = await supabase
          .from('itens_pedido')
          .select('pedido_id, quantidade')
          .in('pedido_id', batch)
          .range(0, 9999);
        allItens = allItens.concat(itens || []);
      }

      const itensPorPedido = new Map<string, number>();
      allItens.forEach(item => {
        const current = itensPorPedido.get(item.pedido_id) || 0;
        itensPorPedido.set(item.pedido_id, current + Number(item.quantidade));
      });

      let totalRemessas = 0, unidadesRemessa = 0, valorRemessa = 0;
      let totalVendas = 0, unidadesVenda = 0, valorVenda = 0;

      pedidos?.forEach(p => {
        const unidades = itensPorPedido.get(p.id) || 0;
        if (p.codigo_tipo === 7) {
          totalRemessas++;
          unidadesRemessa += unidades;
          valorRemessa += Number(p.valor_total);
        } else if (p.codigo_tipo === 2) {
          totalVendas++;
          unidadesVenda += unidades;
          valorVenda += Number(p.valor_total);
        }
      });

      return {
        totalRemessas,
        unidadesRemessa,
        valorRemessa,
        totalVendas,
        unidadesVenda,
        valorVenda,
      };
    },
    enabled: !!codigoVendedor || isGerente === true,
  });
};
