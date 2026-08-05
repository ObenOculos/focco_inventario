import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lista única de vendedores: dados cadastrais + situação de inventário.
 *
 * Substitui `useVendedoresListQuery` (Cadastro) e `useVendedoresDesempenhoQuery` (Painel),
 * que liam a MESMA linha de `profiles` por dois caches distintos. O invalidate do cadastro
 * só alcançava um deles, então criar, editar ou desativar um vendedor deixava a outra tela
 * exibindo o estado anterior por até 5 minutos. Com um cache só, o problema deixa de existir
 * por construção.
 *
 * Saíram junto com o subsistema de estoque por pedidos: `estoque_total`, `total_remessas`,
 * `total_vendas` e a `acuracidade` do último inventário.
 */
export interface Vendedor {
  id: string;
  /** Pode ser nulo: o campo é opcional no cadastro. Sem ele não há como casar inventário. */
  codigo_vendedor: string | null;
  nome: string;
  email: string;
  telefone: string | null;
  ativo: boolean;
  ultimo_inventario: {
    id: string;
    data: string;
    status: 'pendente' | 'aprovado' | 'revisao';
    itens_contados: number;
  } | null;
  dias_sem_inventario: number | null;
}

export const VENDEDORES_QUERY_KEY = ['vendedores'] as const;

export function useVendedoresQuery() {
  return useQuery({
    queryKey: VENDEDORES_QUERY_KEY,
    queryFn: async (): Promise<Vendedor[]> => {
      // Sem filtro por `codigo_vendedor`: o Painel antigo descartava quem não tinha código,
      // e como o campo é opcional no formulário, esses vendedores sumiam da única tela que
      // permitia corrigi-los. Agora aparecem, marcados como "sem código".
      const { data: vendedores, error: vendedoresError } = await supabase
        .from('profiles')
        .select('id, codigo_vendedor, nome, email, telefone, ativo')
        .eq('role', 'vendedor')
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
        const codigoVendedor = vendedor.codigo_vendedor;
        // Sem código não há chave para casar inventário — fica como "nunca inventariou",
        // que é literalmente verdade do ponto de vista do sistema.
        const ultimoInv = codigoVendedor ? ultimoPorVendedor.get(codigoVendedor) : undefined;

        let ultimo_inventario: Vendedor['ultimo_inventario'] = null;
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
          id: vendedor.id,
          codigo_vendedor: codigoVendedor,
          nome: vendedor.nome,
          email: vendedor.email,
          telefone: vendedor.telefone,
          ativo: vendedor.ativo,
          ultimo_inventario,
          dias_sem_inventario,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

export const useInvalidateVendedores = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: VENDEDORES_QUERY_KEY });
  };
};
