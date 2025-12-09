import { useQuery } from '@tanstack/react-query';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { EstoqueItem } from '@/types/app';

/**
 * Hook para buscar o estoque teórico de todos os produtos de um vendedor.
 * Os dados são retornados como um array de EstoqueItem.
 */
export const useEstoqueTeoricoPorVendedor = (codigoVendedor?: string | null) => {
  return useQuery<EstoqueItem[], Error>({
    queryKey: ['estoqueTeoricoPorVendedor', codigoVendedor],
    queryFn: async () => {
      if (!codigoVendedor) {
        return [];
      }
      
      const estoqueMap = await calcularEstoqueTeorico(codigoVendedor);
      
      // Converte o Map para um Array para facilitar a renderização
      const estoqueArray = Array.from(estoqueMap.values());
      
      // Retorna todos os produtos que já tiveram movimentação para o vendedor
      return estoqueArray;
    },
    enabled: !!codigoVendedor,
  });
};
