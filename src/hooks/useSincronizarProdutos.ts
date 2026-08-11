import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ErroErp, type EscolhaEmpresa, empresasDaEscolha } from '@/hooks/useConsultaErpQuery';

/**
 * Sincronização do catálogo de produtos com o Ciclone.
 *
 * O envio é em lotes porque o catálogo passa de 900 KB — grande demais para uma
 * requisição só. Mas os lotes NÃO gravam em `produtos`: caem numa área de espera,
 * e só o passo final aplica tudo numa transação. Sem isso, uma queda de rede no
 * meio deixaria o catálogo metade novo e metade velho, sem sinal nenhum de onde
 * parou.
 *
 * O fluxo tem uma pausa obrigatória: depois de enviar os lotes vem a PRÉVIA, e
 * nada é gravado até o usuário confirmar. É uma operação que mexe no catálogo
 * inteiro de uma vez.
 */

const TAMANHO_LOTE = 1000;

export interface ProdutoCiclone {
  codigo_auxiliar: string;
  codigo_produto: string;
  nome_produto: string;
  modelo: string;
  /** Código da cor (`A01`) — é ele que forma o `codigo_auxiliar`. */
  cor: string;
  valor_produto: number;
  valor_remessa: number;
  ativo: boolean;
  /**
   * Atributos de categoria, como o Ciclone os escreve (caixa alta, sem acento).
   * Nulos quando o cadastro de origem não os tem — hoje isso não acontece, mas os
   * JOINs do gateway são LEFT de propósito: um produto sem coleção deve continuar
   * aparecendo no inventário.
   */
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
  /** Nome da cor (`PRETO BRILHO`), separado do código que vai em `cor`. */
  cor_nome: string | null;
}

export interface PreviaSincronizacao {
  recebidos: number;
  inseridos: number;
  alterados: number;
  inalterados: number;
  inativados: number;
}

export interface ResultadoSincronizacao {
  recebidos: number;
  inseridos: number;
  atualizados: number;
  inativados: number;
}

export type EtapaSincronizacao =
  | { fase: 'ocioso' }
  | { fase: 'buscando' }
  | { fase: 'enviando'; enviados: number; total: number }
  | { fase: 'aguardando'; id: string; previa: PreviaSincronizacao }
  | { fase: 'aplicando'; id: string }
  | { fase: 'concluido'; resultado: ResultadoSincronizacao }
  | { fase: 'erro'; mensagem: string };

async function buscarCatalogo(empresa: EscolhaEmpresa): Promise<ProdutoCiclone[]> {
  const { data, error } = await supabase.functions.invoke('erp-consulta', {
    body: { operacao: 'produtos', params: { empresas: empresasDaEscolha(empresa) } },
  });
  if (error) {
    let mensagem = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const corpo = (await ctx.json()) as { error?: string };
        if (corpo?.error) mensagem = corpo.error;
      } catch {
        /* corpo não-JSON */
      }
      throw new ErroErp(mensagem, ctx.status);
    }
    throw new ErroErp(mensagem);
  }
  return (data as { dados: ProdutoCiclone[] }).dados;
}

export function useSincronizarProdutos() {
  const [etapa, setEtapa] = useState<EtapaSincronizacao>({ fase: 'ocioso' });
  const queryClient = useQueryClient();

  /** Busca do Ciclone, envia os lotes e para na prévia. Não grava nada. */
  const preparar = async (empresa: EscolhaEmpresa) => {
    try {
      setEtapa({ fase: 'buscando' });
      const produtos = await buscarCatalogo(empresa);
      if (produtos.length === 0) {
        setEtapa({ fase: 'erro', mensagem: 'O Ciclone não devolveu nenhum produto.' });
        return;
      }

      const { data: id, error: erroInicio } = await supabase.rpc(
        'iniciar_sincronizacao_produtos'
      );
      if (erroInicio) throw new Error(erroInicio.message);

      setEtapa({ fase: 'enviando', enviados: 0, total: produtos.length });
      for (let i = 0; i < produtos.length; i += TAMANHO_LOTE) {
        const lote = produtos.slice(i, i + TAMANHO_LOTE);
        const { error } = await supabase.rpc('enviar_lote_produtos', {
          p_sincronizacao_id: id as string,
          p_produtos: lote as unknown as never,
        });
        if (error) throw new Error(error.message);
        setEtapa({
          fase: 'enviando',
          enviados: Math.min(i + TAMANHO_LOTE, produtos.length),
          total: produtos.length,
        });
      }

      const { data: previa, error: erroPrevia } = await supabase.rpc(
        'previa_sincronizacao_produtos',
        { p_sincronizacao_id: id as string }
      );
      if (erroPrevia) throw new Error(erroPrevia.message);

      setEtapa({
        fase: 'aguardando',
        id: id as string,
        previa: previa as unknown as PreviaSincronizacao,
      });
    } catch (e) {
      setEtapa({
        fase: 'erro',
        mensagem: e instanceof Error ? e.message : 'Falha ao preparar a sincronização.',
      });
    }
  };

  /** Aplica o que está na área de espera. É o único passo que escreve. */
  const aplicar = async (id: string) => {
    try {
      setEtapa({ fase: 'aplicando', id });
      const { data, error } = await supabase.rpc('concluir_sincronizacao_produtos', {
        p_sincronizacao_id: id,
      });
      if (error) throw new Error(error.message);
      // O catálogo mudou: as telas que o leem precisam recarregar.
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      setEtapa({
        fase: 'concluido',
        resultado: data as unknown as ResultadoSincronizacao,
      });
    } catch (e) {
      setEtapa({
        fase: 'erro',
        mensagem: e instanceof Error ? e.message : 'Falha ao aplicar a sincronização.',
      });
    }
  };

  const cancelar = () => setEtapa({ fase: 'ocioso' });

  return { etapa, preparar, aplicar, cancelar };
}
