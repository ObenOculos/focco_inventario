import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  chamarErp,
  esperaEntreTentativas,
  repetirSeTransitorio,
  type ErroErp,
  type RespostaErp,
} from '@/lib/erpTransport';

/**
 * Consultas do Panorama — a lente gerencial sobre o Ciclone.
 *
 * A diferença para `useConsultaErpQuery` não é de tela, é de GRÃO: lá cada linha de
 * nota atravessa a rede e o browser agrega; aqui o `GROUP BY` é do Postgres e o que
 * chega já vem somado. É o que permite olhar um ano inteiro sem esbarrar no teto de
 * 20 mil linhas do gateway.
 *
 * Duas lentes, `saidas` e `entradas`, com a MESMA forma: as duas devolvem categoria,
 * medida e um nível de folha por produto. A simetria não é estética — é o que deixa
 * a máquina de drill-down ser uma só (`lib/panorama.ts`) em vez de duas parecidas.
 *
 * Cada lente tem duas consultas, e a divisão de trabalho entre elas é a espinha do
 * módulo:
 *
 *   - a de CATEGORIA traz o agregado UMA VEZ. Todo drill-down, filtro e série
 *     temporal acontecem sobre esse resultado, no cliente, sem custo.
 *   - a de PRODUTO só dispara quando o gestor chega na FOLHA da árvore, e leva o
 *     recorte junto. Trazer produto no agregado principal multiplicaria a resposta
 *     por milhares de SKUs para uma pergunta que quase nunca é feita.
 */

export type Lente = 'saidas' | 'entradas' | 'estoque' | 'comparativo';

/**
 * Os três estoques, e a distinção entre os dois últimos é o ponto:
 *
 *   - `interno`    — na empresa.
 *   - `externo`    — a MALA, pelo saldo que o ERP calcula.
 *   - `inventario` — a MESMA mala, pelo que o representante contou.
 *
 * Externo e inventário descrevem a mesma mercadoria por dois caminhos. A divergência
 * entre eles é informação — é o que a lente comparativa existe para mostrar.
 */
export type LenteEstoque = 'interno' | 'externo' | 'inventario';

/**
 * A visão efetiva — lente e, quando é estoque, qual dos dois.
 *
 * Existe porque os EIXOS e a ordem de leitura dependem dos dois juntos: "Vendedor"
 * só faz sentido no externo, "Situação do cadastro" só no interno.
 */
export type Visao =
  | 'saidas'
  | 'entradas'
  | 'estoque-interno'
  | 'estoque-externo'
  | 'estoque-inventario'
  | 'comparativo';

/**
 * O que as duas lentes têm em comum.
 *
 * As categorias vêm como **string vazia** quando o Ciclone não tem o atributo
 * cadastrado — nunca `null`. Quem traduz para "Sem categoria" é
 * `categoriasProduto.ts`, que já é a definição única disso no app.
 */
interface BasePanorama {
  marca: string;
  tipo: string;
  subtipo: string;
  grupo: string;
  quantidade: number;
  valor: number;
  /**
   * Quantas linhas de origem entraram na soma. No fluxo são linhas de nota — é o que
   * denuncia um agregado inflado; no estoque são produtos. O nome é o mesmo para a
   * máquina de agregação continuar valendo; quem rotula é a tela.
   */
  linhas: number;
}

/**
 * O que só existe em documento fiscal.
 *
 * Saiu do comum quando o estoque entrou: saldo não tem CFOP nem operação, e exigir
 * esses campos obrigaria a inventar `null`s que nada consome.
 */
interface DimensoesFiscais {
  empresa: number;
  operacao_cod: number | null;
  operacao_desc: string | null;
  cfop: string | number | null;
  cfop_desc: string | null;
}

/** Onde a saída foi parar, na linguagem de `regras.py`. */
interface DimensoesSaida {
  /** Código do tipo de pedido no Ciclone (2 = venda mala, 7 = remessa, 14 = CORE…). */
  tipo_pedido_cod: number | null;
  tipo_pedido_desc: string | null;
  /** `'VENDA'`, `'REMESSA'`, `'BONIFICAÇÃO/BRINDE'`… — derivado do CFOP. */
  classif_operacao: string | null;
  classif_pedido: string | null;
}

