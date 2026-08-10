import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Produto } from '@/types/app';
import { supabase } from '@/integrations/supabase/client';

/**
 * Filtros do catálogo. Todos são aplicados NO SERVIDOR, junto da paginação.
 *
 * O catálogo passou de 5.000 produtos com a sincronização do Ciclone: filtrar no
 * cliente exigiria baixar a tabela inteira a cada visita à tela, e a contagem
 * total deixaria de bater com o que o filtro mostra.
 */
export interface FiltrosProdutos {
  /** `todos` inclui os inativos; o padrão da tela é `ativos`. */
  situacao: 'ativos' | 'inativos' | 'todos';
  /** `manual` = nunca veio do Ciclone (`sincronizado_em` nulo). */
  origem: 'todas' | 'ciclone' | 'manual';
  /** Produtos sem preço: entram nas quantidades mas contam zero nos totais em R$. */
  somenteSemValor: boolean;
}

export const FILTROS_PRODUTOS_PADRAO: FiltrosProdutos = {
  situacao: 'ativos',
  origem: 'todas',
  somenteSemValor: false,
};

export const useProdutosQuery = (
  page: number,
  pageSize: number,
  searchTerm: string,
  filtros: FiltrosProdutos = FILTROS_PRODUTOS_PADRAO
) => {
  return useQuery<{ data: Produto[]; count: number }, Error>({
    queryKey: ['produtos', page, pageSize, searchTerm, filtros],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('produtos')
        .select('*', { count: 'exact' })
        .order('codigo_auxiliar', { ascending: true })
        .range(from, to);

      if (searchTerm) {
        query = query.or(
          `codigo_auxiliar.ilike.%${searchTerm}%,nome_produto.ilike.%${searchTerm}%`
        );
      }

      if (filtros.situacao !== 'todos') {
        query = query.eq('ativo', filtros.situacao === 'ativos');
      }

      if (filtros.origem === 'ciclone') {
        query = query.not('sincronizado_em', 'is', null);
      } else if (filtros.origem === 'manual') {
        query = query.is('sincronizado_em', null);
      }

      if (filtros.somenteSemValor) {
        // `null` e `0` são o mesmo caso para quem lê o catálogo: produto sem preço.
        query = query.or('valor_produto.is.null,valor_produto.eq.0');
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return { data: data || [], count: count || 0 };
    },
  });
};

export const useInvalidateProdutos = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['produtos'] });
};
