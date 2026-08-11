import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizarCodigoErp } from '@/lib/codigoErp';

export interface InventarioOpcao {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  status: string;
}

/**
 * Atributos de categoria do catálogo, vindos do Ciclone.
 *
 * `null` é resposta legítima e significa "não está no catálogo": produto contado com
 * código que ninguém cadastrou, ou resíduo do upload manual anterior à sincronização.
 * A leitura gerencial agrupa esses casos como "Sem categoria" — que é exatamente o
 * balde que precisa ser visto, não escondido atrás de um rótulo inventado.
 */
export interface AtributosProduto {
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
}

export interface LinhaComparacao extends AtributosProduto {
  codigo_auxiliar: string;
  nome_produto: string;
  /** `produtos.valor_produto`; 0 quando o produto contado não está cadastrado. */
  valor_unitario: number;
  quantidade_a: number;
  quantidade_b: number;
  diferenca: number;
  presente_em_a: boolean;
  presente_em_b: boolean;
}

/**
 * A linha como a tela a exibe, depois da reconciliação com o ERP.
 *
 * Mora aqui, e não na página, porque a leitura gerencial (`PainelGestor`) consome
 * exatamente esta forma — deixá-la na página faria o componente importar da tela que
 * o importa de volta.
 *
 * Sem reconciliação, `esperado` é a própria Qtd A.
 */
export type LinhaExibida = LinhaComparacao & {
  remessa: number;
  venda: number;
  esperado: number;
  /** Produto que só tem movimento no ERP: não foi contado em A nem em B. */
  so_movimento: boolean;
};

/**
 * Lista leve de inventários para os seletores da comparação: sem carregar itens, que só
 * são necessários depois de escolhidos os dois lados.
 */
export function useInventariosOpcoesQuery() {
  return useQuery<InventarioOpcao[], Error>({
    queryKey: ['inventarios-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, status, profiles!inventarios_user_id_fkey(nome)')
        .order('data_inventario', { ascending: false });
      if (error) throw error;

      const lista = (data || []) as unknown as Array<{
        id: string;
        codigo_vendedor: string;
        data_inventario: string;
        status: string;
        profiles: { nome: string } | null;
      }>;

      return lista.map((inv) => ({
        id: inv.id,
        codigo_vendedor: inv.codigo_vendedor,
        nome_vendedor: inv.profiles?.nome || inv.codigo_vendedor,
        data_inventario: inv.data_inventario,
        status: inv.status,
      }));
    },
    staleTime: 60_000,
  });
}

const BATCH_SIZE = 500;

/**
 * Comparativo entre dois inventários escolhidos explicitamente.
 *
 * `inventarioA` nulo é o modo **primeiro inventário**: não há contagem anterior, a RPC
 * devolve `quantidade_a = 0` em tudo, e o esperado passa a ser só `remessa − venda`. Não
 * há caminho de cálculo separado para isso — é a mesma fórmula com o primeiro termo zero.
 *
 * A RPC é paginada para não estourar o limite de linhas por request; aqui os lotes são
 * acumulados, porque a filtragem e a paginação da tela são feitas no cliente sobre o
 * conjunto inteiro.
 */
