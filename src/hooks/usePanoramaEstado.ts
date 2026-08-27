import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  janelaFixa,
  janelaPorData,
  JANELA_PADRAO,
  JANELAS_COBERTURA,
  PERIODO_PADRAO,
  type JanelaCobertura,
  type JanelaEfetiva,
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
  /**
   * Como a base da cobertura é definida: por janela fixa ou por intervalo próprio.
   *
   * **Explícito, e não derivado da presença das datas.** Derivar parecia mais enxuto e
   * tinha um defeito de uso: limpar um dos campos para redigitá-lo apagaria o modo
   * junto, e o switch pularia sozinho para "Fixo" no meio da edição. Guardar o modo
   * deixa o campo vazio ser o que ele é — um campo vazio, com o aviso correspondente —
   * em vez de virar uma mudança de modo que ninguém pediu.
   */
  janelaModo: 'fixo' | 'data';
  /** Intervalo do modo `data`. Trocar para ele os preenche — ver `alternarModoJanela`. */
  janelaDe: string | null;
  janelaAte: string | null;
  /**
   * Trazer os dados de INVENTÁRIO para junto dos do ERP.
   *
   * Desligado por padrão, e essa é a hierarquia da tela: o Panorama é uma leitura do
   * ERP. A contagem do representante enriquece a análise, mas responde outra pergunta —
   * "o que foi contado bate?" — e deixá-la sempre à vista fazia a contagem disputar
   * espaço com os números que a pessoa veio ver.
   *
   * Vai na URL porque muda O QUE A TELA MOSTRA, não só o que está aberto: quem recebe
   * o link com a contagem ligada precisa ver a contagem.
   */
  inventario: boolean;
  /**
   * Trazer custo, lucro bruto e margem bruta para junto do faturamento.
   *
   * Desligado por padrão pela MESMA razão do inventário, e com uma a mais: margem é
   * número aproximado — o Ciclone não guarda custo histórico, então ela sai do custo
   * de HOJE aplicado à quantidade vendida. Um número com ressalva não pode chegar sem
   * ser pedido; pedido, ele vem com a ressalva junto.
   */
  custo: boolean;
  /**
   * Tirar o balde `DIVERSOS` da análise inteira.
   *
   * Ligado é um recorte, não uma camada: ele SUBTRAI linhas em vez de acrescentar
   * colunas, então muda todo número da tela — inclusive a cobertura, cujo denominador
   * é filtrado junto. Por isso mora no filtro principal e não entre as camadas extras.
   */
  ocultarDiversos: boolean;
}

const EMPRESAS: EscolhaEmpresa[] = ['ambas', '1', '2'];

/**
 * A empresa 2 abre a tela, e não "ambas".
 *
 * O mesmo produto é cadastrado nas DUAS empresas, então "ambas" conta cada SKU duas
 * vezes na contagem de produtos do estoque — o número de unidades continua certo, o de
 * produtos não. Abrir por uma empresa só dá a leitura que fecha; quem quiser o
 * consolidado troca no filtro e assume a duplicação sabendo dela.
 */
const EMPRESA_PADRAO: EscolhaEmpresa = '2';

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
      empresa: umDe(params.get('empresa'), EMPRESAS, EMPRESA_PADRAO),
      baseData: umDe(params.get('base'), ['movimento', 'emissao'] as const, 'movimento'),
      medida: umDe(params.get('medida'), ['quantidade', 'valor'] as const, 'quantidade'),
      abrirPor: umDe(params.get('abrir'), EIXOS_TOPO, 'marca'),
      mes: params.get('mes') && DATA_ISO.test(params.get('mes') ?? '') ? params.get('mes') : null,
      janela: janelaValida(params.get('janela')),
      janelaModo: umDe(params.get('jm'), ['fixo', 'data'] as const, 'fixo'),
      janelaDe: data(params.get('jde'), '') || null,
      janelaAte: data(params.get('jate'), '') || null,
      inventario: params.get('inv') === '1',
      custo: params.get('cst') === '1',
      ocultarDiversos: params.get('sd') === '1',
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
          if ('empresa' in mudanca) por('empresa', mudanca.empresa, EMPRESA_PADRAO);
          if ('baseData' in mudanca) por('base', mudanca.baseData, 'movimento');
          if ('medida' in mudanca) por('medida', mudanca.medida, 'quantidade');
          if ('abrirPor' in mudanca) por('abrir', mudanca.abrirPor, 'marca');
          if ('mes' in mudanca) por('mes', mudanca.mes);
          if ('janela' in mudanca) por('janela', String(mudanca.janela), String(JANELA_PADRAO));
          if ('janelaModo' in mudanca) por('jm', mudanca.janelaModo, 'fixo');
          if ('janelaDe' in mudanca) por('jde', mudanca.janelaDe);
          if ('janelaAte' in mudanca) por('jate', mudanca.janelaAte);
          // `'0'` como padrão e não `undefined`: assim desligar APAGA o parâmetro em vez
          // de gravar `inv=0`, e a URL do estado padrão continua sendo a URL limpa.
          if ('inventario' in mudanca) por('inv', mudanca.inventario ? '1' : '0', '0');
          if ('custo' in mudanca) por('cst', mudanca.custo ? '1' : '0', '0');
          if ('ocultarDiversos' in mudanca)
            por('sd', mudanca.ocultarDiversos ? '1' : '0', '0');
          return proximo;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  /**
   * A base da cobertura já resolvida — intervalo, divisor e rótulo.
   *
   * Sai daqui, e não de cada componente, porque a página, a faixa de indicadores e a
   * árvore precisam da MESMA janela. Cada uma recalculando a sua é como o rótulo
   * ("base mai–jul/26") e o número acabam falando de intervalos diferentes.
   */
  const janelaEfetiva: JanelaEfetiva = useMemo(
    () =>
      escopo.janelaModo === 'data'
        ? // `?? ''` chega como data inválida e sai com zero meses, que é o que a tela
          // desenha como "sem mês completo" — nunca uma exceção no meio da digitação.
          janelaPorData(escopo.janelaDe ?? '', escopo.janelaAte ?? '')
        : janelaFixa(escopo.janela),
    [escopo.janelaModo, escopo.janelaDe, escopo.janelaAte, escopo.janela]
  );

  const modoJanela = escopo.janelaModo;

  /** A ordem completa da árvore a partir do eixo escolhido para o topo. */
  const ordem: EixoId[] = useMemo(
    () => [escopo.abrirPor, ...ORDEM_PADRAO.comparativo.filter((e) => e !== escopo.abrirPor)],
    [escopo.abrirPor]
  );

  return { escopo, atualizar, ordem, EIXOS_TOPO, janelaEfetiva, modoJanela };
}
