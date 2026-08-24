import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  JANELA_PADRAO,
  JANELAS_COBERTURA,
  PERIODO_PADRAO,
  type JanelaCobertura,
} from '@/lib/panoramaPeriodo';
import { ORDEM_PADRAO, type EixoId, type Medida } from '@/lib/panorama';
import type { EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';

/**
 * O escopo do Panorama, guardado na URL.
 *
 * **Por que na URL e não em `useState`.** O gestor olha um recorte, quer mostrá-lo para
 * alguém, e hoje só consegue descrever de viva voz qual foi a sequência de cliques.
 * Com o estado na barra de endereços, o recorte vira um link — e de quebra sobrevive a
 * um F5, que é o jeito mais comum de perder uma análise pela metade.
 *
 * Fica de fora o que é **navegação e não escopo**: quais nós estão expandidos e qual
 * célula está aberta. São estados de leitura, mudam a cada clique, e enfiá-los na URL
 * encheria o histórico do navegador de entradas que ninguém quer revisitar.
 *
 * `replace: true` pelo mesmo motivo: trocar de período é refinar a mesma pergunta, não
 * navegar — o Voltar do navegador deve sair da tela, não desfazer um filtro.
 */

export interface EscopoPanorama {
  de: string;
  ate: string;
  empresa: EscolhaEmpresa;
  baseData: 'movimento' | 'emissao';
  medida: Medida;
  /** Eixo do topo da árvore. Os demais seguem na ordem padrão. */
  abrirPor: EixoId;
  /** Mês em foco na série, ou `null`. */
  mes: string | null;
  /**
   * Meses completos que servem de base para a cobertura.
   *
   * Vai na URL porque MUDA O SIGNIFICADO do número, não só o que se vê: "3,9 meses de
   * cobertura" com base trimestral e com base anual são afirmações diferentes, e quem
   * recebe o link precisa receber a base junto.
   */
  janela: JanelaCobertura;
}

const EMPRESAS: EscolhaEmpresa[] = ['ambas', '1', '2'];
// `tudo` primeiro: é a raiz, e ler a lista da esquerda para a direita passa a ser
// do mais amplo ao mais específico.
const EIXOS_TOPO: EixoId[] = ['tudo', 'marca', 'tipo', 'subtipo', 'grupo'];

/** Aceita só valores conhecidos: URL é entrada de fora, e um eixo inventado quebraria a árvore. */
const umDe = <T extends string>(valor: string | null, aceitos: readonly T[], padrao: T): T =>
  aceitos.includes(valor as T) ? (valor as T) : padrao;

/** A janela vem da URL como texto; só os três valores conhecidos passam. */
const janelaValida = (valor: string | null): JanelaCobertura => {
  const n = Number(valor);
  return (JANELAS_COBERTURA as readonly number[]).includes(n)
    ? (n as JanelaCobertura)
    : JANELA_PADRAO;
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const data = (valor: string | null, padrao: string) =>
  valor && DATA_ISO.test(valor) ? valor : padrao;

export function usePanoramaEstado() {
  const [params, setParams] = useSearchParams();

  const escopo: EscopoPanorama = useMemo(() => {
    const de = data(params.get('de'), PERIODO_PADRAO.de);
    const ate = data(params.get('ate'), PERIODO_PADRAO.ate);
    return {
      de,
      ate,
      empresa: umDe(params.get('empresa'), EMPRESAS, 'ambas'),
      baseData: umDe(params.get('base'), ['movimento', 'emissao'] as const, 'movimento'),
      medida: umDe(params.get('medida'), ['quantidade', 'valor'] as const, 'quantidade'),
      abrirPor: umDe(params.get('abrir'), EIXOS_TOPO, 'marca'),
      mes: params.get('mes') && DATA_ISO.test(params.get('mes') ?? '') ? params.get('mes') : null,
      janela: janelaValida(params.get('janela')),
    };
  }, [params]);

  const atualizar = useCallback(
    (mudanca: Partial<EscopoPanorama>) => {
      setParams(
        (anterior) => {
          const proximo = new URLSearchParams(anterior);
          const por = (chave: string, valor: string | null | undefined, padrao?: string) => {
            if (valor === null || valor === undefined || valor === padrao) proximo.delete(chave);
            else proximo.set(chave, valor);
          };
          if ('de' in mudanca) por('de', mudanca.de, PERIODO_PADRAO.de);
          if ('ate' in mudanca) por('ate', mudanca.ate, PERIODO_PADRAO.ate);
          if ('empresa' in mudanca) por('empresa', mudanca.empresa, 'ambas');
          if ('baseData' in mudanca) por('base', mudanca.baseData, 'movimento');
          if ('medida' in mudanca) por('medida', mudanca.medida, 'quantidade');
          if ('abrirPor' in mudanca) por('abrir', mudanca.abrirPor, 'marca');
          if ('mes' in mudanca) por('mes', mudanca.mes);
          if ('janela' in mudanca) por('janela', String(mudanca.janela), String(JANELA_PADRAO));
          return proximo;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  /** A ordem completa da árvore a partir do eixo escolhido para o topo. */
  const ordem: EixoId[] = useMemo(
    () => [escopo.abrirPor, ...ORDEM_PADRAO.comparativo.filter((e) => e !== escopo.abrirPor)],
    [escopo.abrirPor]
  );

  return { escopo, atualizar, ordem, EIXOS_TOPO };
}
