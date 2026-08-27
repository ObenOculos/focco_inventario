import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudOff, Package, Search, SlidersHorizontal } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { empresasDaEscolha, type EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';
import {
  dataCurta,
  impedimentoDaConsulta,
  janelaPadraoPorData,
  janelaPorData,
} from '@/lib/panoramaPeriodo';
import { usePanoramaEstado } from '@/hooks/usePanoramaEstado';
import {
  useEntradasProdutoQuery,
  useEntradasQuery,
  useEstoqueExternoQuery,
  useEstoqueInternoQuery,
  useEstoqueInventariadoQuery,
  useSaidasProdutoQuery,
  useSaidasQuery,
  type LinhaPanorama,
} from '@/hooks/usePanoramaQuery';
import { eixoDe, filtrarPeloCaminho, recorteDoCaminho, type EixoId } from '@/lib/panorama';
import {
  chaveDoCaminho,
  chavesExpansiveis,
  construirArvore,
  ocultarDiversos,
  recortarPorMes,
  serieComparativa,
  totalComparativo,
  type FonteDetalhe,
  type FontesComparativo,
  type NoArvore,
} from '@/lib/panoramaComparativo';
import { BarraEscopo } from '@/components/panorama/BarraEscopo';
import { FaixaIndicadores } from '@/components/panorama/FaixaIndicadores';
import { SerieMensal } from '@/components/panorama/SerieMensal';
import { ArvoreComparativa } from '@/components/panorama/ArvoreComparativa';
import { PainelDetalhe } from '@/components/panorama/PainelDetalhe';

/**
 * Panorama — uma tela, um escopo, um recorte.
 *
 * Substituiu quatro lentes que funcionavam como silos. O problema não era cada uma
 * delas; era precisar **saber de antemão qual aba respondia** a pergunta, e perder o
 * recorte percorrido ao trocar. Agora as fontes convivem na mesma linha da árvore, e o
 * que antes era uma aba virou o detalhe de um número clicado.
 *
 * Como se lê:
 *
 *   1. **Escopo** — período, empresa, medida. Vale para tudo, e a tela já abre
 *      consultada no padrão (ano corrente) em vez de pedir um formulário primeiro.
 *   2. **Indicadores** — a equação do recorte ABERTO, nunca do período inteiro.
 *   3. **Série** — entradas e saídas espelhadas; clicar num mês foca o fluxo nele.
 *   4. **Árvore** — a hierarquia inteira, expansível no lugar, com fluxo e posição
 *      lado a lado.
 *   5. **Detalhe** — abre sob demanda ao clicar num número, com o vocabulário da
 *      fonte (tipo de saída, fornecedor, quem está com a mercadoria).
 *
 * **Duas naturezas convivem na mesma linha e a tela precisa dizê-lo.** Entrou/saiu são
 * do PERÍODO; interno/mala são de HOJE. Filtrar por mês recorta o fluxo e deixa o
 * estoque como está — não existe "estoque de março" guardado em lugar nenhum.
 *
 * **O Panorama é uma leitura do ERP; a contagem é complemento.** O inventário responde
 * outra pergunta ("o que os representantes contaram bate com o sistema?") e antes vinha
 * sempre junto — coluna fixa e um cartão de divergência na primeira dobra, disputando
 * atenção com os números que trouxeram a pessoa aqui. Agora entra por uma chave, e
 * quando entra vem no FIM de cada leitura: última coluna da árvore, último cartão da
 * faixa. Ver `escopo.inventario`.
 *
 * **A rentabilidade é a segunda camada opcional, e vem com ressalva colada.** O Ciclone
 * não guarda o custo da nota: o único custo que existe é o do cadastro de HOJE, então
 * a margem de um mês antigo se move se o produto for reprecificado. Por isso ela
 * também entra por chave, e por isso os cartões carregam o `ⓘ` que diz de onde o
 * número saiu. Ver `escopo.custo` e `MedidasCusto`.
 *
 * Quantidade e valor nunca se misturam num número só: a medida ativa é uma, e trocá-la
 * reordena a árvore. A bonificação lidera em unidades e some em valor — é essa troca
 * de posição que responde "onde está o dinheiro" contra "onde está o volume".
 */

/** `2026-06-01` -> `jun/26`, para o cabeçalho quando há um mês em foco. */
const mesPorExtenso = (iso: string) => {
  try {
    return format(parseISO(iso), 'MMM/yy', { locale: ptBR });
  } catch {
    return iso;
  }
};

/**
 * O recorte que foi de fato CONSULTADO — o que custa ida ao ERP.
 *
 * Só isto entra: medida, eixo, camadas e o recorte de Diversos transformam dados que já
 * estão na memória e continuam instantâneos. Fazê-los esperar o botão seria cobrar uma
 * consulta de cinco respostas para exibir um número que já veio dentro delas.
 */
interface Consultado {
  de: string;
  ate: string;
  empresa: EscolhaEmpresa;
  baseData: 'movimento' | 'emissao';
  /** Da janela de cobertura — ela tem consulta própria quando não cabe no período. */
  janelaDe: string;
  janelaAte: string;
  mesesJanela: number;
}

export default function Panorama() {
  const { escopo, atualizar, ordem, EIXOS_TOPO, janelaEfetiva, modoJanela } =
    usePanoramaEstado();

  // Navegação, não escopo: fica fora da URL de propósito (ver `usePanoramaEstado`).
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{ no: NoArvore; fonte: FonteDetalhe } | null>(null);
  const [pedirProdutos, setPedirProdutos] = useState(false);
  // Interface, não escopo: fica fora da URL porque "com o filtro aberto" não é um
  // recorte que alguém queira compartilhar por link. Abre por padrão — ver `BarraEscopo`.
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  /**
   * **Nada vai ao ERP até o botão ser apertado.**
   *
   * A tela abria consultada, e o efeito colateral era que cada toque num filtro
   * disparava cinco consultas — o gateway serializa em três, então mexer no período e
   * na empresa em seguida enfileirava dez idas ao Ciclone para exibir uma só.
   *
   * `null` é "ainda não consultou", não "consultou e veio vazio": os dois estados
   * mostram telas diferentes, e confundi-los faria a primeira visita parecer um erro.
   */
  const [consultado, setConsultado] = useState<Consultado | null>(null);

  /**
   * Só passa daqui o que dá para perguntar ao Ciclone. Regra única — ver a lib.
   *
   * O formato entra na conta, e não é zelo: o `<input type="date">` emite um valor a
   * cada tecla do ano, então digitar "2026" produz `0002-…`, `0020-…`, `0202-…` pelo
   * caminho. O gateway registrou um `GET /saidas?de=0202-01-01` real — e a mensagem que
   * voltava dali ("'de' deve ser uma data no formato AAAA-MM-DD") é vocabulário de API
   * chegando à tela de um gestor.
   */
  const impedimento = impedimentoDaConsulta({
    de: escopo.de,
    ate: escopo.ate,
    modoJanela,
    mesesJanela: janelaEfetiva.meses,
  });
  const podeConsultar = impedimento === null;

  /** O que o usuário TEM na tela agora — comparado com `consultado` para achar pendência. */
  const emEdicao: Consultado = {
    de: escopo.de,
    ate: escopo.ate,
    empresa: escopo.empresa,
    baseData: escopo.baseData,
    janelaDe: janelaEfetiva.de,
    janelaAte: janelaEfetiva.ate,
    mesesJanela: janelaEfetiva.meses,
  };

  const pendente =
    consultado !== null &&
    (Object.keys(emEdicao) as (keyof Consultado)[]).some((k) => emEdicao[k] !== consultado[k]);

  const consultar = () => {
    if (!podeConsultar) return;
    setConsultado(emEdicao);
  };

  // As consultas leem SÓ de `consultado`. É o que garante que mexer num filtro não
  // dispare nada: enquanto o botão não for apertado, os parâmetros não mudam.
  const empresas = empresasDaEscolha(consultado?.empresa ?? escopo.empresa);
  const paramsFluxo = consultado
    ? { de: consultado.de, ate: consultado.ate, empresas, base_data: consultado.baseData }
    : null;

  const saidas = useSaidasQuery(paramsFluxo);

  /**
   * Saídas da JANELA DE COBERTURA — consulta própria, independente do período exibido.
   *
   * É uma ida a mais ao ERP, e vale: sem ela a cobertura era calculada sobre o filtro
   * da tela, então o mesmo estoque rendia números completamente diferentes conforme um
   * botão que existe para outra coisa. Com janela própria, o indicador significa a
   * mesma coisa em toda leitura.
   *
   * A janela vem de `consultado` e não do escopo em edição pelo mesmo motivo das
   * demais: trocar de "3 meses" para um intervalo de dois anos não pode disparar nada
   * antes do botão.
   */

  /**
   * A janela cabe dentro do período consultado? Então a demanda JÁ VEIO.
   *
   * Medido em 2026-08-24: a tela dispara cinco consultas ao ERP de uma vez e o gateway
   * serializa em três (`GATEWAY_MAX_CONCORRENTES`), então as últimas esperavam 7 s na
   * fila. Uma delas era redundante — no estado padrão (período "Ano", base de 3 meses)
   * a janela é um subconjunto do que `saidas` já trouxe, e recortá-la por mês no cliente
   * dá exatamente o mesmo resultado sem custo nenhum.
   *
   * A comparação é de string ISO de propósito: `AAAA-MM-DD` ordena lexicograficamente
   * igual a cronologicamente, e comparar texto evita fuso horário na conta.
   */
  const janelaCabeNoPeriodo =
    consultado !== null &&
    consultado.de <= consultado.janelaDe &&
    consultado.ate >= consultado.janelaAte;

  const demanda = useSaidasQuery(
    !consultado || janelaCabeNoPeriodo
      ? null
      : {
          de: consultado.janelaDe,
          ate: consultado.janelaAte,
          empresas,
          base_data: consultado.baseData,
        }
  );
  const entradas = useEntradasQuery(paramsFluxo);
  const interno = useEstoqueInternoQuery(consultado ? { empresas } : null);
  const externo = useEstoqueExternoQuery(consultado ? { empresas, nivel: 'categoria' } : null);
  // Camada, não filtro: marcar a caixa traz a contagem na hora, sem passar pelo botão —
  // é uma consulta leve ao Supabase, não ao Ciclone. Mas não antes da primeira consulta,
  // ou a tela mostraria inventário flutuando sobre um Panorama ainda vazio.
  const inventariado = useEstoqueInventariadoQuery(escopo.inventario && consultado !== null);

  const consultas = useMemo(
    () => [saidas, entradas, interno, externo, inventariado, demanda],
    [saidas, entradas, interno, externo, inventariado, demanda]
  );

  const queryClient = useQueryClient();

  /**
   * O "refazer" do botão quando nenhum filtro mudou.
   *
   * NÃO pode ser `consultas.forEach((q) => q.refetch())`: `refetch()` IGNORA `enabled`
   * e dispara também a consulta parada. A da janela de cobertura vive parada no caso
   * comum (a janela cabe no período consultado), então cada clique a mandava ao ERP com
   * `parametros` nulo — sem `de` nem `ate` — e a Edge Function respondia 422. O
   * resultado era um banner de erro sobre uma tela cujos números estavam todos certos.
   *
   * `refetchQueries` com `type: 'active'` pula as paradas e as que não estão montadas,
   * então o clique atualiza exatamente o que está na tela — inclusive os produtos do
   * painel de detalhe, quando ele está aberto.
   */
  const refazerConsultas = () => {
    void queryClient.refetchQueries({
      type: 'active',
      // Dois prefixos porque o inventário não vem do ERP: sai da RPC do Supabase e tem
      // chave própria.
      predicate: (q) => q.queryKey[0] === 'erp' || q.queryKey[0] === 'panorama',
    });
  };

  /**
   * As consultas que SEGURAM a tela. O inventário não está entre elas de propósito.
   *
   * A chave que o liga mora no cabeçalho da árvore, dentro do bloco que só existe com
   * a tela carregada: se o inventário entrasse no gate, marcá-la trocaria tudo por
   * esqueleto e a própria chave sumiria da tela — não haveria como desmarcar. Como é
   * complemento, ele chega depois, sobre os números do ERP que já estão lá.
   */
  const consultasErp = useMemo(
    () => [saidas, entradas, interno, externo, demanda],
    [saidas, entradas, interno, externo, demanda]
  );

  /**
   * As saídas da janela de cobertura, venham de onde vierem.
   *
   * O recorte por mês só é válido porque a janela está inteiramente dentro do período —
   * é o que garante que cada mês dela venha COMPLETO. Um mês pela metade no numerador
   * inflaria a cobertura, que é justamente o defeito que esta janela existe para
   * corrigir.
   */
  const linhasDemanda: LinhaPanorama[] = useMemo(() => {
    if (!consultado || !janelaCabeNoPeriodo) return demanda.data ?? [];
    const { janelaDe, janelaAte } = consultado;
    return (saidas.data ?? []).filter((l) => l.mes >= janelaDe && l.mes <= janelaAte);
  }, [consultado, janelaCabeNoPeriodo, demanda.data, saidas.data]);
  const carregando = consultasErp.some((q) => q.isLoading);
  // O inventário conta aqui: o giro no cabeçalho é justamente o aviso de que algo ainda
  // está chegando sem que a tela tenha sido esvaziada.
  const atualizando = consultas.some((q) => q.isFetching);
  // A primeira falha manda: se o ERP caiu, as cinco falham pelo mesmo motivo, e repetir
  // a mensagem cinco vezes não ajuda ninguém.
  const erro = consultas.find((q) => q.error)?.error;

  const fontesCompletas: FontesComparativo = useMemo(
    () => ({
      saidas: saidas.data ?? [],
      entradas: entradas.data ?? [],
      interno: interno.data ?? [],
      externo: externo.data ?? [],
      // Desligado, o array vazio faz `divergencia` virar `null` na árvore inteira — que
      // é o mesmo caminho de "não houve contagem aqui", já tratado por toda a lib.
      inventario: escopo.inventario ? (inventariado.data ?? []) : [],
      demanda: linhasDemanda,
    }),
    [
      saidas.data,
      entradas.data,
      interno.data,
      externo.data,
      inventariado.data,
      escopo.inventario,
      linhasDemanda,
    ]
  );

  /**
   * As fontes já sem `DIVERSOS`, quando pedido.
   *
   * Aplicado ANTES do recorte por mês e antes da série, porque não é apresentação: é a
   * base de que todo número da tela sai. Filtrar só na árvore deixaria a faixa de
   * indicadores e o gráfico contando uma história diferente da lista logo abaixo.
   */
  const fontesVisiveis = useMemo(
    () => (escopo.ocultarDiversos ? ocultarDiversos(fontesCompletas) : fontesCompletas),
    [fontesCompletas, escopo.ocultarDiversos]
  );

  /** O mês em foco recorta o FLUXO; o estoque continua sendo o de hoje. */
  const fontes = useMemo(
    () => recortarPorMes(fontesVisiveis, escopo.mes),
    [fontesVisiveis, escopo.mes]
  );

  /** O recorte do painel de detalhe — vazio quando nada está aberto. */
  const caminhoDetalhe = useMemo(() => detalhe?.no.caminho ?? [], [detalhe]);

  /**
   * O divisor da cobertura, vindo da janela CONSULTADA.
   *
   * Não pode sair de `janelaEfetiva`: essa acompanha o painel em edição, e usá-la faria
   * a cobertura mudar de valor enquanto o usuário mexe no filtro — sobre dados que
   * ainda são do recorte anterior. O número passaria a misturar duas janelas.
   */
  const mesesConsultados = consultado?.mesesJanela ?? 0;

  const total = useMemo(
    () => totalComparativo(fontes, ordem, caminhoDetalhe, mesesConsultados),
    [fontes, ordem, caminhoDetalhe, mesesConsultados]
  );

  const serie = useMemo(
    // A série usa as fontes COMPLETAS: recortá-la pelo mês em foco deixaria uma coluna
    // só, e aí não haveria como escolher outro mês nem ver o contexto que o justifica.
    () => serieComparativa(fontesVisiveis, ordem, caminhoDetalhe, escopo.medida),
    [fontesVisiveis, ordem, caminhoDetalhe, escopo.medida]
  );

  const arvore = useMemo(
    () => construirArvore(fontes, ordem, expandidos, mesesConsultados, escopo.medida),
    [fontes, ordem, expandidos, mesesConsultados, escopo.medida]
  );

  // ── Detalhe da célula clicada ─────────────────────────────────────────────
  const linhasDoDetalhe: LinhaPanorama[] = useMemo(() => {
    if (!detalhe) return [];
    const porFonte: Record<FonteDetalhe, readonly LinhaPanorama[]> = {
      saiu: fontes.saidas,
      entrou: fontes.entradas,
      interno: fontes.interno,
      externo: fontes.externo,
      inventario: fontes.inventario,
    };
    return filtrarPeloCaminho(porFonte[detalhe.fonte], ordem, detalhe.no.caminho);
  }, [detalhe, fontes, ordem]);

  const recorte = useMemo(
    () => (detalhe ? recorteDoCaminho(linhasDoDetalhe, 'comparativo') : null),
    [detalhe, linhasDoDetalhe]
  );

  const pedindo = (fonte: FonteDetalhe) =>
    pedirProdutos && detalhe?.fonte === fonte && recorte !== null;

  const produtosSaida = useSaidasProdutoQuery(
    pedindo('saiu') && paramsFluxo ? { ...paramsFluxo, ...recorte } : null
  );
  const produtosEntrada = useEntradasProdutoQuery(
    pedindo('entrou') && paramsFluxo ? { ...paramsFluxo, ...recorte } : null
  );
  const produtosMala = useEstoqueExternoQuery(
    pedindo('externo') ? { empresas, nivel: 'produto', ...recorte } : null
  );

  const consultaProdutos =
    detalhe?.fonte === 'saiu'
      ? produtosSaida
      : detalhe?.fonte === 'entrou'
        ? produtosEntrada
        : detalhe?.fonte === 'externo'
          ? produtosMala
          : null;

  /**
   * Os produtos da fonte aberta.
   *
   * ⚠️ Reaplicar o caminho é obrigatório nas fontes que vêm do servidor: o recorte
   * enviado ao gateway é um SUPERCONJUNTO (as dimensões viajam como listas
   * independentes e o servidor cruza todas) — ver `recorteDoCaminho`. Nas que já
   * chegaram inteiras, filtrar de novo é inofensivo.
   */
  const produtos: LinhaPanorama[] | null = useMemo(() => {
    if (!detalhe) return null;
    // Inventário e interno já chegam no grão de produto — não há segunda ida à rede.
    if (detalhe.fonte === 'inventario' || detalhe.fonte === 'interno') return linhasDoDetalhe;
    if (!consultaProdutos?.data) return null;
    return filtrarPeloCaminho(
      consultaProdutos.data as LinhaPanorama[],
      ordem,
      detalhe.no.caminho
    );
  }, [detalhe, linhasDoDetalhe, consultaProdutos?.data, ordem]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  const alternar = (chave: string) =>
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  const abrirDetalhe = (no: NoArvore, fonte: FonteDetalhe) => {
    setDetalhe({ no, fonte });
    setPedirProdutos(false);
  };

  const trocarTopo = (eixo: EixoId) => {
    atualizar({ abrirPor: eixo });
    // Expansões e detalhe são caminhos da árvore ANTIGA: mantê-los apontaria para nós
    // que deixaram de existir na nova ordem.
    setExpandidos(new Set());
    setDetalhe(null);
  };

  /**
   * Liga/desliga a camada de inventário.
   *
   * Desligar fecha o detalhe SE ele for o da contagem: a célula que o abriu deixa de
   * existir, e um painel sem linha de origem fica órfão na tela. Os detalhes das outras
   * fontes seguem abertos — nada aconteceu com eles.
   */
  const alternarInventario = (ligado: boolean) => {
    atualizar({ inventario: ligado });
    if (!ligado && detalhe?.fonte === 'inventario') {
      setDetalhe(null);
      setPedirProdutos(false);
    }
  };

  /**
   * Liga/desliga a camada de custo.
   *
   * Não fecha detalhe nenhum: ao contrário do inventário, custo não cria nem remove
   * célula clicável — ele só acrescenta uma sublinha às que já existem. O painel
   * aberto continua válido e ganha a margem no lugar.
   */
  const alternarCusto = (ligado: boolean) => atualizar({ custo: ligado });

  /**
   * Troca entre base fixa e base por data.
   *
   * Ir para "Data" **grava o intervalo que a base fixa já produzia**. É o que faz o
   * modo derivado funcionar (sem datas na URL não há modo "data") e, de quebra, é a
   * transição honesta: o número não se move no instante do clique, e o gestor edita a
   * partir do que estava valendo em vez de encarar dois campos vazios.
   */
  const alternarModoJanela = (modo: 'fixo' | 'data') => {
    if (modo === 'fixo') {
      atualizar({ janelaModo: 'fixo', janelaDe: null, janelaAte: null });
      return;
    }
    const base = janelaPadraoPorData(escopo.janela);
    atualizar({ janelaModo: 'data', janelaDe: base.de, janelaAte: base.ate });
  };

  /**
   * Liga/desliga o recorte de `DIVERSOS`.
   *
   * Fecha o detalhe e recolhe a árvore, ao contrário das camadas: este é o único
   * controle que REMOVE linhas. Um caminho expandido que passava por Diversos deixa de
   * existir, e o painel de detalhe ficaria mostrando números de um nó que sumiu.
   */
  const alternarDiversos = (ligado: boolean) => {
    atualizar({ ocultarDiversos: ligado });
    setExpandidos(new Set());
    setDetalhe(null);
    setPedirProdutos(false);
  };

  const tudoExpandido = () => {
    const chaves = chavesExpansiveis(fontes, ordem, mesesConsultados);
    setExpandidos((atual) => (atual.size > 0 ? new Set() : new Set(chaves)));
  };

  /**
   * O rótulo da base, congelado junto com a consulta.
   *
   * Recalculá-lo a partir do painel faria a tabela dizer "base set/24–jul/26" sobre
   * números apurados em mai–jul/26 — o pior tipo de erro, porque parece certo.
   */
  const rotuloBase = consultado
    ? janelaPorData(consultado.janelaDe, consultado.janelaAte).rotulo
    : '—';

  const temDado = arvore.length > 0;

  return (
    <AppLayout>
      <div className="space-y-5">
        <PageHeader
          title="Panorama"
          description="O que entrou, o que saiu e onde o estoque está — no mesmo lugar."
          isFetching={atualizando && !carregando}
        />

        <BarraEscopo
          de={escopo.de}
          ate={escopo.ate}
          empresa={escopo.empresa}
          baseData={escopo.baseData}
          medida={escopo.medida}
          janela={escopo.janela}
          janelaEfetiva={janelaEfetiva}
          modoJanela={modoJanela}
          janelaDe={escopo.janelaDe ?? ''}
          janelaAte={escopo.janelaAte ?? ''}
          custo={escopo.custo}
          inventario={escopo.inventario}
          ocultarDiversos={escopo.ocultarDiversos}
          carregando={carregando}
          onPeriodo={(de, ate) => atualizar({ de, ate, mes: null })}
          onEmpresa={(empresa) => atualizar({ empresa })}
          onBaseData={(baseData) => atualizar({ baseData })}
          onMedida={(medida) => atualizar({ medida })}
          onJanela={(janela) => atualizar({ janela })}
          onModoJanela={alternarModoJanela}
          onJanelaData={(janelaDe, janelaAte) => atualizar({ janelaDe, janelaAte })}
          pendente={pendente}
          jaConsultou={consultado !== null}
          impedimento={impedimento}
          onCusto={alternarCusto}
          onInventario={alternarInventario}
          onOcultarDiversos={(v) => alternarDiversos(v)}
          aberto={filtrosAbertos}
          onAberto={setFiltrosAbertos}
          onAtualizar={() => {
            // Sem pendência o clique é um "refazer": os parâmetros são os mesmos, então
            // `setConsultado` não mudaria nada e o React Query serviria do cache.
            if (pendente || consultado === null) consultar();
            else refazerConsultas();
          }}
        />

        {erro && (
          <Alert variant="destructive">
            <CloudOff className="h-4 w-4" />
            <AlertDescription>{erro.message}</AlertDescription>
          </Alert>
        )}

        {/* Primeira visita: ninguém consultou nada ainda. É diferente de "consultei e
            veio vazio", e as duas telas precisam dizer coisas diferentes — confundi-las
            faria a abertura normal parecer defeito ou base sem dados. */}
        {!consultado && !carregando && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <SlidersHorizontal className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">Pronto para consultar.</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Ajuste o período, a empresa e a base da cobertura acima e clique em
                <span className="font-semibold"> Consultar</span>.
              </p>
              <Button className="mt-4" onClick={consultar} disabled={!podeConsultar}>
                <Search className="h-4 w-4" />
                Consultar
              </Button>
            </CardContent>
          </Card>
        )}

        {carregando && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] min-w-[8.5rem] flex-1 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        )}

        {consultado && !carregando && !erro && !temDado && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Package className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nada no período escolhido.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Amplie o intervalo ou troque a empresa.
              </p>
            </CardContent>
          </Card>
        )}

        {consultado && !carregando && temDado && (
          <>
            <FaixaIndicadores
              total={total}
              medida={escopo.medida}
              baseCobertura={rotuloBase}
              mostrarInventario={escopo.inventario}
              mostrarCusto={escopo.custo}
            />

            {serie.length > 1 && (
              <Card className="rounded-2xl border border-border/80 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold tracking-tight">
                      Movimentação por mês
                    </CardTitle>
                    {escopo.mes && (
                      <button
                        type="button"
                        onClick={() => atualizar({ mes: null })}
                        className="rounded-lg bg-muted/60 px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Mês em foco · limpar
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <SerieMensal
                    pontos={serie}
                    medida={escopo.medida}
                    mesEmFoco={escopo.mes}
                    onMes={(mes) => atualizar({ mes })}
                  />
                </CardContent>
              </Card>
            )}

            <Card className="rounded-2xl border border-border/80 shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ver por
                    </span>
                    {EIXOS_TOPO.map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={escopo.abrirPor === id}
                        onClick={() => trocarTopo(id)}
                        title={eixoDe(id).exemplos}
                        className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                          escopo.abrirPor === id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {eixoDe(id).rotulo}
                      </button>
                    ))}
                  </div>
                  {/* Só sobrou o que molda a TABELA. Base de cobertura, camadas e
                      recortes foram para o painel de filtros: eles mudam o dado ou o
                      que ele significa, e um deles — a base da cobertura — mexia num
                      cartão da faixa de indicadores logo ACIMA da tabela em que morava.
                      Ver o cabeçalho de `BarraEscopo`. */}
                  <button
                    type="button"
                    onClick={tudoExpandido}
                    className="rounded-lg bg-muted/60 px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {expandidos.size > 0 ? 'Recolher tudo' : 'Expandir tudo'}
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {/* A dica existe porque a afordância sozinha não basta para quem nunca
                    viu a tela: os números abrem detalhe, e ninguém tenta clicar num
                    número por conta própria. */}
                <p className="pb-2 text-2xs text-muted-foreground">
                  Clique num número para ver o detalhe · no ícone{' '}
                  <Package size={11} className="inline" aria-hidden /> para os produtos.
                </p>
                <ArvoreComparativa
                  nos={arvore}
                  medida={escopo.medida}
                  baseCobertura={rotuloBase}
                  mostrarInventario={escopo.inventario}
                  mostrarCusto={escopo.custo}
                  caminhoAberto={detalhe ? chaveDoCaminho(detalhe.no.caminho) : undefined}
                  renderDetalhe={
                    detalhe
                      ? () => (
                          <PainelDetalhe
                            titulo={detalhe.no.rotulo}
                            fonte={detalhe.fonte}
                            linhas={linhasDoDetalhe}
                            medida={escopo.medida}
                            produtos={produtos}
                            mostrarCusto={escopo.custo}
                            carregandoProdutos={consultaProdutos?.isLoading ?? false}
                            erroProdutos={consultaProdutos?.error?.message ?? null}
                            onProdutos={() => setPedirProdutos(true)}
                            onFechar={() => {
                              setDetalhe(null);
                              setPedirProdutos(false);
                            }}
                          />
                        )
                      : undefined
                  }
                  rotuloPeriodo={
                    escopo.mes ? mesPorExtenso(escopo.mes) : `${dataCurta(escopo.de)} a ${dataCurta(escopo.ate)}`
                  }
                  expandidos={expandidos}
                  onAlternar={alternar}
                  onDetalhe={abrirDetalhe}
                  onProdutos={(no) => {
                    abrirDetalhe(no, 'saiu');
                    setPedirProdutos(true);
                  }}
                />
              </CardContent>
            </Card>

          </>
        )}
      </div>
    </AppLayout>
  );
}
