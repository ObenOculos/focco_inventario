import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InventarioAguardando {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  status: 'pendente' | 'revisao';
  itens_contados: number;
  dias_esperando: number;
}

/**
 * Fila de conferência: inventários que precisam de ação do gerente.
 *
 * Substituiu `useInventariosEmRevisaoQuery`, que trazia só os `revisao`. A fila real inclui
 * os `pendente` — eram justamente os que apareciam como número no Dashboard sem que se
 * pudesse ver quais são.
 *
 * Ordenada do mais antigo para o mais recente: quem espera há mais tempo vem primeiro.
 */
export const useInventariosAguardandoQuery = (isGerente?: boolean) => {
  return useQuery({
    queryKey: ['inventarios-aguardando', isGerente],
    queryFn: async (): Promise<InventarioAguardando[]> => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, status, itens_inventario (id)')
        .in('status', ['pendente', 'revisao'])
        .order('data_inventario', { ascending: true });

      if (error) throw error;
      const lista = data || [];
      if (lista.length === 0) return [];

      const codigos = [...new Set(lista.map((i) => i.codigo_vendedor))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .in('codigo_vendedor', codigos);

      const nomeMap = new Map(profiles?.map((p) => [p.codigo_vendedor, p.nome]) || []);

      return lista.map((inv) => ({
        id: inv.id,
        codigo_vendedor: inv.codigo_vendedor,
        nome_vendedor: nomeMap.get(inv.codigo_vendedor) || inv.codigo_vendedor,
        data_inventario: inv.data_inventario,
        status: inv.status as 'pendente' | 'revisao',
        itens_contados: inv.itens_inventario?.length ?? 0,
        dias_esperando: Math.floor(
          (Date.now() - new Date(inv.data_inventario).getTime()) / (1000 * 60 * 60 * 24)
        ),
      }));
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000,
  });
};

export interface InventarioRecente {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  itens_contados: number;
}

/**
 * Últimos inventários aprovados — o "o que aconteceu" do Dashboard.
 *
 * Complementa a fila: a fila mostra o trabalho em aberto, isto mostra o que já saiu. Sem
 * ele a tela não dava nenhuma noção de movimento quando a fila estava vazia.
 */
export const useInventariosRecentesQuery = (isGerente?: boolean, limite = 5) => {
  return useQuery({
    queryKey: ['inventarios-recentes', isGerente, limite],
    queryFn: async (): Promise<InventarioRecente[]> => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, itens_inventario (id)')
        .eq('status', 'aprovado')
        .order('data_inventario', { ascending: false })
        .limit(limite);

      if (error) throw error;
      const lista = data || [];
      if (lista.length === 0) return [];

      const codigos = [...new Set(lista.map((i) => i.codigo_vendedor))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('codigo_vendedor, nome')
        .in('codigo_vendedor', codigos);

      const nomeMap = new Map(profiles?.map((p) => [p.codigo_vendedor, p.nome]) || []);

      return lista.map((inv) => ({
        id: inv.id,
        codigo_vendedor: inv.codigo_vendedor,
        nome_vendedor: nomeMap.get(inv.codigo_vendedor) || inv.codigo_vendedor,
        data_inventario: inv.data_inventario,
        itens_contados: inv.itens_inventario?.length ?? 0,
      }));
    },
    enabled: isGerente === true,
    staleTime: 5 * 60 * 1000,
  });
};
