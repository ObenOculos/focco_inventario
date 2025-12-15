import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type TableName = keyof Database['public']['Tables'];

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
  } = {},
  batchSize: number = 500
): Promise<T[]> {
  const { select = '*', orderBy, ascending = true } = options;
  
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
