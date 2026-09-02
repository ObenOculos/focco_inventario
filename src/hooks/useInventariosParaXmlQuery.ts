import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * A lista de inventários que serve de base para gerar XML.
 *
 * Mora fora das abas porque DUAS delas escolhem um inventário: "A partir de
 * Inventário" gera o XML do que foi contado, e "Reposição da mala" usa a contagem
 * como a foto do que o representante JÁ TEM. Duas cópias da consulta significariam
 * duas listas que divergem — uma trazendo um inventário que a outra não vê.
 */
export interface InventarioXml {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  status: string;
  total_unidades: number;
  total_produtos: number;
  valor_total: number;
}

/**
 * Lista todos os inventários com seus totais.
 * Lê apenas inventarios / itens_inventario / produtos — sem pedidos e sem estoque_real.
 */
export function useInventariosParaXmlQuery() {
  return useQuery({
    queryKey: ['inventarios-xml'],
    queryFn: async () => {
      const { data: invs, error } = await supabase
        .from('inventarios')
        .select(
          'id, codigo_vendedor, data_inventario, status, profiles!inventarios_user_id_fkey(nome)'
        )
        .order('data_inventario', { ascending: false });
      if (error) throw error;

      const lista = (invs || []) as unknown as Array<{
        id: string;
        codigo_vendedor: string;
        data_inventario: string;
        status: string;
        profiles: { nome: string } | null;
      }>;
      if (lista.length === 0) return [] as InventarioXml[];

      // Itens de todos os inventários, em lotes (limite de 1000 linhas por request)
      const ids = lista.map((i) => i.id);
      const itens: { inventario_id: string; codigo_auxiliar: string; quantidade_fisica: number }[] =
        [];
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += 50) {
        const lote = ids.slice(i, i + 50);
        let from = 0;

        while (true) {
          const { data, error: e } = await supabase
            .from('itens_inventario')
            .select('inventario_id, codigo_auxiliar, quantidade_fisica')
            .in('inventario_id', lote)
            .range(from, from + BATCH - 1);
          if (e) throw e;
          if (!data || data.length === 0) break;
          itens.push(
            ...data.map((d) => ({
              inventario_id: d.inventario_id,
              codigo_auxiliar: d.codigo_auxiliar,
              quantidade_fisica: Number(d.quantidade_fisica) || 0,
            }))
          );
          if (data.length < BATCH) break;
          from += BATCH;
        }
      }

      // Valores para compor o total exibido na lista
      const codigos = Array.from(new Set(itens.map((it) => it.codigo_auxiliar)));
      const valorMap = new Map<string, number>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, valor_produto')
          .in('codigo_auxiliar', lote);
        prods?.forEach((p) => valorMap.set(p.codigo_auxiliar, Number(p.valor_produto) || 0));
      }

      const agg = new Map<string, { unidades: number; produtos: Set<string>; valor: number }>();
      for (const it of itens) {
        if (it.quantidade_fisica <= 0) continue;
        const cur = agg.get(it.inventario_id) || {
          unidades: 0,
          produtos: new Set<string>(),
          valor: 0,
        };
        cur.unidades += it.quantidade_fisica;
        cur.produtos.add(it.codigo_auxiliar);
        cur.valor += it.quantidade_fisica * (valorMap.get(it.codigo_auxiliar) || 0);
        agg.set(it.inventario_id, cur);
      }

      return lista.map((inv) => {
        const a = agg.get(inv.id);
        return {
          id: inv.id,
          codigo_vendedor: inv.codigo_vendedor,
          // Achatado para que a busca do usePagination alcance o nome do vendedor
          nome_vendedor: inv.profiles?.nome || inv.codigo_vendedor,
          data_inventario: inv.data_inventario,
          status: inv.status,
          total_unidades: a?.unidades ?? 0,
          total_produtos: a?.produtos.size ?? 0,
          valor_total: a?.valor ?? 0,
        };
      });
    },
    staleTime: 60_000,
  });
}
