import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AcuracidadeMetrics {
  taxaAcuracidadeGeral: number;
  totalDivergencias: number;
  valorDivergencias: number;
  vendedoresBaixaAcuracidade: number;
  vendedoresSemInventario60Dias: number;
}

export const useAcuracidadeMetricsQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['acuracidade-metrics', isGerente],
    queryFn: async (): Promise<AcuracidadeMetrics> => {
      // Buscar inventários aprovados recentes (últimos 60 dias)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: inventariosAprovados } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario')
        .eq('status', 'aprovado')
        .gte('data_inventario', sixtyDaysAgo.toISOString())
        .order('data_inventario', { ascending: false });

      // Agrupar por vendedor, pegando apenas o mais recente
      const ultimoInventarioPorVendedor = new Map<string, string>();
      inventariosAprovados?.forEach((inv) => {
        if (!ultimoInventarioPorVendedor.has(inv.codigo_vendedor)) {
          ultimoInventarioPorVendedor.set(inv.codigo_vendedor, inv.id);
        }
      });

      // Calcular acuracidade por inventário
      let totalCorretos = 0;
      let totalItens = 0;
      let totalDivergencias = 0;
      let valorDivergencias = 0;
      const vendedoresAcuracidade = new Map<string, number>();

      for (const [codigoVendedor, inventarioId] of ultimoInventarioPorVendedor) {
        const { data: comparacao } = await supabase
          .rpc('comparar_estoque_inventario', {
            p_inventario_id: inventarioId,
          })
          .limit(10000);

        if (comparacao) {
          let corretos = 0;
          let total = 0;

          comparacao.forEach((item: { divergencia: number; estoque_teorico: number }) => {
            total++;
            if (item.divergencia === 0) {
              corretos++;
            } else {
              totalDivergencias++;
              // Estimar valor da divergência (assumindo valor médio de R$ 50 por item)
              valorDivergencias += Math.abs(item.divergencia) * 50;
            }
          });

          totalCorretos += corretos;
          totalItens += total;

          const acuracidade = total > 0 ? (corretos / total) * 100 : 0;
          vendedoresAcuracidade.set(codigoVendedor, acuracidade);
        }
      }

      // Buscar vendedores ativos
      const { data: vendedoresAtivos } = await supabase
        .from('profiles')
        .select('codigo_vendedor')
        .eq('role', 'vendedor')
        .eq('ativo', true)
        .not('codigo_vendedor', 'is', null);

      // Contar vendedores sem inventário nos últimos 60 dias
      const vendedoresComInventario = new Set(ultimoInventarioPorVendedor.keys());
      const vendedoresSemInventario60Dias = (vendedoresAtivos || []).filter(
        (v) => v.codigo_vendedor && !vendedoresComInventario.has(v.codigo_vendedor)
      ).length;

      // Contar vendedores com baixa acuracidade (< 85%)
      const vendedoresBaixaAcuracidade = Array.from(vendedoresAcuracidade.values()).filter(
        (acuracidade) => acuracidade < 85
      ).length;

      const taxaAcuracidadeGeral = totalItens > 0 ? (totalCorretos / totalItens) * 100 : 0;

      return {
        taxaAcuracidadeGeral,
        totalDivergencias,
        valorDivergencias,
        vendedoresBaixaAcuracidade,
        vendedoresSemInventario60Dias,
      };
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000,
  });
};
