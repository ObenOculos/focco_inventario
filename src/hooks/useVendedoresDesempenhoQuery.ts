import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendedorDesempenho {
  codigo_vendedor: string;
  nome: string;
  email: string;
  ativo: boolean;
  estoque_total: number;
  total_remessas: number;
  total_vendas: number;
  ultimo_inventario: {
    id: string;
    data: string;
    status: 'pendente' | 'aprovado' | 'revisao';
    itens_contados: number;
    acuracidade?: number;
  } | null;
  dias_sem_inventario: number | null;
}

interface UseVendedoresDesempenhoOptions {
  periodoInicio?: Date;
  periodoFim?: Date;
}

export function useVendedoresDesempenhoQuery(options?: UseVendedoresDesempenhoOptions) {
  return useQuery({
    queryKey: [
      'vendedores-desempenho',
      options?.periodoInicio?.toISOString(),
      options?.periodoFim?.toISOString(),
    ],
    queryFn: async (): Promise<VendedorDesempenho[]> => {
      // 1. Buscar todos os vendedores
      const { data: vendedores, error: vendedoresError } = await supabase
        .from('profiles')
        .select('id, codigo_vendedor, nome, email, ativo')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null)
        .order('nome');

      if (vendedoresError) throw vendedoresError;
      if (!vendedores || vendedores.length === 0) return [];

      // 2. Buscar último inventário de cada vendedor
      const { data: inventarios, error: invError } = await supabase
        .from('inventarios')
        .select(
          `
          id,
          codigo_vendedor,
          data_inventario,
          status,
          itens_inventario (id)
        `
        )
        .order('data_inventario', { ascending: false });

      if (invError) throw invError;

      // Agrupar inventários por vendedor (pegar o mais recente)
      const ultimoInventarioPorVendedor = new Map<string, any>();
      inventarios?.forEach((inv) => {
        if (!ultimoInventarioPorVendedor.has(inv.codigo_vendedor)) {
          ultimoInventarioPorVendedor.set(inv.codigo_vendedor, inv);
        }
      });

      // 3. Para cada vendedor, buscar métricas
      const resultado: VendedorDesempenho[] = await Promise.all(
        vendedores.map(async (vendedor) => {
          const codigoVendedor = vendedor.codigo_vendedor!;

          // Buscar estoque teórico
          const { data: estoque } = await supabase
            .rpc('calcular_estoque_vendedor', {
              p_codigo_vendedor: codigoVendedor,
            })
            .limit(10000);

          const estoqueTotal =
            estoque?.reduce((sum: number, item: any) => sum + (item.estoque_teorico || 0), 0) || 0;

          // Buscar remessas e vendas no período
          const periodoInicio = options?.periodoInicio?.toISOString() || null;
          const periodoFim = options?.periodoFim?.toISOString() || null;

          const { data: entradas } = await supabase
            .rpc('get_entradas_pedidos', {
              p_codigo_vendedor: codigoVendedor,
              p_data_inicio: periodoInicio,
              p_data_fim: periodoFim,
            })
            .limit(10000);

          const { data: saidas } = await supabase
            .rpc('get_saidas_pedidos', {
              p_codigo_vendedor: codigoVendedor,
              p_data_inicio: periodoInicio,
              p_data_fim: periodoFim,
            })
            .limit(10000);

          const totalRemessas =
            entradas?.reduce((sum: number, item: any) => sum + (item.quantidade || 0), 0) || 0;
          const totalVendas =
            saidas?.reduce((sum: number, item: any) => sum + (item.quantidade || 0), 0) || 0;

          // Último inventário
          const ultimoInv = ultimoInventarioPorVendedor.get(codigoVendedor);
          let ultimoInventario = null;
          let diasSemInventario: number | null = null;

          if (ultimoInv) {
            const dataInv = new Date(ultimoInv.data_inventario);
            diasSemInventario = Math.floor(
              (Date.now() - dataInv.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Calcular acuracidade se aprovado
            let acuracidade: number | undefined;
            if (ultimoInv.status === 'aprovado') {
              // Função para buscar dados em lotes
              const fetchComparacaoInBatches = async (): Promise<any[]> => {
                const allData: any[] = [];
                let offset = 0;
                const batchSize = 500;
                let hasMore = true;

                while (hasMore) {
                  const { data, error } = await supabase.rpc('comparar_estoque_inventario_paginado', {
                    p_inventario_id: ultimoInv.id,
                    p_limit: batchSize,
                    p_offset: offset,
                  });

                  if (error) {
                    console.error(`Erro ao buscar comparação (offset ${offset}):`, error);
                    throw error;
                  }

                  if (data && data.length > 0) {
                    allData.push(...data);
                    offset += batchSize;
                    hasMore = data.length === batchSize;
                  } else {
                    hasMore = false;
                  }
                }

                return allData;
              };

              const comparacao = await fetchComparacaoInBatches();

              if (comparacao && comparacao.length > 0) {
                const itensCorretos = comparacao.filter(
                  (item: any) => item.divergencia === 0
                ).length;
                acuracidade = Math.round((itensCorretos / comparacao.length) * 100);
              }
            }

            ultimoInventario = {
              id: ultimoInv.id,
              data: ultimoInv.data_inventario,
              status: ultimoInv.status,
              itens_contados: ultimoInv.itens_inventario?.length || 0,
              acuracidade,
            };
          }

          return {
            codigo_vendedor: codigoVendedor,
            nome: vendedor.nome,
            email: vendedor.email,
            ativo: vendedor.ativo,
            estoque_total: estoqueTotal,
            total_remessas: totalRemessas,
            total_vendas: totalVendas,
            ultimo_inventario: ultimoInventario,
            dias_sem_inventario: diasSemInventario,
          };
        })
      );

      return resultado;
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
}
