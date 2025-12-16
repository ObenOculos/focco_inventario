import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type TableName = keyof Database['public']['Tables'];
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in';

interface SimpleFilter {
  column: string;
  operator: FilterOperator;
  value: any;
}

interface NotFilter {
  column: string;
  operator: 'not';
  inner_operator: FilterOperator;
  value: any;
}

type Filter = SimpleFilter | NotFilter;

/**
 * Busca todos os registros de uma tabela em lotes para contornar o limite de 1000 linhas do Supabase
 * @param tableName Nome da tabela
 * @param options Opções de query (select, order, filters)
 * @param batchSize Tamanho do lote (padrão: 500)
 */
export async function fetchAllInBatches<T>(
  tableName: TableName,
  options: {
    select?: string;
    orderBy?: string;
    ascending?: boolean;
    filters?: Filter[];
  } = {},
  batchSize: number = 500
): Promise<T[]> {
  const { select = '*', orderBy, ascending = true, filters = [] } = options;

  let allData: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select(select)
      .range(offset, offset + batchSize - 1);

    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }

    // Apply filters
    for (const filter of filters) {
      if (filter.operator === 'not') {
        const f = filter as NotFilter;
        query = query.not(f.column, f.inner_operator, f.value);
      } else {
        const f = filter as SimpleFilter;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        query = query[f.operator](f.column, f.value);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Erro ao buscar ${tableName} (offset ${offset}):`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...(data as T[])];
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}
