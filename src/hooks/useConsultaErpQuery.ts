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
  cliente_nome: string | null;
  cliente_estado: string | null;
  vendedor_nome: string | null;
  codigo_auxiliar: string | null;
  produto_desc: string | null;
  quantidade: number;
  valor_liquido: number;
  cfop: string | number | null;
  operacao_desc: string | null;
  /** 'VENDA' | 'REMESSA' | outros — derivado do CFOP em `regras.py`. */
  classif_operacao: string | null;
  classif_pedido: string | null;
  situacao_nota: string | null;
  situacao_produto: string | null;
  /** Texto do sinal de auditoria (S1/S2) quando há; vazio quando não há. */
  divergencia: string | null;
  papel_vendedor: string | null;
}

export interface ParametrosPedidos {
  de: string;
  ate: string;
  vendedores?: number[];
  base_data?: 'movimento' | 'emissao';
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
    retry: false,
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
    retry: false,
  });
}
