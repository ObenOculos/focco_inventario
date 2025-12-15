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

export const useEstoqueRealStatsQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['estoque-real-stats', isGerente],
    queryFn: async () => {
      if (!isGerente) return null;

      // Buscar estatísticas de estoque real
      const { data: stats, error } = await supabase
        .from('estoque_real')
        .select(`
          codigo_vendedor,
          data_atualizacao,
          inventario_id
        `)
        .order('data_atualizacao', { ascending: false });

      if (error) throw error;

      // Agrupar por vendedor e pegar a data mais recente
      const vendedorStats = new Map<string, { ultima_atualizacao: string; total_itens: number }>();

      stats?.forEach(item => {
        const existing = vendedorStats.get(item.codigo_vendedor);
        if (!existing || new Date(item.data_atualizacao) > new Date(existing.ultima_atualizacao)) {
          // Contar quantos itens únicos este vendedor tem
          const itemCount = stats.filter(s => s.codigo_vendedor === item.codigo_vendedor).length;
          vendedorStats.set(item.codigo_vendedor, {
            ultima_atualizacao: item.data_atualizacao,
            total_itens: itemCount
          });
        }
      });

      // Calcular estatísticas
      const vendedoresComEstoqueReal = vendedorStats.size;
      const vendedoresAtualizadosRecentemente = Array.from(vendedorStats.values())
        .filter(stat => {
          const diffTime = Date.now() - new Date(stat.ultima_atualizacao).getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          return diffDays <= 7; // Últimos 7 dias
        }).length;

      return {
        vendedoresComEstoqueReal,
        vendedoresAtualizadosRecentemente,
        totalItensEstoqueReal: stats?.length || 0
      };
    },
    enabled: isGerente === true,
  });
};

interface StatusInventario {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventarios_pendentes: number;
  inventarios_aprovados: number;
  inventarios_revisao: number;
  ultimo_inventario: string | null;
}

export const useStatusInventariosQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['status-inventarios', isGerente],
    queryFn: async (): Promise<StatusInventario[]> => {
      // Buscar todos os inventários
      const { data: inventarios, error: invError } = await supabase
        .from('inventarios')
        .select('codigo_vendedor, status, data_inventario');

      if (invError) throw invError;

      // Buscar vendedores únicos
      const vendedorCodigos = [...new Set(inventarios?.map(i => i.codigo_vendedor) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .in('codigo_vendedor', vendedorCodigos);

      const nomeMap = new Map(profiles?.map(p => [p.codigo_vendedor, p.nome]) || []);

      // Agrupar por vendedor
      const statusMap = new Map<string, StatusInventario>();
      inventarios?.forEach(inv => {
        const current = statusMap.get(inv.codigo_vendedor) || {
          codigo_vendedor: inv.codigo_vendedor,
          nome_vendedor: nomeMap.get(inv.codigo_vendedor) || inv.codigo_vendedor,
          inventarios_pendentes: 0,
          inventarios_aprovados: 0,
          inventarios_revisao: 0,
          ultimo_inventario: null
        };

        if (inv.status === 'pendente') current.inventarios_pendentes++;
        if (inv.status === 'aprovado') current.inventarios_aprovados++;
        if (inv.status === 'revisao') current.inventarios_revisao++;

        // Atualizar último inventário
        if (!current.ultimo_inventario || new Date(inv.data_inventario) > new Date(current.ultimo_inventario)) {
          current.ultimo_inventario = inv.data_inventario;
        }
        statusMap.set(inv.codigo_vendedor, current);
      });

      // Ordenar por pendentes + revisão (prioridade) e depois por último inventário
      return Array.from(statusMap.values())
        .sort((a, b) => {
          const prioridadeA = a.inventarios_pendentes + a.inventarios_revisao;
          const prioridadeB = b.inventarios_pendentes + b.inventarios_revisao;
          if (prioridadeB !== prioridadeA) return prioridadeB - prioridadeA;
          if (!a.ultimo_inventario) return 1;
          if (!b.ultimo_inventario) return -1;
          return new Date(b.ultimo_inventario).getTime() - new Date(a.ultimo_inventario).getTime();
        })
        .slice(0, 5);
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
};

interface Divergencia {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string;
  data: string;
}

export const useDivergenciasQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['divergencias-revisao', isGerente],
    queryFn: async (): Promise<Divergencia[]> => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario')
        .eq('status', 'revisao')
        .order('data_inventario', { ascending: false })
        .limit(5);

      if (error) throw error;

      // Get vendedor names
      const vendedorCodigos = [...new Set(data?.map(d => d.codigo_vendedor) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .in('codigo_vendedor', vendedorCodigos);

      const nomeMap = new Map(profiles?.map(p => [p.codigo_vendedor, p.nome]) || []);

      return data?.map(d => ({
        codigo_vendedor: d.codigo_vendedor,
        nome_vendedor: nomeMap.get(d.codigo_vendedor) || d.codigo_vendedor,
        inventario_id: d.id,
        data: d.data_inventario
      })) || [];
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
};
