import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
interface EstoqueRealItem {
  codigo_auxiliar: string;
  quantidade_real: number;
  data_atualizacao: string | null;
  inventario_id: string | null;
}

interface ItemRetorno {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
}

interface NotaRetornoRequest {
  codigo_vendedor: string;
  itens: ItemRetorno[];
  observacoes?: string;
}

interface NotaRetornoResponse {
  message: string;
  numero_pedido: string;
  pedido_id: string;
  total_itens: number;
  total_unidades: number;
  valor_total: number;
}

/**
 * Hook para buscar o estoque real atual de um vendedor
 * Utiliza a função RPC get_estoque_real_vendedor que retorna apenas o registro mais recente por produto
 */
export function useEstoqueRealVendedorQuery(codigoVendedor: string | null) {
  return useQuery({
    queryKey: ['estoque-real-vendedor', codigoVendedor],
    queryFn: async () => {
      if (!codigoVendedor) return [];

      // Busca estoque real em lotes
      const allData: EstoqueRealItem[] = [];
      let offset = 0;
      const batchSize = 500;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase.rpc('get_estoque_real_vendedor', {
          p_codigo_vendedor: codigoVendedor,
        });

        if (error) {
          console.error('Erro ao buscar estoque real:', error);
          throw error;
        }

        if (data && data.length > 0) {
          allData.push(...(data as EstoqueRealItem[]));
          // get_estoque_real_vendedor não é paginada, então pegamos tudo de uma vez
          hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // Busca nomes dos produtos
      const codigosAuxiliares = allData.map((item) => item.codigo_auxiliar);

      if (codigosAuxiliares.length === 0) return [];

      // Busca produtos em lotes
      const produtosMap = new Map<string, { nome_produto: string; valor_produto: number; valor_remessa: number; codigo_produto: string }>();
      const produtoBatchSize = 500;

      for (let i = 0; i < codigosAuxiliares.length; i += produtoBatchSize) {
        const batch = codigosAuxiliares.slice(i, i + produtoBatchSize);
        const { data: produtos } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, nome_produto, valor_produto, valor_remessa, codigo_produto')
          .in('codigo_auxiliar', batch);

        if (produtos) {
          produtos.forEach((p) => {
            produtosMap.set(p.codigo_auxiliar, {
              nome_produto: p.nome_produto,
              valor_produto: p.valor_produto || 0,
              valor_remessa: p.valor_remessa || 0,
              codigo_produto: p.codigo_produto,
            });
          });
        }
      }

      // Combina dados
      return allData
        .filter((item) => item.quantidade_real > 0)
        .map((item) => {
          const produto = produtosMap.get(item.codigo_auxiliar);
          return {
            codigo_auxiliar: item.codigo_auxiliar,
            nome_produto: produto?.nome_produto || item.codigo_auxiliar,
            quantidade_atual: item.quantidade_real,
            quantidade_retorno: item.quantidade_real,
            valor_produto: produto?.valor_produto || 0,
            valor_remessa: produto?.valor_remessa || 0,
            codigo_produto: produto?.codigo_produto || '',
          };
        })
        .sort((a, b) => a.codigo_auxiliar.localeCompare(b.codigo_auxiliar));
    },
    enabled: !!codigoVendedor,
    staleTime: 2 * 60 * 1000, // 2 minutos
  });
}

/**
 * Hook para criar nota de retorno
 */
export function useGerarNotaRetornoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: NotaRetornoRequest) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Usuário não autenticado.');
      }

      const response = await supabase.functions.invoke<NotaRetornoResponse>('criar-nota-retorno', {
        body: request,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar nota de retorno.');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Nota de Retorno Criada!', {
        description: `Número: ${data?.numero_pedido} | ${data?.total_itens} itens | ${data?.total_unidades} unidades`,
      });
      // Invalida caches relacionados
      queryClient.invalidateQueries({ queryKey: ['estoque-real-vendedor'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['estoque-teorico'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar nota de retorno', {
        description: error.message,
      });
    },
  });
}

/**
 * Hook para gerar Nota de Retorno a partir de um inventário aprovado específico.
 * Monta os itens com base em itens_inventario (quantidade_fisica) + valor_produto da tabela produtos.
 */
export function useGerarNotaRetornoDeInventarioMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      inventario_id: string;
      codigo_vendedor: string;
      observacoes?: string;
      apenas_com_quantidade?: boolean;
    }) => {
      const { inventario_id, codigo_vendedor, observacoes, apenas_com_quantidade = true } = params;

      const itensInventario: { codigo_auxiliar: string; quantidade_fisica: number; nome_produto: string | null }[] = [];
      const BATCH = 1000;
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('itens_inventario')
          .select('codigo_auxiliar, quantidade_fisica, nome_produto')
          .eq('inventario_id', inventario_id)
          .order('id', { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        itensInventario.push(...data.map((d) => ({
          codigo_auxiliar: d.codigo_auxiliar,
          quantidade_fisica: Number(d.quantidade_fisica),
          nome_produto: d.nome_produto,
        })));
        if (data.length < BATCH) break;
        from += BATCH;
      }

      const agrupado = new Map<string, { quantidade: number; nome_produto: string | null }>();
      for (const it of itensInventario) {
        const cur = agrupado.get(it.codigo_auxiliar);
        if (cur) {
          cur.quantidade += it.quantidade_fisica;
        } else {
          agrupado.set(it.codigo_auxiliar, { quantidade: it.quantidade_fisica, nome_produto: it.nome_produto });
        }
      }

      const codigos = Array.from(agrupado.entries())
        .filter(([, v]) => (apenas_com_quantidade ? v.quantidade > 0 : true))
        .map(([k]) => k);

      if (codigos.length === 0) {
        throw new Error('Nenhum item com quantidade para retornar neste inventário.');
      }

      const produtosMap = new Map<string, { nome_produto: string; valor_produto: number }>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: produtos, error } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, nome_produto, valor_produto')
          .in('codigo_auxiliar', lote);
        if (error) throw error;
        produtos?.forEach((p) => {
          produtosMap.set(p.codigo_auxiliar, {
            nome_produto: p.nome_produto,
            valor_produto: p.valor_produto || 0,
          });
        });
      }

      const itens: ItemRetorno[] = codigos.map((codigo) => {
        const agg = agrupado.get(codigo)!;
        const prod = produtosMap.get(codigo);
        return {
          codigo_auxiliar: codigo,
          nome_produto: prod?.nome_produto || agg.nome_produto || codigo,
          quantidade: agg.quantidade,
          valor_produto: prod?.valor_produto || 0,
        };
      });

      const response = await supabase.functions.invoke<NotaRetornoResponse>('criar-nota-retorno', {
        body: { codigo_vendedor, itens, observacoes } as NotaRetornoRequest,
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao criar nota de retorno.');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Nota de Retorno Criada!', {
        description: `Número: ${data?.numero_pedido} | ${data?.total_itens} itens | ${data?.total_unidades} unidades`,
      });
      queryClient.invalidateQueries({ queryKey: ['estoque-real-vendedor'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      queryClient.invalidateQueries({ queryKey: ['estoque-teorico'] });
      queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar nota de retorno', {
        description: error.message,
      });
    },
  });
}