/** De onde a entrada veio. */
interface DimensoesEntrada {
  fornecedor_cod: number | null;
  /**
   * ⚠️ **Nem sempre é um fornecedor.** Em `RETORNO DE REMESSA` o remetente é o
   * próprio representante devolvendo o que sobrou da mala — em 2026, cinco dos treze
   * remetentes eram vendedores. Quem separa os dois casos é `classif_entrada`, nunca
   * o nome.
   */
  fornecedor: string;
  uf: string;
  /** `'COMPRA'`, `'RETORNO DE REMESSA'`, `'DEVOLUCAO DE VENDA'`… */
  classif_entrada: string | null;
}

/**
 * Custo, e o quanto se pode confiar nele.
 *
 * ⚠️ **Não existe custo histórico no Ciclone.** A nota fiscal não guarda o custo da
 * mercadoria; o único custo que existe é o do CADASTRO DE HOJE (custo direto +
 * indireto, por empresa + filial + modelo). Então o custo de uma saída de março é
 * `quantidade de março × custo de hoje` — se o produto foi reprecificado desde então,
 * a margem daquele mês se move junto. A tela precisa dizer isso ao gestor.
 *
 * `quantidade_sem_custo` existe por causa da DIREÇÃO do erro. Produto sem cadastro na
 * filial entra com custo zero, e custo faltando não derruba a margem: ela **infla**.
 * Sem este campo a tela exibiria "82% de margem" com a mesma cara de certeza de um
 * número correto. Com ele, dá para dizer sobre quantas unidades a conta se apoia.
 */
interface MedidasCusto {
  /** `quantidade × custo unitário`. Nas saídas é o CMV; no estoque, o imobilizado. */
  custo: number;
  /** Unidades cujo produto não tem custo cadastrado. Só nas saídas. */
  quantidade_sem_custo: number;
}

/** Identidade do produto, presente só no nível de folha. */
interface DimensoesProduto {
  codigo_auxiliar: string;
  codigo_produto: string | number | null;
  cor: string | number | null;
  nome_produto: string | null;
}

/** ISO-8601, sempre o dia 1º — é `date_trunc('month', …)`. */
interface ComMes {
  mes: string;
}

export type SaidaCategoria = BasePanorama &
  DimensoesFiscais &
  DimensoesSaida &
  MedidasCusto &
  ComMes;
export type SaidaProduto = BasePanorama &
  DimensoesFiscais &
  DimensoesSaida &
  MedidasCusto &
  DimensoesProduto;
export type EntradaCategoria = BasePanorama & DimensoesFiscais & DimensoesEntrada & ComMes;
export type EntradaProduto = BasePanorama & DimensoesFiscais & DimensoesEntrada & DimensoesProduto;

/**
 * Saldo da empresa no Ciclone, em dois grãos.
 *
 * `nivel: 'modelo'` (padrão) agrega por empresa + filial + produto genérico;
 * `nivel: 'produto'` desce ao **código auxiliar com cor**. Os dois somam o mesmo
 * total — medido na empresa 2: 56.069 un e R$ 2.706.009,54 nos dois, com 765 de 765
 * chaves batendo exatamente.
 *
 * ⚠️ **Correção de 2026-09-02.** Este tipo afirmava que o saldo por grade não existia
 * fora do aplicativo do Ciclone, e por isso o interno pararia no modelo enquanto o
 * externo desce ao código auxiliar. Era falso: `eqpee_estoque` é coluna real. O `cast`
 * com marcador de macro que sustentava a ideia vive só num relatório, onde é convenção
 * do construtor de relatórios. **Interno e externo descem ao mesmo grão** — ver o
 * cabeçalho do bloco de estoque em `erp-gateway/panorama.py`, que traz a medição.
 */
