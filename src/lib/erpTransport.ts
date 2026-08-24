import { supabase } from '@/integrations/supabase/client';

/**
 * Transporte até o Ciclone — o pedaço que TODA consulta ao ERP compartilha.
 *
 * Saiu de `useConsultaErpQuery.ts` quando o Panorama passou a chamar o mesmo
 * caminho: Edge Function `erp-consulta` (que valida o JWT e exige `role='gerente'`)
 * → gateway → Ciclone. O que mora aqui é o que não pode existir em duas versões —
 * a leitura do corpo de erro e a política de repetição. Uma segunda cópia delas
 * significaria uma tela mostrando "erro inesperado" onde a outra mostra o motivo
 * real, e ninguém notaria até alguém comparar as duas.
 *
 * O que NÃO mora aqui: os tipos de cada operação e os `useQuery`. Cada tela declara
 * os seus.
 */

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
export function repetirSeTransitorio(falhas: number, erro: ErroErp): boolean {
  if (!erro?.indisponivel) return false;
  return falhas < TENTATIVAS_ERP;
}

/** Espera curta e crescente: 2 s e 4 s. */
export const esperaEntreTentativas = (tentativa: number) => Math.min(2000 * 2 ** tentativa, 6000);

export async function chamarErp<T>(
  operacao: string,
  params: Record<string, unknown> = {}
): Promise<T> {
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

/** Envelope que toda rota do gateway devolve. */
export interface RespostaErp<T> {
  total: number;
  dados: T[];
}
