import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ItemContado, ProdutoDoCatalogo } from '@/lib/reposicaoMala';

/**
 * As duas consultas locais da reposição da mala. O terceiro lado — o saldo da
 * empresa — vem do Ciclone por `useEstoqueInternoQuery`, que já existe no Panorama e
 * não é duplicado aqui.
 */

/** PostgREST limita a resposta a 1000 linhas; as duas consultas vêm em lotes. */
const LOTE = 1000;

/**
 * O catálogo inteiro no grão de grade — **ativos E inativos**, cada um marcado.
 *
 * Trazer os inativos não é desperdício, é o que separa duas perguntas que estavam
 * grudadas. "É óculos?" é presença no catálogo (o `/produtos` do gateway já filtra por
 * tipo de produto e pela regra do `eh_acessorio`); "dá para pedir?" é o `ativo`. Com o
 * catálogo só de ativos, uma cor inativada não era encontrada e caía como **"não é
 * óculos"** — e a caixa "Ocultar inativos" não tinha o que ocultar, porque a caixa "Só
 * óculos" já a tinha removido antes.
 *
 * O `ativo` do app reflete a situação da GRADE: o OB1190 pode estar ativo com a cor A02
 * inativada (ver `SQL_CATALOGO` no gateway).
 *
 * A ordenação existe para a paginação ser estável: sem `ORDER BY` o `OFFSET` anda
 * sobre uma ordem que o Postgres não garante entre execuções, e lotes vizinhos
 * passam a repetir e a pular linhas.
 */
export function useCatalogoDeGradesQuery(habilitado: boolean) {
  return useQuery<ProdutoDoCatalogo[], Error>({
    queryKey: ['produtos', 'grades-ativas'],
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const todos: ProdutoDoCatalogo[] = [];
      let inicio = 0;

      for (;;) {
        const { data, error } = await supabase
          .from('produtos')
          // Sem as colunas de categoria: elas vêm do próprio saldo do ERP, que é quem
          // manda no recorte da tela. Duas origens para a mesma marca dariam dois
          // grupos com o mesmo nome quando o catálogo estivesse defasado.
          .select(
            'codigo_auxiliar, modelo, cor, cor_nome, nome_produto, valor_produto, valor_remessa, ativo'
          )
          .order('codigo_auxiliar', { ascending: true })
          .range(inicio, inicio + LOTE - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        todos.push(...(data as ProdutoDoCatalogo[]));
        if (data.length < LOTE) break;
        inicio += LOTE;
      }

      return todos;
    },
  });
}

/** O que o inventário escolhido contou, em lotes. */
export function useItensContadosQuery(inventarioId: string | null) {
  return useQuery<ItemContado[], Error>({
    queryKey: ['itens-inventario', 'contados', inventarioId],
    enabled: !!inventarioId,
    staleTime: 60_000,
    queryFn: async () => {
      const todos: ItemContado[] = [];
      let inicio = 0;

      for (;;) {
        const { data, error } = await supabase
          .from('itens_inventario')
          .select('codigo_auxiliar, quantidade_fisica')
          .eq('inventario_id', inventarioId!)
          .order('id', { ascending: true })
          .range(inicio, inicio + LOTE - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        todos.push(
          ...data.map((d) => ({
            codigo_auxiliar: d.codigo_auxiliar,
            quantidade_fisica: Number(d.quantidade_fisica) || 0,
          }))
        );
        if (data.length < LOTE) break;
        inicio += LOTE;
      }

      return todos;
    },
  });
}
