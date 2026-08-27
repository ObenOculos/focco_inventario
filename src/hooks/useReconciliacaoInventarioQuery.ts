import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizarCodigoErp } from '@/lib/codigoErp';

/** Uma contagem candidata a servir de âncora, como o seletor a exibe. */
export interface InventarioAnterior {
  id: string;
  data_inventario: string;
  status: string;
  /** Quantos produtos distintos. É o que denuncia um fragmento: 24 itens ao lado de 380. */
  itens: number;
}

/**
 * A contagem que serve de ÂNCORA para o esperado: uma ou VÁRIAS somadas.
 *
 * Várias porque fragmentar a contagem é modo de trabalho válido aqui — o vendedor
 * envia a mala em dois ou três inventários do mesmo dia. Com uma âncora só, o esperado
 * compara um pedaço da mala com os movimentos do período inteiro e acusa divergência
 * em tudo que estava no outro pedaço.
 *
 * `quantidade_fisica` vem como está GRAVADA — corrigida, se o gerente já corrigiu. É
 * essa leitura que faz a correção manual fechar em definitivo: ver o aviso em
 * `janelaDeReconciliacao` sobre a nota emitida depois do envio físico.
 */
export interface InventarioAncora {
  /**
   * A data da MAIS RECENTE das contagens marcadas — é dela que a janela de movimentos
   * parte. Com fragmentos do mesmo dia, é o próprio dia; com contagens de dias
   * diferentes marcadas juntas, é a que fecha o período.
   */
  dataMaisRecente: string;
  /** Quantidade por código auxiliar NORMALIZADO — a mesma chave do gateway. */
  quantidadePorChave: Map<string, number>;
  /** Um código cru por chave, para exibir o item que só existe na âncora. */
  codigoPorChave: Map<string, string>;
}

/** Acima disso a lista vira histórico, não escolha. */
const LIMITE_ANTERIORES = 12;

/**
 * As contagens anteriores do vendedor, para o gerente escolher a âncora.
 *
 * O STATUS NÃO É FILTRADO. Filtrar por 'aprovado' parece mais seguro e é pior: numa
 * fila com duas contagens pendentes, a anterior aprovada pode estar dois períodos
 * atrás, e a janela cobriria dois períodos de movimento de uma vez sem dizer. O status
 * viaja na lista para quem lê decidir o quanto confia em cada uma.
 */
export function useInventariosAnterioresQuery(
  codigoVendedor: string | null,
  /**
   * `data_inventario` do inventário aberto — o TIMESTAMP inteiro, não o dia. Com o dia
   * só, o Postgres completa com meia-noite e a recontagem feita de manhã, no mesmo dia
   * da que está sendo conferida à tarde, some da lista.
   */
  momentoInventario: string | null,
  /** Fica parada até o gerente pedir a movimentação. */
  habilitado: boolean
) {
  return useQuery<InventarioAnterior[], Error>({
    queryKey: ['inventarios-anteriores', codigoVendedor, momentoInventario],
    enabled: habilitado && !!codigoVendedor && !!momentoInventario,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, data_inventario, status, itens_inventario(count)')
        .eq('codigo_vendedor', codigoVendedor!)
        .lt('data_inventario', momentoInventario!)
        .order('data_inventario', { ascending: false })
        .limit(LIMITE_ANTERIORES);
      if (error) throw error;

      // A contagem embutida do PostgREST chega como `[{ count: n }]`; os tipos
      // gerados não a descrevem, daí o cast.
      const lista = (data ?? []) as unknown as Array<{
        id: string;
        data_inventario: string;
        status: string;
        itens_inventario: { count: number }[] | null;
      }>;

      return lista.map((i) => ({
        id: i.id,
        data_inventario: i.data_inventario,
        status: i.status,
        itens: i.itens_inventario?.[0]?.count ?? 0,
      }));
    },
  });
}

const LOTE = 1000;

async function itensDosInventarios(ids: string[]) {
  const todos: { codigo_auxiliar: string; quantidade_fisica: number }[] = [];
  let de = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('itens_inventario')
      .select('codigo_auxiliar, quantidade_fisica')
      .in('inventario_id', ids)
      .order('id', { ascending: true })
      .range(de, de + LOTE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < LOTE) break;
    de += LOTE;
  }
  return todos;
}

/**
 * Os itens das contagens marcadas, somados numa âncora só.
 *
 * `ids` vazio devolve `null` — não é erro: é o gerente tendo desmarcado tudo, ou o
 * primeiro inventário do representante. A tela avisa em vez de fingir que a mala
 * nasceu vazia naquele dia.
 */
export function useAncoraQuery(
  anteriores: InventarioAnterior[],
  idsMarcados: string[],
  habilitado: boolean
) {
  // Ordenado para a chave de cache não mudar só porque o gerente marcou na outra
  // ordem — sem isso o react-query refaz a consulta a cada clique de caixa.
  const ids = [...idsMarcados].sort();

  return useQuery<InventarioAncora | null, Error>({
    queryKey: ['inventario-ancora', ids],
    enabled: habilitado && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const marcados = anteriores.filter((a) => ids.includes(a.id));
      if (marcados.length === 0) return null;

      const dataMaisRecente = marcados
        .map((m) => m.data_inventario)
        .sort()
        .at(-1)!;

      const itens = await itensDosInventarios(ids);
      const quantidadePorChave = new Map<string, number>();
      const codigoPorChave = new Map<string, string>();
      for (const i of itens) {
        const chave = normalizarCodigoErp(i.codigo_auxiliar);
        // SOMA, nunca sobrescreve. Dois motivos, ambos reais: fragmentos diferentes
        // podem conter o mesmo produto, e o mesmo produto pode ter entrado com duas
        // grafias que só a normalização junta (`OB1038 C02` e `OB1038 C2`).
        quantidadePorChave.set(
          chave,
          (quantidadePorChave.get(chave) ?? 0) + (Number(i.quantidade_fisica) || 0)
        );
        if (!codigoPorChave.has(chave)) codigoPorChave.set(chave, i.codigo_auxiliar);
      }

      return { dataMaisRecente, quantidadePorChave, codigoPorChave };
    },
  });
}