export interface EstoqueInterno extends BasePanorama {
  empresa: number;
  filial: number;
  // Mesmo tipo do `codigo_produto` das lentes de fluxo: `eqpdg_codigo` é texto no
  // Ciclone ('ESTOJO PW'), mas o pandas promove a coluna a número quando todos os
  // valores do recorte são numéricos. Declarar os dois igual é o que deixa a folha
  // tratar produto sem saber de qual lente ele veio.
  codigo_produto: string | number | null;
  nome_produto: string | null;
  /**
   * `'A'` / `'I'`. No nível de produto vem da GRADE quando ela tem situação própria —
   * o modelo pode estar ativo com uma cor já inativada, e é a cor que decide se dá
   * para pedir. Produto inativo COM saldo é achado, não erro.
   */
  situacao: string | null;
  disponivel: number;
  saida_pendente: number;
  /** Custo direto + indireto do ERP. `valor` é a preço de tabela. */
  custo: number;
  /** Só em `nivel: 'produto'`. Já na grafia do catálogo: `OB1107 C2`. */
  codigo_auxiliar?: string;
  /** Só em `nivel: 'produto'`. `'COR'` é a sentinela dos itens sem cor (estojo, flanela). */
  cor?: string | number | null;
  /**
   * Só em `nivel: 'produto'`. Mercadoria NOSSA em poder de terceiros, nesta grade.
   *
   * Vem junto do saldo interno porque sozinho ele engana: "a empresa não tem esta cor"
   * é verdade sobre o armazém e falso sobre a operação. Não substitui o
   * `/estoque-externo` — lá a quebra é por terceiro, aqui é o total da grade.
   */
  em_terceiro?: number;
}

/**
 * A mala pelo saldo do ERP — mercadoria nossa em poder de terceiros.
 *
 * Grão melhor que o do interno: tem terceiro E cor, porque
 * `eq_produtoespecifestoqterceiro` guarda as duas. É o par do `EstoqueInventariado`.
 */
export interface EstoqueExterno extends BasePanorama {
  empresa: number;
  terceiro_cod: number | null;
  terceiro: string;
  uf: string;
  /** Custo direto + indireto do ERP, do mesmo cadastro que dá o preço de tabela. */
  custo: number;
  /** Só no nível de produto. */
  codigo_auxiliar?: string;
  codigo_produto?: string | number | null;
  cor?: string | number | null;
  nome_produto?: string | null;
}

/**
 * A MESMA mala, pelo que o representante CONTOU — último inventário aprovado.
 *
 * ⚠️ **Não é saldo ao vivo.** Cada vendedor tem uma data de contagem diferente, então
 * o total mistura fotos de momentos distintos; e a última contagem pode ser um
 * fragmento, porque inventários do mesmo dia são parciais. `data_inventario` viaja em
 * toda linha justamente para a tela poder dizer isso.
 */
export interface EstoqueInventariado extends BasePanorama {
  codigo_vendedor: string;
  nome_vendedor: string | null;
  inventario_id: string;
  /** ISO-8601 da contagem que originou esta linha. */
  data_inventario: string;
  codigo_auxiliar: string;
  codigo_produto: string | number | null;
  nome_produto: string | null;
  // `string | number` como nas lentes de fluxo: a cor é texto ('A02'), mas há
  // cadastros puramente numéricos, e os tipos precisam coincidir para `LinhaPanorama`
  // conseguir intersectar as quatro origens.
  cor: string | number | null;
}

/**
 * A linha como a MAQUINARIA de drill-down a enxerga.
 *
 * O comum é obrigatório; tudo que é de uma lente só é opcional. Não é preguiça de
 * tipar: `agrupar`, `filtrarPeloCaminho` e `somar` são genuinamente indiferentes à
 * lente, e uma união discriminada os obrigaria a estreitar o tipo em toda passagem
 * para ler um campo que o eixo já sabe que existe. As telas continuam recebendo os
 * tipos exatos (`SaidaCategoria`, `EntradaProduto`…) das consultas.
 */
export type LinhaPanorama = BasePanorama &
  Partial<
    DimensoesFiscais &
      DimensoesSaida &
      DimensoesEntrada &
      DimensoesProduto &
      ComMes &
      Omit<EstoqueInterno, keyof BasePanorama> &
      Omit<EstoqueExterno, keyof BasePanorama> &
      MedidasCusto &
      Omit<EstoqueInventariado, keyof BasePanorama>
  >;

