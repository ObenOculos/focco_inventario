import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Situação de inventário por vendedor.
 *
 * Saíram daqui, junto com o subsistema de estoque por pedidos: `estoque_total`
 * (calcular_estoque_vendedor), `total_remessas` / `total_vendas`
 * (get_entradas_pedidos / get_saidas_pedidos) e a `acuracidade` do último inventário
 * (comparar_estoque_inventario_paginado).
 *
 * Efeito colateral bem-vindo: a versão anterior fazia de três a quatro chamadas RPC por
 * vendedor dentro de um Promise.all, mais um fetch paginado da comparação. Agora são duas
 * queries no total, independente do número de vendedores.
 */
export interface VendedorDesempenho {
  codigo_vendedor: string;
  nome: string;
  email: string;
  ativo: boolean;
  ultimo_inventario: {
    id: string;
    data: string;
    status: 'pendente' | 'aprovado' | 'revisao';
    itens_contados: number;
  } | null;
  dias_sem_inventario: number | null;
}

export function useVendedoresDesempenhoQuery() {
  return useQuery({
    queryKey: ['vendedores-desempenho'],
    queryFn: async (): Promise<VendedorDesempenho[]> => {
      const { data: vendedores, error: vendedoresError } = await supabase
        .from('profiles')
        .select('id, codigo_vendedor, nome, email, ativo')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null)
        .order('nome');

      if (vendedoresError) throw vendedoresError;
      if (!vendedores || vendedores.length === 0) return [];

      const { data: inventarios, error: invError } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, status, itens_inventario (id)')
        .order('data_inventario', { ascending: false });

      if (invError) throw invError;

      // A ordenação por data decrescente garante que o primeiro visto é o mais recente
      const ultimoPorVendedor = new Map<string, (typeof inventarios)[number]>();
      inventarios?.forEach((inv) => {
        if (!ultimoPorVendedor.has(inv.codigo_vendedor)) {
          ultimoPorVendedor.set(inv.codigo_vendedor, inv);
        }
      });

      return vendedores.map((vendedor) => {
        const codigoVendedor = vendedor.codigo_vendedor as string;
        const ultimoInv = ultimoPorVendedor.get(codigoVendedor);

        let ultimo_inventario: VendedorDesempenho['ultimo_inventario'] = null;
        let dias_sem_inventario: number | null = null;

        if (ultimoInv) {
          const dataInv = new Date(ultimoInv.data_inventario);
          dias_sem_inventario = Math.floor(
            (Date.now() - dataInv.getTime()) / (1000 * 60 * 60 * 24)
          );
          ultimo_inventario = {
            id: ultimoInv.id,
            data: ultimoInv.data_inventario,
            status: ultimoInv.status as 'pendente' | 'aprovado' | 'revisao',
            itens_contados: ultimoInv.itens_inventario?.length ?? 0,
          };
        }

        return {
          codigo_vendedor: codigoVendedor,
          nome: vendedor.nome,
          email: vendedor.email,
          ativo: vendedor.ativo,
          ultimo_inventario,
          dias_sem_inventario,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
