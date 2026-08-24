import { useQuery } from '@tanstack/react-query';
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

export type Lente = 'saidas' | 'entradas';

/**
 * O que as duas lentes têm em comum.
 *
 * As categorias vêm como **string vazia** quando o Ciclone não tem o atributo
 * cadastrado — nunca `null`. Quem traduz para "Sem categoria" é
 * `categoriasProduto.ts`, que já é a definição única disso no app.
 */
interface BasePanorama {
  empresa: number;
  marca: string;
  tipo: string;
  subtipo: string;
  grupo: string;
  operacao_cod: number | null;
  operacao_desc: string | null;
  cfop: string | number | null;
  cfop_desc: string | null;
  quantidade: number;
  valor: number;
  /** Linhas de nota que entraram na soma. É o que denuncia um agregado inflado. */
  linhas: number;
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

export type SaidaCategoria = BasePanorama & DimensoesSaida & ComMes;
export type SaidaProduto = BasePanorama & DimensoesSaida & DimensoesProduto;
export type EntradaCategoria = BasePanorama & DimensoesEntrada & ComMes;
export type EntradaProduto = BasePanorama & DimensoesEntrada & DimensoesProduto;

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
  Partial<DimensoesSaida & DimensoesEntrada & DimensoesProduto & ComMes>;

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