/** Recorte do drill-down, repassado ao gateway quando se pede a folha. */
export interface RecortePanorama {
  marcas?: string[];
  tipos?: string[];
  subtipos?: string[];
  grupos?: string[];
  operacoes?: number[];
  cfops?: (string | number)[];
  /** Só na lente de saídas. */
  tipos_pedido?: number[];
  /** Só na lente de entradas. */
  fornecedores?: number[];
}

export interface ParametrosPanorama extends RecortePanorama {
  de: string;
  ate: string;
  /** Empresas (filiais). Omitido = as duas, pelo padrão do gateway. */
  empresas?: number[];
  base_data?: 'movimento' | 'emissao';
  /**
   * Canceladas ficam FORA por padrão — ao contrário do `/pedidos`, que as devolve
   * porque a auditoria precisa vê-las. Aqui o total é o número que o gestor confere
   * contra o ERP, e documento anulado só o infla.
   */
  incluir_canceladas?: boolean;
  /**
   * Só entradas. ⚠️ **Ligar isto DOBRA a compra.** Toda compra entra no Ciclone como
   * duas notas de mesmo número: uma com código genérico que não movimenta estoque e
   * outra com o SKU real. Existe para conferência fiscal, não para leitura gerencial.
   */
  incluir_sem_movimento?: boolean;
}

/** A consulta custa segundos de VPN; não vale repetir a cada foco de janela. */
const TEMPO_FRESCO = 10 * 60 * 1000;

