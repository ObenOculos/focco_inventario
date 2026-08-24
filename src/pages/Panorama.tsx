import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmentado } from '@/components/comparativo/Segmentado';
import { ChevronRight, CloudOff, Home, Package, Search } from 'lucide-react';
import { endOfMonth, format, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { empresasDaEscolha, type EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';
import {
  useEntradasProdutoQuery,
  useEntradasQuery,
  useEstoqueExternoQuery,
  useEstoqueInternoQuery,
  useEstoqueInventariadoQuery,
  useSaidasProdutoQuery,
  useSaidasQuery,
  type Lente,
  type LenteEstoque,
  type LinhaPanorama,
  type ParametrosEstoque,
  type ParametrosPanorama,
  type Visao,
} from '@/hooks/usePanoramaQuery';
import {
  agrupar,
  agruparPorProduto,
  comEixoNoTopo,
  eixoDe,
  EIXOS_DA_VISAO,
  filtrarPeloCaminho,
  MEDIDAS,
  ORDEM_PADRAO,
  recorteDoCaminho,
  serieMensal,
  somar,
  type EixoId,
  type Medida,
  type NoAgregado,
} from '@/lib/panorama';
import {
  compararPorEixo,
  ordenarComparativo,
  totalComparativo,
  type FontesComparativo,
  type NoComparativo,
} from '@/lib/panoramaComparativo';

/**
 * Panorama — a leitura gerencial da movimentação, ao lado da Consulta ao ERP.
 *
 * As duas telas bebem da mesma fonte e respondem perguntas opostas. A Consulta é
 * AUDITORIA: cada linha de nota, para achar operação emitida errada. Esta é
 * ANÁLISE: quanto entrou, quanto saiu, de quê e por quê — e por isso o que atravessa
 * a rede já vem somado pelo Postgres. Juntar as duas numa tela só pioraria as duas,
 * porque o formato do dado é diferente antes de a interface começar.
 *
 * Como se lê, de cima para baixo:
 *
 *   1. **Parâmetros** — a única parte que custa uma ida ao ERP. Dispara no clique.
 *   2. **Indicadores** — os totais do recorte aberto, não do período inteiro: eles
 *      acompanham o drill-down, senão a tela mostraria um número que não é o da
 *      lista logo abaixo.
 *   3. **Série mensal** — quando o volume aconteceu. Só no fluxo; saldo não tem.
 *   4. **Árvore** — um nível por vez, na ordem que o gestor escolher, até o produto.
 *
 * Quantidade e valor nunca se misturam num mesmo número: a medida ativa é uma só, e
 * trocá-la reordena a lista. É de propósito — a bonificação lidera em unidades e
 * some em valor, e é essa troca de posição que responde "onde está o dinheiro"
 * contra "onde está o volume".
 *
 * As três lentes usam a MESMA máquina de `lib/panorama.ts`. O que muda são os eixos
 * e o vocabulário: "tipo de saída" numa, "tipo de entrada" e "origem" na outra,
 * "vendedor" e "situação do cadastro" na terceira.
 *
 * **Estoque é foto, não fluxo**, e a tela muda de forma por causa disso: some o
 * período, some a série mensal, e aparecem os dois avisos que o número exige — o
 * interno só desce até o MODELO (o ERP não guarda saldo por cor) e o externo é a
 * última CONTAGEM de cada vendedor, cada uma de um dia diferente. Nenhum dos dois é
 * detalhe de implementação: são o que separa ler o número de acreditar nele.
 */

const HOJE = new Date();
const FORMATO_ISO = 'yyyy-MM-dd';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const LENTES: { valor: Lente; rotulo: string }[] = [
  { valor: 'saidas', rotulo: 'Saídas' },
  { valor: 'entradas', rotulo: 'Entradas' },
  { valor: 'estoque', rotulo: 'Estoque' },
  { valor: 'comparativo', rotulo: 'Comparativo' },
];

/**
 * Os três estoques. A ordem conta uma história: sai da empresa, vai para a mala, e a
 * mala tem duas leituras — a que o ERP calcula e a que o representante contou.
 */
const ONDE_ESTA: { valor: LenteEstoque; rotulo: string }[] = [
  { valor: 'interno', rotulo: 'Interno' },
  { valor: 'externo', rotulo: 'Externo' },
  { valor: 'inventario', rotulo: 'Inventário' },
];

/**
 * Atalhos de período.
 *
 * O padrão é o ANO CORRENTE até hoje — é o recorte que o gestor pede primeiro em
 * praticamente toda pergunta ("quanto vendemos esse ano"). Antes o padrão eram os
 * seis meses anteriores, que atravessava a virada do ano e misturava dois exercícios
 * sem o usuário pedir.
 *
 * Os atalhos contam para TRÁS a partir do mês corrente e incluem o mês corrente
 * inteiro (por isso `endOfMonth`, limitado a hoje na hora de aplicar): "trimestre" é
 * este mês e os dois anteriores, não os 90 dias corridos. É como se lê um fechamento.
 */
const ATALHOS = [
  { id: 'trimestre', rotulo: 'Trimestre', meses: 3 },
  { id: 'semestre', rotulo: 'Semestre', meses: 6 },
  { id: 'ano', rotulo: 'Ano', meses: 0 },
] as const;

type AtalhoId = (typeof ATALHOS)[number]['id'];

/** Intervalo de um atalho. `meses: 0` é o ano corrente, de 1º de janeiro até hoje. */
function intervaloDoAtalho(meses: number): { de: string; ate: string } {
  const inicio = meses === 0 ? startOfYear(HOJE) : startOfMonth(subMonths(HOJE, meses - 1));
  // O fim é hoje, nunca o fim do mês: prometer dados de um dia que não chegou faria a
  // última coluna da série parecer uma queda de vendas.
  const fim = HOJE < endOfMonth(HOJE) ? HOJE : endOfMonth(HOJE);
  return { de: format(inicio, FORMATO_ISO), ate: format(fim, FORMATO_ISO) };
}

/** Legenda do intervalo escolhido, ao lado dos atalhos. */
const rotuloPeriodo = (de: string, ate: string) =>
  `${dataCurta(de)} a ${dataCurta(ate)}`;

/** Formata na medida ativa. É o único lugar que decide como cada grandeza aparece. */
const formatar = (valor: number, medida: Medida) =>
  medida === 'valor' ? MOEDA.format(valor) : INTEIRO.format(valor);

const dataCurta = (iso: string) => {
  try {
    return format(parseISO(iso), 'dd/MM/yy');
  } catch {
    return iso;
  }
};

const mesCurto = (iso: string) => {
  try {
    return format(parseISO(iso), 'MMM/yy');
  } catch {
    return iso;
  }
};

/** Cartão de indicador. Mesmo desenho do resumo do Comparativo — um só vocabulário. */
function Indicador({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio: string }) {
  return (
    <div className="min-w-[9rem] flex-1 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 shadow-xs">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="text-lg font-bold tabular-nums">{valor}</p>
      <p className="truncate text-2xs tabular-nums text-muted-foreground">{apoio}</p>
    </div>
  );
}

/**
 * Série mensal — colunas de uma série só.
 *
 * Uma série, uma cor: colorir cada mês de um tom diferente dobraria a codificação da
 * altura na matiz e gastaria o único canal livre com informação que a barra já dá.
 * A escala é a do maior mês do recorte, não a do período inteiro, para o desenho não
 * achatar ao descer na árvore.
 */
function SerieMensal({
  pontos,
  medida,
}: {
  pontos: { mes: string; quantidade: number; valor: number }[];
  medida: Medida;
}) {
  const maximo = Math.max(...pontos.map((p) => p[medida]), 0);
  if (pontos.length === 0 || maximo === 0) return null;

  return (
    <div className="flex items-end gap-[2px] sm:gap-1" role="img" aria-label="Movimentação por mês">
      {pontos.map((p) => {
        const fracao = p[medida] / maximo;
        return (
          <div key={p.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            {/* `title` é a camada de hover: o valor exato sem poluir a tela com um
                número por coluna, que ninguém lê. */}
            <div
              className="flex h-24 w-full items-end"
              title={`${mesCurto(p.mes)}: ${formatar(p[medida], medida)}`}
            >
              <div
                className="w-full rounded-t bg-primary transition-[height]"
                style={{ height: `${Math.max(fracao * 100, 2)}%` }}
              />
            </div>
            <span className="truncate text-2xs text-muted-foreground">{mesCurto(p.mes)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Linha da árvore: rótulo, barra de participação e as duas medidas.
 *
 * A barra é a MESMA cor em todas as linhas. Escurecer as maiores seria colorir por
 * ranking — a lista já está ordenada e a barra já mostra o tamanho.
 */
function LinhaNivel({
  no,
  medida,
  onAbrir,
}: {
  no: NoAgregado;
  medida: Medida;
  onAbrir?: () => void;
}) {
  const conteudo = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold">{no.rotulo}</span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {PORCENTAGEM.format(no.participacao)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${no.participacao * 100}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{formatar(no[medida], medida)}</p>
          <p className="text-2xs tabular-nums text-muted-foreground">
            {medida === 'valor' ? `${INTEIRO.format(no.quantidade)} un.` : MOEDA.format(no.valor)}
          </p>
        </div>
        {onAbrir && <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
      </div>
    </>
  );

  if (!onAbrir) {
    return <div className="flex items-center gap-4 px-3.5 py-3">{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-4 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-muted/30"
    >
      {conteudo}
    </button>
  );
}

/**
 * Linha do comparativo: as quatro fontes de um recorte, lado a lado.
 *
 * A barra mostra a divisão INTERNO × EXTERNO do estoque — as duas partes disjuntas do
 * mesmo saldo. É part-to-whole de dois segmentos, então uma matiz com dois níveis
 * basta; e os dois números aparecem escritos ao lado, de modo que a identidade nunca
 * depende só da cor.
 */
function LinhaComparativa({
  no,
  medida,
  onAbrir,
}: {
  no: NoComparativo;
  medida: Medida;
  onAbrir?: () => void;
}) {
  const estoqueValor = no.interno.valor + no.externo.valor;
  const total = medida === 'valor' ? estoqueValor : no.estoqueTotal;
  const parteInterno = medida === 'valor' ? no.interno.valor : no.interno.quantidade;
  const fracaoInterno = total > 0 ? parteInterno / total : 0;

  const numero = (t: { quantidade: number; valor: number }) =>
    medida === 'valor' ? MOEDA.format(t.valor) : INTEIRO.format(t.quantidade);

  const conteudo = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold">{no.rotulo}</span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {no.cobertura === null ? 'sem saída' : `${no.cobertura.toFixed(1)} meses`}
          </span>
        </div>
        {/* 2px de folga entre os segmentos, e não uma borda: separar com traço soma
            ruído a uma barra que já é fina. */}
        <div className="flex h-1.5 w-full gap-[2px] overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${fracaoInterno * 100}%` }}
          />
          <div
            className="h-full flex-1 rounded-full bg-primary/35 transition-[width]"
          />
        </div>
        <p className="text-2xs tabular-nums text-muted-foreground">
          Interno {numero(no.interno)} · Externo {numero(no.externo)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <div className="hidden text-right sm:block">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Entrou / Saiu
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {numero(no.entrou)} / {numero(no.saiu)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">
            {medida === 'valor' ? MOEDA.format(estoqueValor) : INTEIRO.format(no.estoqueTotal)}
          </p>
          <p className="text-2xs tabular-nums text-muted-foreground">em estoque</p>
        </div>
        {onAbrir && <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
      </div>
    </>
  );

  if (!onAbrir) return <div className="flex items-center gap-4 px-3.5 py-3">{conteudo}</div>;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-4 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-muted/30"
    >
      {conteudo}
    </button>
  );
}

export default function Panorama() {
  // ── Parâmetros (custam uma ida ao ERP) ────────────────────────────────────
  const [de, setDe] = useState(intervaloDoAtalho(0).de);
  const [ate, setAte] = useState(intervaloDoAtalho(0).ate);
  const [empresa, setEmpresa] = useState<EscolhaEmpresa>('ambas');
  const [baseData, setBaseData] = useState<'movimento' | 'emissao'>('movimento');
  const [consulta, setConsulta] = useState<ParametrosPanorama | null>(null);
  const [consultaEstoque, setConsultaEstoque] = useState<ParametrosEstoque | null>(null);

  // ── Leitura (instantânea, sobre o que já veio) ────────────────────────────
  const [lente, setLente] = useState<Lente>('saidas');
  const [subLente, setSubLente] = useState<LenteEstoque>('interno');
  const [medida, setMedida] = useState<Medida>('quantidade');
  const [ordem, setOrdem] = useState<EixoId[]>(ORDEM_PADRAO.saidas);
  const [caminho, setCaminho] = useState<string[]>([]);
  const [rotulos, setRotulos] = useState<string[]>([]);
  const [verProdutos, setVerProdutos] = useState(false);

  /** Lente e submodo colapsados: é por esta chave que eixos e ordem são escolhidos. */
  const visao: Visao = lente === 'estoque' ? `estoque-${subLente}` : lente;
  const ehEstoque = lente === 'estoque';
  const ehComparativo = lente === 'comparativo';

  // Todas as consultas são declaradas sempre — hook não pode ser condicional. As
  // inativas recebem `null` e ficam paradas, sem tocar na rede.
  // O comparativo precisa das QUATRO ao mesmo tempo — é a única visão que cruza fontes.
  const saidas = useSaidasQuery(lente === 'saidas' || ehComparativo ? consulta : null);
  const entradas = useEntradasQuery(lente === 'entradas' || ehComparativo ? consulta : null);
  const interno = useEstoqueInternoQuery(
    visao === 'estoque-interno' || ehComparativo ? consultaEstoque : null
  );
  const externo = useEstoqueExternoQuery(
    (visao === 'estoque-externo' || ehComparativo) && consultaEstoque
      ? {
          ...consultaEstoque,
          // O comparativo só lê categoria: ele não desce ao produto, porque os grãos
          // das fontes não batem lá.
          nivel: !ehComparativo && verProdutos ? 'produto' : 'categoria',
        }
      : null
  );
  const inventariado = useEstoqueInventariadoQuery(
    visao === 'estoque-inventario' && consultaEstoque !== null
  );

  const ativa =
    visao === 'saidas'
      ? saidas
      : visao === 'entradas'
        ? entradas
        : visao === 'estoque-interno'
          ? interno
          : visao === 'estoque-externo'
            ? externo
            : inventariado;

  const linhas: LinhaPanorama[] = useMemo(() => ativa.data ?? [], [ativa.data]);

  const fontes: FontesComparativo = useMemo(
    () => ({
      saidas: saidas.data ?? [],
      entradas: entradas.data ?? [],
      interno: interno.data ?? [],
      externo: externo.data ?? [],
    }),
    [saidas.data, entradas.data, interno.data, externo.data]
  );

  const quatro = [saidas, entradas, interno, externo];
  const isLoading = ehComparativo ? quatro.some((q) => q.isLoading) : ativa.isLoading;
  const isFetching = ehComparativo ? quatro.some((q) => q.isFetching) : ativa.isFetching;
  // A PRIMEIRA falha manda: se o ERP caiu, as quatro vão falhar pelo mesmo motivo, e
  // repetir a mensagem quatro vezes não ajuda ninguém.
  const error = ehComparativo ? quatro.find((q) => q.error)?.error : ativa.error;
  const consultou = ehComparativo
    ? consulta !== null && consultaEstoque !== null
    : ehEstoque
      ? consultaEstoque !== null
      : consulta !== null;

  /** Meses do período pedido, para a cobertura. Mínimo 1: um mês parcial é um mês. */
  const mesesDoPeriodo = useMemo(() => {
    try {
      const a = parseISO(de);
      const b = parseISO(ate);
      const n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
      return Math.max(n, 1);
    } catch {
      return 1;
    }
  }, [de, ate]);

  const temDadoComparativo =
    ehComparativo && quatro.some((q) => (q.data?.length ?? 0) > 0);

  const doRecorte = useMemo(
    () => filtrarPeloCaminho(linhas, ordem, caminho),
    [linhas, ordem, caminho]
  );

  const totais = useMemo(() => somar(doRecorte), [doRecorte]);
  const serie = useMemo(() => serieMensal(doRecorte), [doRecorte]);

  /**
   * Custo do estoque, quando o ERP o informa.
   *
   * Só o interno tem: o custo mora em `eq_produtoespecifico`, e o externo vem dos
   * inventários, onde não existe custo nenhum. Fica fora de `somar` de propósito —
   * é medida de uma lente só, e promovê-la a comum faria as outras carregarem um
   * zero que parece informação.
   */
  const custoTotal = useMemo(
    () => doRecorte.reduce((s, l) => s + (Number(l.custo) || 0), 0),
    [doRecorte]
  );

  const eixoAtual: EixoId | undefined = ordem[caminho.length];

  const nosComparativo = useMemo(
    () =>
      ehComparativo && eixoAtual
        ? ordenarComparativo(
            compararPorEixo(fontes, eixoAtual, ordem, caminho, mesesDoPeriodo),
            medida
          )
        : [],
    [ehComparativo, fontes, eixoAtual, ordem, caminho, mesesDoPeriodo, medida]
  );

  const totalCompar = useMemo(
    () => (ehComparativo ? totalComparativo(fontes, ordem, caminho, mesesDoPeriodo) : null),
    [ehComparativo, fontes, ordem, caminho, mesesDoPeriodo]
  );
  const nos = useMemo(
    () => (eixoAtual ? agrupar(doRecorte, eixoAtual, medida) : []),
    [doRecorte, eixoAtual, medida]
  );

  // A folha só é pedida quando há recorte: no topo, o "recorte" é o período inteiro e
  // a consulta voltaria com todos os produtos — a listagem imensa que este módulo
  // existe para evitar.
  //
  // No ESTOQUE ela nunca é pedida: aquelas consultas já vêm no grão de produto (são
  // ~1.800 linhas), então a folha é um agrupamento local e sai de graça.
  const parametrosProduto: ParametrosPanorama | null =
    !ehEstoque && verProdutos && consulta && caminho.length > 0
      ? { ...consulta, ...recorteDoCaminho(doRecorte, visao) }
      : null;

  const produtosSaida = useSaidasProdutoQuery(lente === 'saidas' ? parametrosProduto : null);
  const produtosEntrada = useEntradasProdutoQuery(lente === 'entradas' ? parametrosProduto : null);
  const folha = lente === 'saidas' ? produtosSaida : produtosEntrada;

  const nosProdutos = useMemo(() => {
    // Anotado como `LinhaPanorama[]` para colapsar a união dos quatro tipos de linha:
    // sem isso o genérico de `filtrarPeloCaminho` se prende ao primeiro membro.
    //
    // ⚠️ Reaplicar o caminho é OBRIGATÓRIO no fluxo: o recorte enviado ao gateway é um
    // SUPERCONJUNTO (as dimensões vão como listas independentes e o servidor cruza
    // todas) — ver `recorteDoCaminho`. No estoque é inofensivo: as linhas já são as
    // do recorte, e filtrar de novo não muda nada.
    // O externo é a exceção entre os estoques: a folha dele vem do servidor (o nível
    // de produto tem 16.500 linhas e não cabe na resposta de entrada), então `linhas`
    // já É a folha quando `verProdutos` está ligado.
    const linhasFolha: LinhaPanorama[] = ehEstoque ? doRecorte : (folha.data ?? []);
    return agruparPorProduto(filtrarPeloCaminho(linhasFolha, ordem, caminho), medida);
  }, [ehEstoque, doRecorte, folha.data, ordem, caminho, medida]);

  /**
   * Janela das contagens do estoque externo.
   *
   * É o aviso que a tela não pode omitir: cada vendedor tem uma data própria, então
   * o total mistura fotos de momentos diferentes e nunca existiu num único instante.
   */
  const janelaContagens = useMemo(() => {
    if (visao !== 'estoque-externo') return null;
    const datas = doRecorte.map((l) => l.data_inventario).filter((d): d is string => !!d).sort();
    return datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null;
  }, [visao, doRecorte]);

  /** Volta a árvore para a raiz. Toda troca de lente, eixo ou consulta passa por aqui. */
  const recomecar = () => {
    setCaminho([]);
    setRotulos([]);
    setVerProdutos(false);
  };

  const consultar = () => {
    recomecar();
    if (ehComparativo) {
      setConsulta({ de, ate, empresas: empresasDaEscolha(empresa), base_data: baseData });
      setConsultaEstoque({ empresas: empresasDaEscolha(empresa) });
      return;
    }
    if (ehEstoque) {
      // Estoque não tem período — é foto, não fluxo. E o externo não passa nem pela
      // empresa: ele sai dos inventários, que são por vendedor.
      setConsultaEstoque({ empresas: empresasDaEscolha(empresa) });
      return;
    }
    setConsulta({
      de,
      ate,
      empresas: empresasDaEscolha(empresa),
      base_data: baseData,
    });
  };

  /** Aplica a ordem padrão da visão e volta a árvore para a raiz. */
  const irPara = (novaVisao: Visao) => {
    // A ordem volta ao padrão DA VISÃO: os eixos não são os mesmos, e manter a ordem
    // anterior deixaria "Tipo de saída" no topo de uma árvore de entradas, onde ele
    // agrupa tudo em "Sem classificação".
    setOrdem(ORDEM_PADRAO[novaVisao]);
    recomecar();
  };

  const trocarLente = (nova: Lente) => {
    setLente(nova);
    irPara(nova === 'estoque' ? `estoque-${subLente}` : nova);
  };

  const trocarSubLente = (nova: LenteEstoque) => {
    setSubLente(nova);
    irPara(`estoque-${nova}`);
  };

  const descer = (no: NoAgregado) => {
    setCaminho((c) => [...c, no.chave]);
    // O rótulo viaja junto porque a chave nem sempre é legível: em "Origem" ela é o
    // código do cadastro, e a trilha mostraria um número.
    setRotulos((r) => [...r, no.rotulo]);
    setVerProdutos(false);
  };

  const voltarPara = (n: number) => {
    setCaminho((c) => c.slice(0, n));
    setRotulos((r) => r.slice(0, n));
    setVerProdutos(false);
  };

  const trocarTopo = (eixo: EixoId) => {
    setOrdem(comEixoNoTopo(ordem, eixo));
    recomecar();
  };

  const periodoInvalido = de > ate;
  const rotuloMovimento = lente === 'saidas' ? 'saíram' : 'entraram';

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Panorama"
          description="Movimentação somada no ERP: o que entrou, o que saiu, de quê e por qual motivo."
          isFetching={isFetching && !isLoading}
          action={
            <Segmentado
              nome="Lente"
              opcoes={LENTES}
              valor={lente}
              onValor={(v) => trocarLente(v)}
            />
          }
        />

        {/* 1. Parâmetros — a parte cara */}
        <Card className="rounded-2xl border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold tracking-tight">
                {ehEstoque ? 'Onde está o estoque' : 'Período'}
              </CardTitle>
              {ehEstoque && (
                <Segmentado
                  nome="Estoque interno ou externo"
                  opcoes={ONDE_ESTA}
                  valor={subLente}
                  onValor={(v) => trocarSubLente(v)}
                  tamanho="sm"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Atalhos antes dos campos: é por eles que se escolhe o período em quase
                toda consulta, e as datas soltas ficam para o recorte incomum. */}
            {!ehEstoque && (
              <div className="flex flex-wrap items-center gap-2">
                {ATALHOS.map((a) => {
                  const alvo = intervaloDoAtalho(a.meses);
                  const ativo = de === alvo.de && ate === alvo.ate;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => {
                        setDe(alvo.de);
                        setAte(alvo.ate);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                        ativo
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {a.rotulo}
                    </button>
                  );
                })}
                <span className="text-2xs text-muted-foreground">
                  {rotuloPeriodo(de, ate)}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {/* Estoque não tem período: é foto, não fluxo. Campos de data aqui
                  prometeriam um histórico de saldo que o ERP não guarda. */}
              {!ehEstoque && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="panorama-de">De</Label>
                    <Input
                      id="panorama-de"
                      type="date"
                      value={de}
                      onChange={(e) => setDe(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="panorama-ate">Até</Label>
                    <Input
                      id="panorama-ate"
                      type="date"
                      value={ate}
                      onChange={(e) => setAte(e.target.value)}
                    />
                  </div>
                </>
              )}
              {/* O INVENTÁRIO sai das contagens, que são por vendedor e não por
                  empresa — oferecer o seletor ali seria um filtro que não filtra. */}
              {visao !== 'estoque-inventario' && (
                <div className="space-y-1.5">
                  <Label htmlFor="panorama-empresa">Empresa</Label>
                  <Select value={empresa} onValueChange={(v) => setEmpresa(v as EscolhaEmpresa)}>
                    <SelectTrigger id="panorama-empresa">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambas">Ambas</SelectItem>
                      <SelectItem value="1">Empresa 1</SelectItem>
                      <SelectItem value="2">Empresa 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!ehEstoque && (
                <div className="space-y-1.5">
                  <Label htmlFor="panorama-base">Data base</Label>
                  <Select
                    value={baseData}
                    onValueChange={(v) => setBaseData(v as 'movimento' | 'emissao')}
                  >
                    <SelectTrigger id="panorama-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="movimento">Movimento da nota</SelectItem>
                      <SelectItem value="emissao">Emissão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={consultar}
                  disabled={(!ehEstoque && periodoInvalido) || isLoading}
                >
                  <Search className="h-4 w-4" />
                  {isLoading ? 'Consultando' : 'Consultar'}
                </Button>
              </div>
            </div>
            {!ehEstoque && periodoInvalido && (
              <p className="mt-3 text-sm text-destructive-strong">
                A data inicial não pode ser posterior à final.
              </p>
            )}
            {visao === 'estoque-interno' && (
              <p className="mt-3 text-sm text-muted-foreground">
                Saldo do Ciclone na empresa. Desce até o <strong>modelo</strong> — o ERP não
                guarda saldo por cor.
              </p>
            )}
            {visao === 'estoque-externo' && (
              <p className="mt-3 text-sm text-muted-foreground">
                A mala pelo <strong>saldo que o ERP calcula</strong>: mercadoria nossa em poder
                de terceiros. Compare com o Inventário — é a mesma mercadoria contada de outro
                jeito.
              </p>
            )}
            {visao === 'estoque-inventario' && (
              <p className="mt-3 text-sm text-muted-foreground">
                A mala pelo que o representante <strong>contou</strong> (último inventário
                aprovado). Não é saldo ao vivo: cada um tem uma data de contagem, e a última
                pode ser parcial.
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <CloudOff className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] min-w-[9rem] flex-1 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}

        {consultou && !isLoading && !error && linhas.length === 0 && !temDadoComparativo && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Package className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                {ehEstoque
                  ? 'Nenhum produto com saldo.'
                  : `Nenhuma movimentação de ${lente === 'saidas' ? 'saída' : 'entrada'} no período.`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ehEstoque
                  ? 'Troque a empresa ou confira se há inventário aprovado.'
                  : 'Amplie o intervalo ou troque a empresa.'}
              </p>
            </CardContent>
          </Card>
        )}

        {!consultou && !isLoading && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Search className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">Escolha o período e consulte.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A consulta atravessa a VPN até o Ciclone — por isso ela só roda no clique.
              </p>
            </CardContent>
          </Card>
        )}

        {(linhas.length > 0 || temDadoComparativo) && !isLoading && (
          <>
            {/* 2. Indicadores — do recorte aberto, não do período inteiro */}
            {totalCompar ? (
              <div className="flex flex-wrap gap-3">
                <Indicador
                  rotulo="Entrou"
                  valor={INTEIRO.format(totalCompar.entrou.quantidade)}
                  apoio={MOEDA.format(totalCompar.entrou.valor)}
                />
                <Indicador
                  rotulo="Saiu"
                  valor={INTEIRO.format(totalCompar.saiu.quantidade)}
                  apoio={MOEDA.format(totalCompar.saiu.valor)}
                />
                <Indicador
                  rotulo="Saldo do período"
                  valor={`${totalCompar.saldoPeriodo >= 0 ? '+' : ''}${INTEIRO.format(totalCompar.saldoPeriodo)}`}
                  apoio={`${INTEIRO.format(totalCompar.paraMala)} enviados à mala`}
                />
                <Indicador
                  rotulo="Estoque hoje"
                  valor={INTEIRO.format(totalCompar.estoqueTotal)}
                  apoio={`${INTEIRO.format(totalCompar.interno.quantidade)} interno · ${INTEIRO.format(totalCompar.externo.quantidade)} externo`}
                />
                <Indicador
                  rotulo="Cobertura"
                  valor={
                    totalCompar.cobertura === null
                      ? '—'
                      : `${totalCompar.cobertura.toFixed(1)} meses`
                  }
                  apoio={`no ritmo de ${mesesDoPeriodo} ${mesesDoPeriodo === 1 ? 'mês' : 'meses'}`}
                />
              </div>
            ) : (
            <div className="flex flex-wrap gap-3">
              <Indicador
                rotulo="Unidades"
                valor={INTEIRO.format(totais.quantidade)}
                apoio={`${INTEIRO.format(totais.linhas)} ${ehEstoque ? 'produtos' : 'linhas de nota'}`}
              />
              <Indicador
                rotulo="Valor"
                valor={MOEDA.format(totais.valor)}
                apoio={
                  totais.quantidade > 0
                    ? `${MOEDA.format(totais.valor / totais.quantidade)} por unidade`
                    : '—'
                }
              />
              {janelaContagens ? (
                <Indicador
                  rotulo="Contagens"
                  valor={
                    janelaContagens.de === janelaContagens.ate
                      ? dataCurta(janelaContagens.de)
                      : `${dataCurta(janelaContagens.de)} – ${dataCurta(janelaContagens.ate)}`
                  }
                  apoio="Datas diferentes por vendedor"
                />
              ) : ehEstoque ? (
                <Indicador
                  rotulo="Custo"
                  valor={MOEDA.format(custoTotal)}
                  apoio={custoTotal !== 0 ? `${MOEDA.format(totais.valor - custoTotal)} de margem` : '—'}
                />
              ) : (
                <Indicador
                  rotulo="Meses"
                  valor={INTEIRO.format(serie.length)}
                  apoio={
                    serie.length > 0
                      ? `${mesCurto(serie[0].mes)} a ${mesCurto(serie[serie.length - 1].mes)}`
                      : '—'
                  }
                />
              )}
            </div>
            )}

            {/* 3. Quando */}
            {serie.length > 1 && !ehComparativo && (
              <Card className="rounded-2xl border border-border/80 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Quanto {rotuloMovimento} por mês · {medida === 'valor' ? 'valor' : 'unidades'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SerieMensal pontos={serie} medida={medida} />
                </CardContent>
              </Card>
            )}

            {/* 4. Árvore */}
            <Card className="rounded-2xl border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {verProdutos || !eixoAtual
                      ? 'Produtos'
                      : `Por ${eixoDe(eixoAtual).rotulo.toLowerCase()}`}
                  </CardTitle>
                  <Segmentado
                    nome="Medida"
                    opcoes={MEDIDAS}
                    valor={medida}
                    // Arrow, e não `setMedida` direto: passar o setter faz o
                    // `SetStateAction<Medida>` disputar a inferência de `T` com as
                    // opções, e o TypeScript alarga os dois para `string`.
                    onValor={(v) => setMedida(v)}
                    tamanho="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Ordem de leitura: trocar o primeiro eixo é o que transforma a mesma
                    consulta em "por onde saiu cada marca" ou "que marcas cada tipo de
                    saída levou". Só faz sentido na raiz — no meio do caminho, mudaria
                    o significado dos passos já dados. */}
                {caminho.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Abrir por
                    </span>
                    {EIXOS_DA_VISAO[visao].map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={ordem[0] === id}
                        onClick={() => trocarTopo(id)}
                        className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                          ordem[0] === id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {eixoDe(id).rotulo}
                      </button>
                    ))}
                  </div>
                )}

                {/* Trilha — só navegação. O total do recorte tem um lugar só, os
                    indicadores acima. */}
                {caminho.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => voltarPara(0)}
                      aria-label="Voltar ao início"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    >
                      <Home size={14} />
                      Tudo
                    </button>
                    {caminho.map((chave, i) => {
                      const ultimo = i === caminho.length - 1;
                      return (
                        <span key={`${i}-${chave}`} className="flex items-center gap-1">
                          <ChevronRight size={14} className="text-muted-foreground" />
                          {ultimo ? (
                            <span className="rounded-lg px-2 py-1 font-semibold">
                              {rotulos[i] ?? chave}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => voltarPara(i + 1)}
                              className="rounded-lg px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                            >
                              {rotulos[i] ?? chave}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Níveis de categoria */}
                {eixoAtual && !verProdutos && !ehComparativo && (
                  <div className="divide-y divide-border/60">
                    {nos.map((no) => (
                      <LinhaNivel
                        key={no.chave}
                        no={no}
                        medida={medida}
                        onAbrir={() => descer(no)}
                      />
                    ))}
                  </div>
                )}

                {ehComparativo && eixoAtual && (
                  <div className="divide-y divide-border/60">
                    {nosComparativo.map((no) => (
                      <LinhaComparativa
                        key={no.chave}
                        no={no}
                        medida={medida}
                        onAbrir={
                          caminho.length + 1 < ordem.length
                            ? () => descer({ ...no, quantidade: 0, valor: 0, linhas: 0, participacao: 0 })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {/* A folha. No fluxo é uma ida a mais ao ERP, e por isso é pedida e
                    nunca automática; no estoque o dado já está no cliente, e o botão
                    continua existindo só para a lista de produtos não abrir sozinha
                    por cima da leitura por categoria. */}
                {ehComparativo && (
                  <p className="text-2xs text-muted-foreground">
                    O comparativo para na categoria: o estoque interno do ERP é por modelo e as
                    demais fontes descem à cor — confrontá-las no produto seria somar medidas
                    diferentes.
                  </p>
                )}

                {caminho.length > 0 && !verProdutos && !ehComparativo && (
                  <Button variant="outline" size="sm" onClick={() => setVerProdutos(true)}>
                    <Package className="h-4 w-4" />
                    Ver produtos deste recorte
                  </Button>
                )}

                {verProdutos && (
                  <>
                    {folha.isLoading && (
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                      </div>
                    )}
                    {folha.error && (
                      <Alert variant="destructive">
                        <CloudOff className="h-4 w-4" />
                        <AlertDescription>{folha.error.message}</AlertDescription>
                      </Alert>
                    )}
                    {!folha.isLoading && !folha.error && (
                      <div className="divide-y divide-border/60">
                        {nosProdutos.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Nenhum produto neste recorte.
                          </p>
                        ) : (
                          nosProdutos.map((no) => (
                            <LinhaNivel key={no.chave} no={no} medida={medida} />
                          ))
                        )}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setVerProdutos(false)}>
                      Voltar às categorias
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
