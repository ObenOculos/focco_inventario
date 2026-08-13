import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendedorErp {
  codigo: number;
  nome: string;
  /** 'A' ativo, 'I' inativo — situação do cadastro no Ciclone. */
  situacao: string;
}

/**
 * Linha de pedido/nota vinda do Ciclone. O gateway devolve 45 colunas; aqui estão
 * tipadas as que a tela usa. As demais chegam no objeto e são ignoradas.
 */
export interface PedidoErp {
  empresa: number;
  numero_pedido: number | null;
  numero_nota: number | null;
  serie_nota: string | null;
  /** ISO-8601. Data do movimento da nota (ou da emissão, conforme `base_data`). */
  nota_movimento: string | null;
  /** ISO-8601. Emissão do PEDIDO — pode cair em mês diferente da nota. */
  pedido_emissao: string | null;
  cliente_nome: string | null;
  cliente_estado: string | null;
  vendedor_nome: string | null;
  resp_cliente_nome: string | null;
  produto_cod: number | null;
  codigo_auxiliar: string | null;
  produto_desc: string | null;
  marca: string | null;
  cor_cod: string | number | null;
  tamanho_cod: string | number | null;
  quantidade: number;
  preco_atacado: number;
  valor_liquido: number;
  cfop: string | number | null;
  cfop_desc: string | null;
  operacao_cod: number | null;
  operacao_desc: string | null;
  tipo_pedido_cod: number | null;
  tipo_pedido_desc: string | null;
  /** Nome de quem digitou o pedido no ERP. Vazio quando a nota não veio de pedido. */
  criou_pedido: string | null;
  /** 'VENDA' | 'REMESSA' | outros — derivado do CFOP em `regras.py`. */
  classif_operacao: string | null;
  classif_pedido: string | null;
  situacao_nota: string | null;
  /**
   * Código de uma letra da situação da nota — `'C'` é cancelada.
   *
   * É por ele que se filtra, nunca pelo `situacao_nota`: aquele é o rótulo legível
   * ("Cancelada") e existe para ser lido, não comparado. A própria `regras.py` usa o
   * código ao decidir que nota cancelada não gera divergência.
   */
  nota_situacao_cod: string | null;
  situacao_produto: string | null;
  /** `'A'`/`'I'` do CADASTRO do produto; vazio quando o produto não tem par no cadastro. */
  produto_situacao_cod: string | null;
  /** Texto do sinal de auditoria (S1/S2) quando há; vazio quando não há. */
  divergencia: string | null;
  papel_vendedor: string | null;
  /** Texto livre digitado por gente — por isso tem escopo de busca separado. */
  obs_pedido: string | null;
}

export interface ParametrosPedidos {
  de: string;
  ate: string;
  vendedores?: number[];
  /** Empresas (filiais). Omitido = as duas, pelo padrão do gateway. */
  empresas?: number[];
  base_data?: 'movimento' | 'emissao';
}

/**
 * Escolha de empresa nas telas. `ambas` vira `undefined` na chamada, deixando o
 * padrão do gateway (`EMPRESAS_PADRAO`) valer — se ele mudar um dia, as telas
 * acompanham sem edição.
 */
export type EscolhaEmpresa = 'ambas' | '1' | '2';

export function empresasDaEscolha(e: EscolhaEmpresa): number[] | undefined {
  return e === 'ambas' ? undefined : [Number(e)];
}

/**
 * Vendas e remessas somadas por produto, no intervalo entre dois inventários.
 * `key` é o código auxiliar já normalizado pelo gateway — é por ele que se casa
 * com o inventário, nunca pelo `codigo_auxiliar` cru.
 */
export interface MovimentoErp {
  key: string;
  codigo_auxiliar: string;
  nome: string;
  remessa: number;
  venda: number;
}

export interface ParametrosMovimentos {
  /** Código do vendedor no Ciclone. Só um — a reconciliação é por vendedor. */
  vendedor: number;
  de: string;
  ate: string;
  /** Empresas (filiais). Omitido = as duas, pelo padrão do gateway. */
  empresas?: number[];
  /** Tipos de pedido que saem da mala. Omitido = padrão de `movimentos.py`. */
  tipos_venda?: number[];
  /** Tipos de pedido que entram na mala. Omitido = padrão de `movimentos.py`. */
  tipos_remessa?: number[];
  /** Operações fiscais consideradas. Omitido = todas. */
  operacoes?: number[];
  /**
   * Qual data delimita o período: a do movimento da nota (padrão, igual ao
   * `comparativo.py`) ou a de emissão do pedido. Muda quais notas entram na
   * janela quando pedido e nota caem em meses diferentes.
   */
  base_data?: 'movimento' | 'emissao';
}

export interface ItemCodigo {
  codigo: number;
  descricao: string;
}

/** Vocabulário e padrões das regras de conciliação, vindos do Ciclone. */
export interface RegrasErp {
  tipos_pedido: ItemCodigo[];
  operacoes: ItemCodigo[];
  padroes: {
    tipos_remessa: number[];
    tipos_venda: number[];
    /** Vêm DESMARCADAS: não movimentam estoque físico. */
    operacoes_sem_movimento_estoque: number[];
  };
}

