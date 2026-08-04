import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InventarioOpcao {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  status: string;
}

export interface LinhaComparacao {
  codigo_auxiliar: string;
  nome_produto: string;
  /** `produtos.valor_produto`; 0 quando o produto contado não está cadastrado. */
  valor_unitario: number;
  quantidade_a: number;
  quantidade_b: number;
  diferenca: number;
  presente_em_a: boolean;
  presente_em_b: boolean;
}

/**
 * Lista leve de inventários para os seletores da comparação: sem carregar itens, que só
 * são necessários depois de escolhidos os dois lados.
 */
export function useInventariosOpcoesQuery() {
  return useQuery<InventarioOpcao[], Error>({
    queryKey: ['inventarios-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, status, profiles!inventarios_user_id_fkey(nome)')
        .order('data_inventario', { ascending: false });
      if (error) throw error;

      const lista = (data || []) as unknown as Array<{
        id: string;
        codigo_vendedor: string;
        data_inventario: string;
        status: string;
        profiles: { nome: string } | null;
      }>;

      return lista.map((inv) => ({
        id: inv.id,
        codigo_vendedor: inv.codigo_vendedor,
        nome_vendedor: inv.profiles?.nome || inv.codigo_vendedor,
        data_inventario: inv.data_inventario,
        status: inv.status,
      }));
    },
    staleTime: 60_000,
  });
}

const BATCH_SIZE = 500;

/**
 * Comparativo entre dois inventários escolhidos explicitamente.
 *
 * A RPC é paginada para não estourar o limite de linhas por request; aqui os lotes são
 * acumulados, porque a filtragem e a paginação da tela são feitas no cliente sobre o
 * conjunto inteiro.
 */
export function useComparacaoQuery(inventarioA: string | null, inventarioB: string | null) {
  return useQuery<LinhaComparacao[], Error>({
    queryKey: ['comparacao-inventarios', inventarioA, inventarioB],
    enabled: !!inventarioA && !!inventarioB && inventarioA !== inventarioB,
    queryFn: async () => {
      const todas: LinhaComparacao[] = [];
      let offset = 0;

      for (;;) {
        const { data, error } = await supabase.rpc('comparar_dois_inventarios', {
          p_inventario_a: inventarioA as string,
          p_inventario_b: inventarioB as string,
          p_limit: BATCH_SIZE,
          p_offset: offset,
        });
        if (error) throw error;
        if (!data || data.length === 0) break;

        todas.push(
          ...data.map((linha) => ({
            codigo_auxiliar: linha.codigo_auxiliar,
            nome_produto: linha.nome_produto,
            valor_unitario: Number(linha.valor_unitario) || 0,
            quantidade_a: Number(linha.quantidade_a) || 0,
            quantidade_b: Number(linha.quantidade_b) || 0,
            diferenca: Number(linha.diferenca) || 0,
            presente_em_a: linha.presente_em_a,
            presente_em_b: linha.presente_em_b,
          }))
        );

        if (data.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }

      return todas;
    },
  });
}