// Prefixo `use` obrigatório: é assim que o lint reconhece um hook e valida as
// regras dos hooks dentro dele.
function usePanoramaLente<T>(
  lente: Lente,
  nivel: 'categoria' | 'produto',
  parametros: ParametrosPanorama | null
) {
  return useQuery<T[], ErroErp>({
    queryKey: ['erp', 'panorama', lente, nivel, parametros],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<T>>(lente, {
        ...parametros,
        nivel,
        base_data: parametros?.base_data ?? 'movimento',
      });
      return r.dados;
    },
    // `parametros` nulo mantém a consulta parada — é assim que a tela só vai ao ERP
    // quando o usuário pede, e não a cada ajuste de filtro.
    enabled: parametros !== null,
    staleTime: TEMPO_FRESCO,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}

export const useSaidasQuery = (p: ParametrosPanorama | null) =>
  usePanoramaLente<SaidaCategoria>('saidas', 'categoria', p);

export const useSaidasProdutoQuery = (p: ParametrosPanorama | null) =>
  usePanoramaLente<SaidaProduto>('saidas', 'produto', p);

export const useEntradasQuery = (p: ParametrosPanorama | null) =>
  usePanoramaLente<EntradaCategoria>('entradas', 'categoria', p);

export const useEntradasProdutoQuery = (p: ParametrosPanorama | null) =>
  usePanoramaLente<EntradaProduto>('entradas', 'produto', p);

/** O que os dois estoques do ERP têm em comum. O `nivel` fica fora: o vocabulário difere. */
export interface ParametrosEstoque {
  empresas?: number[];
  /** Cadastros sem saldo. Dobram a resposta e não dizem nada sobre o estoque de hoje. */
  incluir_zerados?: boolean;
}

export interface ParametrosEstoqueInterno extends ParametrosEstoque {
  /**
   * `'modelo'` (padrão) ou `'produto'`. Não é `'categoria'` como no estoque externo:
   * aqui o nível de entrada é um cadastro por modelo, não uma categoria — e foi
   * justamente um nome errado que sustentou a ideia de que a cor não existia.
   */
  nivel?: 'modelo' | 'produto';
}

/**
 * Saldo interno, do Ciclone. **Sem período** — é foto, não fluxo.
 *
 * No nível `modelo` são ~1.800 linhas; no `produto`, ~4.000. As duas cabem numa
 * viagem só e o cliente agrega os níveis de categoria localmente — bem longe das
 * 16.500 linhas do estoque externo por SKU, que foi o que obrigou aquela lente a
 * separar os níveis por peso.
 */
export function useEstoqueInternoQuery(parametros: ParametrosEstoqueInterno | null) {
  return useQuery<EstoqueInterno[], ErroErp>({
    queryKey: ['erp', 'panorama', 'estoque-interno', parametros],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<EstoqueInterno>>('estoque', {
        ...parametros,
        nivel: parametros?.nivel ?? 'modelo',
      });
      return r.dados;
    },
    enabled: parametros !== null,
    staleTime: TEMPO_FRESCO,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}

/** PostgREST limita a resposta a 1000 linhas; a contagem vem em lotes desse tamanho. */
const LOTE_INVENTARIADO = 1000;

/**
 * Estoque inventariado — não passa pelo ERP: sai da RPC `estoque_inventariado` no
 * Supabase, sobre os inventários que os vendedores contaram.
 *
 * Por isso não usa `chamarErp` nem a política de repetição do gateway: aqui não há
 * VPN nem túnel no caminho, e um 503 significaria outra coisa.
 *
 * ⚠️ **Vem PAGINADA, e isso não é otimização.** A RPC devolve uma linha por
 * (vendedor × código auxiliar) de TODOS os representantes de uma vez — passa de mil
 * linhas com facilidade. Sem os lotes, o PostgREST cortava a resposta em 1000 e a
 * tela somava uma contagem truncada sem avisar nada: o vendedor que ficasse na
 * fronteira do corte aparecia com uma fração dos produtos dele (medido em produção:
 * 165 de 706), e os seguintes sumiam por completo. É o pior tipo de erro, porque o
 * número continua plausível.
 *
 * A ordenação existe para a paginação ser estável: sem `ORDER BY`, o `OFFSET` do
 * PostgREST anda sobre uma ordem que o Postgres não garante entre duas execuções, e
 * lotes vizinhos passam a repetir e a pular linhas.
 */
export function useEstoqueInventariadoQuery(habilitado: boolean) {
  return useQuery<EstoqueInventariado[], Error>({
    queryKey: ['panorama', 'estoque-inventariado'],
    queryFn: async () => {
      const todos: EstoqueInventariado[] = [];
      let inicio = 0;

      for (;;) {
        const { data, error } = await supabase
          .rpc('estoque_inventariado')
          .order('codigo_vendedor', { ascending: true })
          .order('codigo_auxiliar', { ascending: true })
          .order('codigo_produto', { ascending: true })
          .range(inicio, inicio + LOTE_INVENTARIADO - 1);

        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;

        // `linhas` não vem da RPC: lá cada linha JÁ é um produto. O 1 existe para a
        // máquina de agregação, que soma este campo para dizer "N produtos".
        todos.push(...data.map((l) => ({ ...l, linhas: 1 }) as EstoqueInventariado));

        if (data.length < LOTE_INVENTARIADO) break;
        inicio += LOTE_INVENTARIADO;
      }

      return todos;
    },
    enabled: habilitado,
    staleTime: TEMPO_FRESCO,
  });
}

export interface ParametrosEstoqueExterno extends ParametrosEstoque {
  nivel?: 'categoria' | 'produto';
  marcas?: string[];
  tipos?: string[];
  subtipos?: string[];
  grupos?: string[];
  terceiros?: number[];
}

/**
 * A mala pelo ERP. Dois níveis, como as lentes de fluxo — terceiro × SKU são 16.500
 * linhas (5 MB), grande demais para uma resposta de entrada; por categoria são 399.
 */
export function useEstoqueExternoQuery(parametros: ParametrosEstoqueExterno | null) {
  return useQuery<EstoqueExterno[], ErroErp>({
    queryKey: ['erp', 'panorama', 'estoque-externo', parametros],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<EstoqueExterno>>('estoque-externo', {
        ...parametros,
        nivel: parametros?.nivel ?? 'categoria',
      });
      return r.dados;
    },
    enabled: parametros !== null,
    staleTime: TEMPO_FRESCO,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}
