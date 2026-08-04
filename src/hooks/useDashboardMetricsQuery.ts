import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vendedores ativos que não enviaram inventário nos últimos 60 dias.
 *
 * Este hook substituiu `useAcuracidadeMetricsQuery`, que calculava taxa de acuracidade e
 * valor de divergência a partir da comparação automática de inventários. Aquelas métricas
 * foram removidas por dois motivos:
 *
 *   1. A comparação automática comparava cada inventário aprovado consigo mesmo, então a
 *      divergência era sempre zero e a acuracidade sempre ~100% — a métrica não media nada.
 *   2. O valor de divergência multiplicava a quantidade por R$ 50 fixos ("assumindo valor
 *      médio de R$ 50 por item"), um número fabricado exibido como valor monetário.
 *
 * Com a comparação desacoplada do fluxo de aprovação, uma métrica automática de acuracidade
 * não faz mais sentido. O sinal de "vendedor sem inventário" não depende de comparação
 * nenhuma e continua útil, então é o que restou.
 */
export const useVendedoresSemInventarioQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['vendedores-sem-inventario', isGerente],
    queryFn: async (): Promise<{ vendedoresSemInventario60Dias: number }> => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: inventariosAprovados, error: invError } = await supabase
        .from('inventarios')
        .select('codigo_vendedor')
        .eq('status', 'aprovado')
        .gte('data_inventario', sixtyDaysAgo.toISOString());

      if (invError) throw invError;

      const comInventario = new Set(
        (inventariosAprovados || []).map((inv) => inv.codigo_vendedor)
      );

      const { data: vendedoresAtivos, error: vendError } = await supabase
        .from('profiles')
        .select('codigo_vendedor')
        .eq('role', 'vendedor')
        .eq('ativo', true)
        .not('codigo_vendedor', 'is', null);

      if (vendError) throw vendError;

      const vendedoresSemInventario60Dias = (vendedoresAtivos || []).filter(
        (v) => v.codigo_vendedor && !comInventario.has(v.codigo_vendedor)
      ).length;

      return { vendedoresSemInventario60Dias };
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000,
  });
};
