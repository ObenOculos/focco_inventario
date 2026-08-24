import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, CloudOff, Home, Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { empresasDaEscolha } from '@/hooks/useConsultaErpQuery';
import { dataCurta, janelaCobertura, JANELAS_COBERTURA, rotuloJanela } from '@/lib/panoramaPeriodo';
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
 * recorte percorrido ao trocar. Agora as cinco fontes convivem na mesma linha da
 * árvore, e o que antes era uma aba virou o detalhe de um número clicado.
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
 * do PERÍODO; interno/mala/contado são de HOJE. Filtrar por mês recorta o fluxo e
 * deixa o estoque como está — não existe "estoque de março" guardado em lugar nenhum.
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

export default function Panorama() {
  const { escopo, atualizar, ordem, EIXOS_TOPO } = usePanoramaEstado();

  // Navegação, não escopo: fica fora da URL de propósito (ver `usePanoramaEstado`).
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set());
  const [detalhe, setDetalhe] = useState<{ no: NoArvore; fonte: FonteDetalhe } | null>(null);
  const [pedirProdutos, setPedirProdutos] = useState(false);
  // Interface, não escopo: se fosse derivado do período, o botão "Datas" não conseguiria
  // abrir nada partindo do padrão — ver `BarraEscopo`.
  const [datasAbertas, setDatasAbertas] = useState(false);

  const empresas = empresasDaEscolha(escopo.empresa);
  const periodoValido = escopo.de <= escopo.ate;

  // A tela abre consultando: os parâmetros nascem preenchidos e não há botão barrando o
  // primeiro número. O `staleTime` de 10 min faz a volta a esta rota sair do cache.
  const paramsFluxo = periodoValido
    ? { de: escopo.de, ate: escopo.ate, empresas, base_data: escopo.baseData }
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
   * `empresas` e `base_data` acompanham o escopo: a cobertura da empresa 2 tem de ser
   * medida com as saídas da empresa 2.
   */
  const janela = janelaCobertura(escopo.janela);

  /**
   * A janela cabe dentro do período exibido? Então a demanda JÁ VEIO.
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
  const janelaCabeNoPeriodo = periodoValido && escopo.de <= janela.de && escopo.ate >= janela.ate;

  const demanda = useSaidasQuery(
    janelaCabeNoPeriodo
      ? null
      : { de: janela.de, ate: janela.ate, empresas, base_data: escopo.baseData }
  );
  const entradas = useEntradasQuery(paramsFluxo);
  const interno = useEstoqueInternoQuery({ empresas });
  const externo = useEstoqueExternoQuery({ empresas, nivel: 'categoria' });
  const inventariado = useEstoqueInventariadoQuery(true);

  const consultas = useMemo(
    () => [saidas, entradas, interno, externo, inventariado, demanda],
    [saidas, entradas, interno, externo, inventariado, demanda]
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
    if (!janelaCabeNoPeriodo) return demanda.data ?? [];
    return (saidas.data ?? []).filter((l) => l.mes >= janela.de && l.mes <= janela.ate);
  }, [janelaCabeNoPeriodo, demanda.data, saidas.data, janela.de, janela.ate]);
  const carregando = consultas.some((q) => q.isLoading);
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
      inventario: inventariado.data ?? [],
      demanda: linhasDemanda,
    }),
    [saidas.data, entradas.data, interno.data, externo.data, inventariado.data, linhasDemanda]
  );

  /** O mês em foco recorta o FLUXO; o estoque continua sendo o de hoje. */
  const fontes = useMemo(
    () => recortarPorMes(fontesCompletas, escopo.mes),
    [fontesCompletas, escopo.mes]
  );

  /** O recorte do painel de detalhe — vazio quando nada está aberto. */
  const caminhoDetalhe = useMemo(() => detalhe?.no.caminho ?? [], [detalhe]);

  const total = useMemo(
    () => totalComparativo(fontes, ordem, caminhoDetalhe, escopo.janela),
    [fontes, ordem, caminhoDetalhe, escopo.janela]
  );

  const serie = useMemo(
    // A série usa as fontes COMPLETAS: recortá-la pelo mês em foco deixaria uma coluna
    // só, e aí não haveria como escolher outro mês nem ver o contexto que o justifica.
    () => serieComparativa(fontesCompletas, ordem, caminhoDetalhe, escopo.medida),
    [fontesCompletas, ordem, caminhoDetalhe, escopo.medida]
  );

  const arvore = useMemo(
    () => construirArvore(fontes, ordem, expandidos, escopo.janela, escopo.medida),
    [fontes, ordem, expandidos, escopo.janela, escopo.medida]
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

  const tudoExpandido = () => {
    const chaves = chavesExpansiveis(fontes, ordem, escopo.janela);
    setExpandidos((atual) => (atual.size > 0 ? new Set() : new Set(chaves)));
  };

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
          datasAbertas={datasAbertas}
          carregando={carregando}
          onPeriodo={(de, ate) => atualizar({ de, ate, mes: null })}
          onEmpresa={(empresa) => atualizar({ empresa })}
          onBaseData={(baseData) => atualizar({ baseData })}
          onMedida={(medida) => atualizar({ medida })}
          onDatasAbertas={setDatasAbertas}
          onAtualizar={() => consultas.forEach((q) => void q.refetch())}
        />

        {erro && (
          <Alert variant="destructive">
            <CloudOff className="h-4 w-4" />
            <AlertDescription>{erro.message}</AlertDescription>
          </Alert>
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

        {!carregando && !erro && !temDado && (
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

        {!carregando && temDado && (
          <>
            <FaixaIndicadores
              total={total}
              medida={escopo.medida}
              baseCobertura={rotuloJanela(escopo.janela)}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="cursor-help text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
                      title="Quantos meses completos servem de base para a cobertura. O mês corrente fica de fora por ser parcial."
                    >
                      Cobertura ⓘ
                    </span>
                    {JANELAS_COBERTURA.map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={escopo.janela === n}
                        onClick={() => atualizar({ janela: n })}
                        title={`Base: ${rotuloJanela(n)}`}
                        className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                          escopo.janela === n
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {n}m
                      </button>
                    ))}
                  </div>
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
                  baseCobertura={rotuloJanela(escopo.janela)}
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