interface RespostaErp<T> {
  total: number;
  dados: T[];
}

/**
 * Erro de consulta ao ERP, carregando o status HTTP.
 *
 * O status é o que separa "a máquina do escritório está fora do ar" (503) de
 * "você não tem permissão" (403) — a tela mostra mensagens muito diferentes para
 * cada um, e sem isso as duas viram "erro inesperado".
 */
export class ErroErp extends Error {
  readonly status?: number;

  constructor(mensagem: string, status?: number) {
    super(mensagem);
    this.name = 'ErroErp';
    this.status = status;
  }

  get indisponivel() {
    return this.status === 503;
  }
}

/** Tentativas totais (a primeira mais duas repetições). */
export const TENTATIVAS_ERP = 3;

/**
 * Repete só o que tem chance de mudar de resultado.
 *
 * O caminho até o Ciclone passa por Edge Function, túnel, VPN e um Postgres que
 * não é nosso — falhas passageiras acontecem, e medimos a mesma consulta levando
 * 32 s numa vez e 2 s na seguinte. Repetir resolve esse caso.
 *
 * Só o 503 é repetido: significa "não alcancei o ERP" ou "demorou demais". Os 4xx
 * são definitivos — repetir um 403 três vezes não muda a permissão de ninguém, só
 * atrasa a mensagem em vários segundos.
 */
function repetirSeTransitorio(falhas: number, erro: ErroErp): boolean {
  if (!erro?.indisponivel) return false;
  return falhas < TENTATIVAS_ERP;
}

/** Espera curta e crescente: 2 s e 4 s. */
const esperaEntreTentativas = (tentativa: number) => Math.min(2000 * 2 ** tentativa, 6000);

async function chamarErp<T>(operacao: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('erp-consulta', {
    body: { operacao, params },
  });

  if (error) {
    // O supabase-js não lê o corpo de respostas não-2xx: ele embrulha a Response
    // crua em `error.context` e devolve a mensagem genérica "Edge Function returned
    // a non-2xx status code". Sem desembrulhar aqui, toda falha do ERP chega à tela
    // com esse texto e o usuário perde a única informação útil.
    let mensagem = error.message;
    let status: number | undefined;
    const contexto = (error as { context?: Response }).context;

    if (contexto && typeof contexto.json === 'function') {
      status = contexto.status;
      try {
        const corpo = (await contexto.json()) as { error?: string };
        if (corpo?.error) mensagem = corpo.error;
      } catch {
        /* corpo não-JSON: fica a mensagem original */
      }
    }
    throw new ErroErp(mensagem, status);
  }

  return data as T;
}

/**
 * Tipos de pedido, operações fiscais e os padrões de conciliação.
 *
 * Muda praticamente nunca (é cadastro do ERP) e é preciso para montar os
 * checkboxes das regras, então vale um `staleTime` longo.
 */
export function useErpRegrasQuery(habilitado = true) {
  return useQuery<RegrasErp, ErroErp>({
    queryKey: ['erp', 'regras'],
    queryFn: () => chamarErp<RegrasErp>('regras'),
    enabled: habilitado,
    staleTime: 60 * 60 * 1000,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}

/** Vendedores cadastrados no Ciclone — alimenta o seletor da consulta. */
export function useErpVendedoresQuery(habilitado = true) {
  return useQuery<VendedorErp[], ErroErp>({
    queryKey: ['erp', 'vendedores'],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<VendedorErp>>('vendedores');
      return r.dados;
    },
    enabled: habilitado,
    // A lista muda raramente e cada consulta atravessa VPN + túnel; não vale
    // repetir a cada foco de janela.
    staleTime: 30 * 60 * 1000,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}

/**
 * Pedidos e notas do período. `parametros` nulo mantém a consulta parada — é assim
 * que a tela só vai ao ERP quando o usuário pede, em vez de a cada tecla nos filtros.
 */
export function useErpPedidosQuery(parametros: ParametrosPedidos | null) {
  return useQuery<PedidoErp[], ErroErp>({
    queryKey: ['erp', 'pedidos', parametros],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<PedidoErp>>('pedidos', {
        ...parametros,
        base_data: parametros?.base_data ?? 'movimento',
      });
      return r.dados;
    },
    enabled: parametros !== null,
    staleTime: 5 * 60 * 1000,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}

/**
 * Movimentos do vendedor entre duas datas, para a reconciliação de inventários.
 *
 * Devolve o fato do ERP e nada mais: a conta
 * `esperado = qtd_A + remessa − venda` é feita na tela, junto dos inventários,
 * para existir uma cópia só da fórmula.
 */
export function useErpMovimentosQuery(parametros: ParametrosMovimentos | null) {
  return useQuery<MovimentoErp[], ErroErp>({
    queryKey: ['erp', 'movimentos', parametros],
    queryFn: async () => {
      const r = await chamarErp<RespostaErp<MovimentoErp>>('movimentos', {
        ...parametros,
      });
      return r.dados;
    },
    enabled: parametros !== null,
    staleTime: 5 * 60 * 1000,
    retry: repetirSeTransitorio,
    retryDelay: esperaEntreTentativas,
  });
}