export function useComparacaoQuery(inventarioA: string | null, inventarioB: string | null) {
  return useQuery<LinhaComparacao[], Error>({
    queryKey: ['comparacao-inventarios', inventarioA, inventarioB],
    enabled: !!inventarioB && inventarioA !== inventarioB,
    queryFn: async () => {
      const todas: LinhaComparacao[] = [];
      let offset = 0;

      for (;;) {
        const { data, error } = await supabase.rpc('comparar_dois_inventarios', {
          // O tipo gerado exige `string` porque a assinatura da função não mudou — só o
          // corpo passou a aceitar nulo. O cast é o preço de não regerar os tipos.
          p_inventario_a: inventarioA as unknown as string,
          p_inventario_b: inventarioB as string,
          p_limit: BATCH_SIZE,
          p_offset: offset,
        });
        if (error) throw error;
        if (!data || data.length === 0) break;

        todas.push(
          ...data.map((linha) => ({
            codigo_auxiliar: linha.codigo_auxiliar,
            nome_produto: linha.nome_produto,
            valor_unitario: Number(linha.valor_unitario) || 0,
            quantidade_a: Number(linha.quantidade_a) || 0,
            quantidade_b: Number(linha.quantidade_b) || 0,
            diferenca: Number(linha.diferenca) || 0,
            presente_em_a: linha.presente_em_a,
            presente_em_b: linha.presente_em_b,
            // Os tipos gerados declaram os atributos como `string`: o Postgres não
            // expõe nulabilidade em RETURNS TABLE. Eles CHEGAM nulos para produto
            // fora do catálogo, e o `?? null` é o que impede um `undefined` de
            // vazar para o agrupamento da leitura gerencial.
            marca: linha.marca ?? null,
            tipo: linha.tipo ?? null,
            subtipo: linha.subtipo ?? null,
            grupo: linha.grupo ?? null,
          }))
        );

        if (data.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }

      return todas;
    },
  });
}

/**
 * Um `.in()` por lote. O código auxiliar viaja na URL do PostgREST, e a lista
 * inteira de uma vez estoura o limite de tamanho da requisição.
 */
const LOTE_CODIGOS = 200;

/** O que o catálogo sabe sobre um produto que só apareceu nos movimentos do ERP. */
export interface FichaProduto extends AtributosProduto {
  valor: number;
}

/**
 * Ficha de catálogo dos produtos que só têm movimento no ERP.
 *
 * `comparar_dois_inventarios` só devolve `valor_unitario` de produto CONTADO em A
 * ou em B — quem apareceu apenas nas remessas e vendas do período ficaria sem
 * preço, e uma linha sem preço vale R$ 0,00 nos cards de Falta e Sobra e afunda
 * na ordenação por impacto, que é exatamente onde ela precisa ser vista.
 *
 * Pela mesma razão a consulta traz os ATRIBUTOS junto: a RPC os anexa a partir do
 * mesmo `produtos`, e sem eles toda linha só-movimento cairia em "Sem categoria" na
 * leitura gerencial — dizendo que o cadastro está incompleto quando ele está inteiro.
 *
 * A fonte é o catálogo do app, sincronizado do Ciclone — a mesma origem que o
 * `comparativo.py` usa via `db.valores_por_produto`. É o que faz os dois
 * relatórios fecharem no valor, não só na quantidade.
 *
 * O mapa é indexado pelo código NORMALIZADO. A consulta vai pelo código cru
 * porque é o que está gravado em `produtos`, mas o encontro com a linha da tela
 * tem de acontecer na mesma chave que o resto da reconciliação usa.
 */
export function useFichasProdutosQuery(codigos: string[]) {
  return useQuery<Map<string, FichaProduto>, Error>({
    queryKey: ['fichas-produtos', codigos],
    enabled: codigos.length > 0,
    queryFn: async () => {
      const fichas = new Map<string, FichaProduto>();

      for (let i = 0; i < codigos.length; i += LOTE_CODIGOS) {
        const { data, error } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, valor_produto, marca, tipo, subtipo, grupo')
          .in('codigo_auxiliar', codigos.slice(i, i + LOTE_CODIGOS));
        if (error) throw error;

        for (const p of data || []) {
          const chave = normalizarCodigoErp(p.codigo_auxiliar);
          const valor = Number(p.valor_produto) || 0;
          // Mesmo desempate do `comparativo.py`: o mesmo código existe nas duas
          // empresas e fica o MAIOR valor de venda. Os atributos acompanham a linha
          // vencedora em vez de serem escolhidos à parte — as duas empresas
          // compartilham a grade, então categoria divergente entre elas seria erro
          // de cadastro, e misturar as duas origens esconderia isso.
          if (valor > (fichas.get(chave)?.valor ?? -1)) {
            fichas.set(chave, {
              valor,
              marca: p.marca ?? null,
              tipo: p.tipo ?? null,
              subtipo: p.subtipo ?? null,
              grupo: p.grupo ?? null,
            });
          }
        }
      }

      return fichas;
    },
    staleTime: 60_000,
  });
}
