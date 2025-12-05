import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/app';
import { calcularEstoqueTeorico } from '@/lib/estoque';

export const useEstoqueQuery = (codigoVendedor?: string | null, isGerente?: boolean) => {
  return useQuery({
    queryKey: ['estoque', codigoVendedor, isGerente],
    queryFn: async () => {
      // Vendedor específico: usar função SQL diretamente
      if (!isGerente && codigoVendedor) {
        const estoqueMap = await calcularEstoqueTeorico(codigoVendedor);
        return Array.from(estoqueMap.values()).filter(e => e.estoque_teorico !== 0);
      }

      // Gerente: buscar apenas vendedores cadastrados e consolidar
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      const allEstoque = new Map<string, EstoqueItem>();

      for (const p of profiles || []) {
        if (p.codigo_vendedor) {
          const vendedorEstoque = await calcularEstoqueTeorico(p.codigo_vendedor);
          
          // Consolidar estoques
          for (const [key, item] of vendedorEstoque) {
            const existing = allEstoque.get(key);
            if (existing) {
              existing.quantidade_remessa += item.quantidade_remessa;
              existing.quantidade_venda += item.quantidade_venda;
              existing.estoque_teorico += item.estoque_teorico;
            } else {
              allEstoque.set(key, { ...item });
            }
          }
        }
      }

      return Array.from(allEstoque.values()).filter(e => e.estoque_teorico !== 0);
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
