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
/**
 * Sentinelas dos seletores de categoria.
 *
 * `TODAS` é ausência de filtro. `SEM_CATEGORIA` é um filtro DE VERDADE — "produtos
 * sem esta categoria" — e não pode ser representado por string vazia nem por `null`,
 * que o Radix Select trata como "nada selecionado".
 */
export const TODAS_CATEGORIAS = '__todas__';
export const SEM_CATEGORIA = '__sem__';

/** As quatro dimensões vindas do Ciclone, na ordem em que a tela as apresenta. */
export const DIMENSOES = ['marca', 'tipo', 'subtipo', 'grupo'] as const;
export type Dimensao = (typeof DIMENSOES)[number];

export interface FiltrosProdutos {
  /** `todos` inclui os inativos; o padrão da tela é `ativos`. */
  situacao: 'ativos' | 'inativos' | 'todos';
  /** `manual` = nunca veio do Ciclone (`sincronizado_em` nulo). */
  origem: 'todas' | 'ciclone' | 'manual';
  /** Produtos sem preço: entram nas quantidades mas contam zero nos totais em R$. */
  somenteSemValor: boolean;
  /** Categorias do Ciclone. `TODAS_CATEGORIAS` em cada uma = sem recorte. */
  marca: string;
  tipo: string;
  subtipo: string;
  grupo: string;
}

export const FILTROS_PRODUTOS_PADRAO: FiltrosProdutos = {
  situacao: 'ativos',
  origem: 'todas',
  somenteSemValor: false,
  marca: TODAS_CATEGORIAS,
  tipo: TODAS_CATEGORIAS,
  subtipo: TODAS_CATEGORIAS,
  grupo: TODAS_CATEGORIAS,
};

/** Algum filtro difere do padrão da tela — decide o "Limpar filtros" e o estado vazio. */
export function temFiltroAtivo(filtros: FiltrosProdutos): boolean {
  return (
    filtros.situacao !== FILTROS_PRODUTOS_PADRAO.situacao ||
    filtros.origem !== FILTROS_PRODUTOS_PADRAO.origem ||
    filtros.somenteSemValor ||
    DIMENSOES.some((d) => filtros[d] !== TODAS_CATEGORIAS)
  );
}

/** Uma combinação de categorias existente no catálogo, com quantos produtos tem. */
export interface CombinacaoCategorias {
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
  total: number;
}

/**
 * As combinações de categoria que EXISTEM no catálogo.
 *
 * São ~17 linhas, então vêm inteiras e a tela cruza no cliente: escolher OBEN passa
 * a oferecer só os tipos que existem dentro de OBEN. Quatro listas independentes
 * ofereceriam recortes vazios, e o usuário só descobriria depois de aplicar.
 *
 * `staleTime` longo porque isto só muda quando o catálogo é sincronizado — e essa
 * operação já invalida a chave `produtos`.
 */
export const useCategoriasProdutosQuery = () =>
  useQuery<CombinacaoCategorias[], Error>({
    queryKey: ['produtos', 'categorias'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('categorias_produtos');
      if (error) throw error;
      return (data || []).map((c) => ({
        marca: c.marca,
        tipo: c.tipo,
        subtipo: c.subtipo,
        grupo: c.grupo,
        total: Number(c.total) || 0,
      }));
    },
    staleTime: 5 * 60_000,
  });

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

      // Categorias do Ciclone. `SEM_CATEGORIA` vira `IS NULL` em vez de igualdade:
      // é o recorte que encontra o cadastro incompleto, e comparar com a string
      // sentinela devolveria sempre zero.
      for (const dimensao of DIMENSOES) {
        const valor = filtros[dimensao];
        if (valor === TODAS_CATEGORIAS) continue;
        query =
          valor === SEM_CATEGORIA
            ? query.is(dimensao, null)
            : query.eq(dimensao, valor);
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
