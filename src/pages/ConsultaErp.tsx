import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useIsMobile } from '@/hooks/use-mobile';
import { CabecalhoOrdenavel } from '@/components/CabecalhoOrdenavel';
import { RefinoPedidos } from '@/components/erp/RefinoPedidos';
import { alternarOrdem, type Ordenacao } from '@/lib/ordenacao';
import {
  FILTROS_PEDIDOS_INICIAIS,
  filtrarPedidos,
  indexarPedidos,
  resumirPedidos,
  type FiltrosPedidos,
  type PedidoIndexado,
} from '@/lib/filtrosPedidosErp';
import {
  COLUNA_POR_CAMPO,
  alinhamentoDaColuna,
  colunasDaVisao,
  direcaoInicialDaColuna,
  type ColunaPedido,
  type Visao,
} from '@/lib/colunasPedidosErp';
import { exportarPedidosErp } from '@/lib/exportarPedidosErp';
import {
  agruparPedidos,
  rotuloDoGrupo,
  type GrupoPedido,
  type ValorDoGrupo,
} from '@/lib/agruparPedidosErp';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronRight,
  CloudOff,
  Download,
  Filter,
  Search,
  TriangleAlert,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import {
  empresasDaEscolha,
  useErpPedidosQuery,
  useErpVendedoresQuery,
  type EscolhaEmpresa,
  type ParametrosPedidos,
} from '@/hooks/useConsultaErpQuery';

/**
 * Consulta ao ERP Ciclone — somente leitura.
 *
 * Os dados não vêm do Supabase: atravessam a Edge Function `erp-consulta` até o
 * `erp-gateway`, que roda na máquina com acesso à VPN do Ciclone. Duas consequências
 * moldam a tela:
 *
 *   1. **É lenta e cara.** A consulta só dispara no clique, nunca ao digitar. O cartão
 *      de refino, abaixo, é local e não volta ao ERP.
 *   2. **A origem pode estar fora do ar** sem que nada no app esteja errado. Por isso
 *      "ERP indisponível" é um estado de primeira classe, distinto de erro.
 *
 * A tela não decide o que é venda ou remessa: essa classificação vem pronta de
 * `regras.py`, no gateway, e é a mesma que a ferramenta de auditoria local usa. O refino
 * segue o dela (`app.py`), inclusive nas opções em cascata. Quais colunas existem, como se
 * ordenam e o que cada uma faz na linha de um pedido agrupado moram em
 * `lib/colunasPedidosErp.ts` — nada disso é escrito no JSX daqui.
 */

const HOJE = new Date();
const FORMATO_ISO = 'yyyy-MM-dd';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Badge da classificação derivada do CFOP. Cores por variante, nunca por className. */
function BadgeClassificacao({ valor }: { valor: string | null }) {
  if (!valor) return <span className="text-muted-foreground">—</span>;
  const variante =
    valor === 'VENDA' ? 'info' : valor === 'REMESSA' ? 'secondary' : 'neutral';
  return <Badge variant={variante}>{valor}</Badge>;
}

/** Campo pelo qual a tabela está ordenada — qualquer coluna do registro. */
type CampoOrdem = ColunaPedido['campo'];

/**
 * Abre na ordem em que o ERP entregou: data do movimento crescente.
 *
 * É o `ORDER BY` da consulta em `db.py` e o que a ferramenta local mostra — a tela não
 * reordena nada sem o usuário pedir.
 */
const ORDEM_INICIAL: Ordenacao<CampoOrdem> = { campo: 'nota_movimento', direcao: 'asc' };

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const numero = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

/** Comparação de duas LINHAS pelo tipo declarado da coluna. */
function compararPor(campo: CampoOrdem, a: PedidoIndexado, b: PedidoIndexado): number {
  const tipo = COLUNA_POR_CAMPO.get(campo)?.tipo ?? 'texto';
  if (tipo === 'numero' || tipo === 'moeda') return numero(a[campo]) - numero(b[campo]);
  // Data em ISO-8601 compara como texto na ordem cronológica; vazio vai para uma ponta.
  return texto(a[campo]).localeCompare(texto(b[campo]), 'pt-BR');
}

/**
 * Ordem dos GRUPOS: pelo agregado, não pela posição do primeiro item.
 *
 * Aqui a tela se afasta da ferramenta local de propósito. Lá, ordenar por "Valor" no modo
 * agrupado ordena as LINHAS e os pedidos saem na ordem em que apareceram — um pedido de
 * R$ 8 mil com uma linha barata acaba no fim da tabela, e a coluna que se clicou não
 * explica o resultado. Clicando em "Valor" com pedidos na tela, a pergunta é qual pedido
 * é o maior.
 */
function compararGrupos(campo: CampoOrdem, a: GrupoPedido, b: GrupoPedido): number {
  if (campo === 'quantidade') return a.quantidade - b.quantidade;
  if (campo === 'valor_liquido') return a.valor - b.valor;
  if (campo === 'divergencia') return a.divergencia.localeCompare(b.divergencia, 'pt-BR');
  // Data e nota do pedido são "(vários)" com frequência (duas notas no mesmo pedido).
  // Ordenar pelo `null` jogaria todo pedido de duas notas para uma das pontas, como se não
  // tivesse data nenhuma; a menor de cada pedido é a resposta que faz sentido na coluna.
  if (campo === 'nota_movimento') return a.dataMin.localeCompare(b.dataMin);
  if (campo === 'numero_nota') return a.notaMin - b.notaMin;

  const tipo = COLUNA_POR_CAMPO.get(campo)?.tipo ?? 'texto';
  const va = a.valores[campo];
  const vb = b.valores[campo];
  if (tipo === 'numero' || tipo === 'moeda') return numero(va) - numero(vb);
  return texto(va).localeCompare(texto(vb), 'pt-BR');
}

const classeCelula = (coluna: ColunaPedido) => {
  const numerica = coluna.tipo !== 'texto';
  return [
    'py-3',
    numerica ? 'tabular-nums' : '',
    alinhamentoDaColuna(coluna) === 'right' ? 'text-right' : '',
    // Texto longo trunca em vez de esticar a coluna; a Analítica rola horizontalmente e
    // uma observação de pedido inteira empurraria as demais colunas para fora da tela.
    coluna.tipo === 'texto' && coluna.largura ? `${coluna.largura} max-w-[16rem] truncate` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

/** Formatação de um valor cru conforme o tipo da coluna. */
function textoDaCelula(coluna: ColunaPedido, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (coluna.tipo === 'data') return formatarData(String(valor));
  if (coluna.tipo === 'moeda') return MOEDA.format(numero(valor));
  return String(valor);
}

/**
 * Célula de uma linha de ITEM.
 *
 * `visao` entra em duas colunas: a descrição do produto viaja junto do código na Sintética
 * (onde "Descrição" não é coluna) e o aviso de nota cancelada entra em "A conferir" na
 * Sintética, que também não tem a coluna "Sit. Nota". Sem isso, a visão enxuta esconderia
 * duas informações em vez de só condensá-las.
 */
function celulaItem(coluna: ColunaPedido, l: PedidoIndexado, visao: Visao): ReactNode {
  const cancelada = l.nota_situacao_cod === 'C';

  if (coluna.campo === 'divergencia') {
    const marcadores: ReactNode[] = [];
    if (l.divergencia) {
      marcadores.push(
        <Badge key="div" variant="destructive">
          A conferir
        </Badge>
      );
    }
    if (cancelada && visao === 'sintetica') {
      marcadores.push(
        <Badge key="canc" variant="warning">
          Cancelada
        </Badge>
      );
    }
    return marcadores.length > 0 ? (
      <div className="flex flex-wrap gap-1">{marcadores}</div>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  if (coluna.campo === 'classif_operacao') {
    return <BadgeClassificacao valor={l.classif_operacao} />;
  }

  if (coluna.campo === 'codigo_auxiliar') {
    return (
      <>
        <span className="font-medium">{l.codigo_auxiliar ?? '—'}</span>
        {visao === 'sintetica' && l.produto_desc && (
          <span className="block truncate text-xs text-muted-foreground">{l.produto_desc}</span>
        )}
      </>
    );
  }

  return textoDaCelula(coluna, l[coluna.campo]);
}

/** Célula da linha do PEDIDO. `null` no valor do grupo é "(vários)"; ver `ValorDoGrupo`. */
function celulaGrupo(coluna: ColunaPedido, g: GrupoPedido, visao: Visao): ReactNode {
  if (coluna.noGrupo === 'soma') {
    return coluna.campo === 'quantidade'
      ? INTEIRO.format(g.quantidade)
      : MOEDA.format(g.valor);
  }

  if (coluna.noGrupo === 'divergencia') {
    const tudoCancelado = g.canceladas === g.itens.length;
    const marcadores: ReactNode[] = [];
    if (g.divergencia) {
      marcadores.push(
        <Badge key="div" variant="destructive">
          A conferir
        </Badge>
      );
    }
    if (g.canceladas > 0 && visao === 'sintetica') {
      marcadores.push(
        <Badge key="canc" variant="warning">
          {tudoCancelado ? 'Cancelada' : `${g.canceladas} cancelada(s)`}
        </Badge>
      );
    }
    return marcadores.length > 0 ? (
      <div className="flex flex-wrap gap-1">{marcadores}</div>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  const valor: ValorDoGrupo = g.valores[coluna.campo] ?? '';
  if (valor === null) return <span className="text-muted-foreground">(vários)</span>;

  if (coluna.campo === 'classif_operacao') {
    return <BadgeClassificacao valor={valor || null} />;
  }
  return textoDaCelula(coluna, valor);
}

export default function ConsultaErp() {
  const [vendedor, setVendedor] = useState<string>('todos');
  const [de, setDe] = useState(format(subDays(HOJE, 30), FORMATO_ISO));
  const [ate, setAte] = useState(format(HOJE, FORMATO_ISO));
  const [baseData, setBaseData] = useState<'movimento' | 'emissao'>('movimento');
  const [empresa, setEmpresa] = useState<EscolhaEmpresa>('ambas');

  // Consulta submetida: o que de fato foi ao ERP. Mantê-la separada dos campos é o
  // que impede a tela de consultar a cada tecla.
  const [consulta, setConsulta] = useState<ParametrosPedidos | null>(null);

  const [filtros, setFiltros] = useState<FiltrosPedidos>(FILTROS_PEDIDOS_INICIAIS);
  const [ordem, setOrdem] = useState<Ordenacao<CampoOrdem>>(ORDEM_INICIAL);
  const [agrupar, setAgrupar] = useState(false);
  /** Abre na Sintética, como a ferramenta local: é a visão de leitura rápida. */
  const [visao, setVisao] = useState<Visao>('sintetica');
  /** Pedidos expandidos, por chave do grupo. */
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const isMobile = useIsMobile();

  const {
    data: vendedores = [],
    isLoading: carregandoVendedores,
    error: erroVendedores,
  } = useErpVendedoresQuery();

  const {
    data: linhas = [],
    isLoading: carregandoPedidos,
    isFetching,
    error: erroPedidos,
  } = useErpPedidosQuery(consulta);

  const periodoInvalido = de > ate;

  const consultar = () => {
    if (periodoInvalido) return;
    // Refino e ordem voltam ao padrão a cada consulta nova: as opções de operação, CFOP
    // e marca saem do resultado, e um recorte do período anterior deixaria a tabela
    // vazia com o seletor apontando para um valor que não existe mais.
    setFiltros(FILTROS_PEDIDOS_INICIAIS);
    setOrdem(ORDEM_INICIAL);
    // Agrupamento e visão permanecem — são preferência de leitura, não recorte. As
    // expansões, não: são de pedidos que podem nem existir no período novo.
    setAbertos(new Set());
    setConsulta({
      de,
      ate,
      vendedores: vendedor === 'todos' ? undefined : [Number(vendedor)],
      empresas: empresasDaEscolha(empresa),
      base_data: baseData,
    });
  };

  /**
   * Indexação dos alvos de busca — uma vez por resultado, não por tecla digitada.
   * Ver `indexarPedidos`: o refino roda o filtro sete vezes a cada interação.
   */
  const indexadas = useMemo(() => indexarPedidos(linhas), [linhas]);

  const filtradas = useMemo(() => filtrarPedidos(indexadas, filtros), [indexadas, filtros]);

  const ordenadas = useMemo(() => {
    const sinal = ordem.direcao === 'asc' ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const comparacao = compararPor(ordem.campo, a, b);
      // Desempate estável pela chave do documento: sem ele, linhas de mesmo valor trocam
      // de lugar entre renders e a tabela "pisca" a cada mudança de filtro.
      if (comparacao === 0) {
        return (
          numero(a.numero_nota) - numero(b.numero_nota) ||
          texto(a.codigo_auxiliar).localeCompare(texto(b.codigo_auxiliar), 'pt-BR')
        );
      }
      return sinal * comparacao;
    });
  }, [filtradas, ordem]);

  /**
   * Grupos vindos das linhas JÁ ORDENADAS — assim os itens de dentro de cada pedido
   * seguem a coluna escolhida — e depois reordenados pelo agregado (`compararGrupos`).
   */
  const grupos = useMemo(() => {
    if (!agrupar) return [];
    const sinal = ordem.direcao === 'asc' ? 1 : -1;
    return agruparPedidos(ordenadas).sort((a, b) => {
      const comparacao = compararGrupos(ordem.campo, a, b);
      // Desempate pela chave: sem ele, pedidos de mesmo total trocam de lugar entre
      // renders e a tabela "pisca" a cada mudança de filtro.
      if (comparacao === 0) return a.chave.localeCompare(b.chave, 'pt-BR');
      return sinal * comparacao;
    });
  }, [agrupar, ordenadas, ordem]);

  /**
   * A empresa só entra no rótulo do pedido quando o resultado tem mais de uma: no dia a
   * dia (uma empresa só) seria ruído em toda linha de grupo.
   */
  const variasEmpresas = useMemo(
    () => new Set(linhas.map((l) => l.empresa)).size > 1,
    [linhas]
  );

  /** Colunas da visão, com a data que a consulta usou para delimitar o período. */
  const colunas = useMemo(
    () => colunasDaVisao(visao, consulta?.base_data ?? 'movimento'),
    [visao, consulta]
  );

  const ordenar = (campo: CampoOrdem) => {
    const coluna = COLUNA_POR_CAMPO.get(campo);
    setOrdem((atual) =>
      alternarOrdem(atual, campo, coluna ? direcaoInicialDaColuna(coluna) : 'asc')
    );
  };

  const alternarGrupo = (chave: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(chave)) proximo.add(chave);
      return proximo;
    });

  // Duas paginações: no modo plano a unidade é a linha, no agrupado é o pedido. Os dois
  // hooks são chamados sempre (regra dos hooks); o não usado pagina uma lista vazia.
  const { paginatedData, ...paginacao } = usePagination<PedidoIndexado>({
    data: ordenadas,
    itemsPerPage: 20,
  });
  const { paginatedData: gruposPagina, ...paginacaoGrupos } = usePagination<GrupoPedido>({
    data: grupos,
    itemsPerPage: 20,
  });

  /** Totais do RECORTE visível, como a barra de status da ferramenta local. */
  const resumo = useMemo(() => resumirPedidos(filtradas), [filtradas]);

  const exportar = () => {
    if (filtradas.length === 0) return;
    const arquivo = exportarPedidosErp(filtradas);
    toast.success(`Arquivo ${arquivo} baixado.`, {
      description: `${filtradas.length} linha(s) · 32 colunas do resultado filtrado.`,
    });
  };

  const erro = erroPedidos ?? erroVendedores;

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Consulta ao ERP"
          description="Pedidos e notas de saída direto do Ciclone, com os sinais de auditoria de operação e CFOP."
          isFetching={isFetching}
        />

        {erro && (
          <Alert variant={erro.indisponivel ? 'warning' : 'destructive'}>
            {erro.indisponivel ? (
              <CloudOff className="h-4 w-4" />
            ) : (
              <TriangleAlert className="h-4 w-4" />
            )}
            <AlertDescription>
              {erro.indisponivel ? (
                <>
                  <strong>ERP indisponível.</strong> O servidor de consulta não respondeu — a
                  máquina com acesso ao Ciclone pode estar fora do ar. Os dados do app não são
                  afetados; tente de novo em alguns minutos.
                </>
              ) : (
                erro.message
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* ── Parâmetros da consulta ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="vendedor">Vendedor</Label>
                <Select value={vendedor} onValueChange={setVendedor}>
                  <SelectTrigger id="vendedor">
                    <SelectValue
                      placeholder={carregandoVendedores ? 'Carregando…' : 'Todos'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.codigo} value={String(v.codigo)}>
                        {v.codigo} — {v.nome}
                        {v.situacao === 'I' ? ' (inativo)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="de">De</Label>
                <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ate">Até</Label>
                <Input
                  id="ate"
                  type="date"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="empresa">Empresa</Label>
                <Select value={empresa} onValueChange={(v) => setEmpresa(v as EscolhaEmpresa)}>
                  <SelectTrigger id="empresa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambas">Ambas (1 e 2)</SelectItem>
                    <SelectItem value="1">Empresa 1</SelectItem>
                    <SelectItem value="2">Empresa 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-data">Data base</Label>
                <Select
                  value={baseData}
                  onValueChange={(v) => setBaseData(v as 'movimento' | 'emissao')}
                >
                  <SelectTrigger id="base-data">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="movimento">Movimento da nota</SelectItem>
                    <SelectItem value="emissao">Emissão do pedido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {periodoInvalido && (
              <p className="text-sm text-destructive">
                A data inicial não pode ser posterior à final.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={consultar} disabled={periodoInvalido || isFetching}>
                {isFetching ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Consultando o ERP…
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Consultar
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                A consulta atravessa a VPN e pode levar alguns segundos.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Resultado ─────────────────────────────────────────────────────── */}
        {carregandoPedidos && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {consulta && !carregandoPedidos && !erroPedidos && linhas.length > 0 && (
          <RefinoPedidos
            linhas={indexadas}
            filtros={filtros}
            onFiltros={setFiltros}
            agrupar={agrupar}
            onAgrupar={setAgrupar}
            visao={visao}
            onVisao={setVisao}
            mostrarVisao={!isMobile}
          />
        )}

        {consulta && !carregandoPedidos && !erroPedidos && (
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Resultado</CardTitle>
                <Button variant="outline" onClick={exportar} disabled={filtradas.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>

              {/* Totais do recorte visível — mesma leitura da barra de status da
                  ferramenta local: linhas, pedidos distintos, quantidade, valor e o que
                  há para conferir. */}
              {linhas.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    <span className="tabular-nums">
                      {resumo.linhas < linhas.length
                        ? `${resumo.linhas} de ${linhas.length}`
                        : resumo.linhas}
                    </span>
                    &nbsp;linhas
                  </Badge>
                  <Badge variant="neutral">
                    <span className="tabular-nums">{resumo.pedidos}</span>
                    &nbsp;pedidos
                  </Badge>
                  <Badge variant="neutral">
                    Qtd&nbsp;
                    <span className="tabular-nums">{INTEIRO.format(resumo.quantidade)}</span>
                  </Badge>
                  <Badge variant="secondary">
                    <span className="tabular-nums">{MOEDA.format(resumo.valor)}</span>
                  </Badge>
                  {resumo.comDivergencia > 0 && (
                    <Badge variant="destructive">
                      <span className="tabular-nums">{resumo.comDivergencia}</span>
                      &nbsp;a conferir
                    </Badge>
                  )}
                  {resumo.canceladas > 0 && (
                    <Badge variant="warning">
                      <span className="tabular-nums">{resumo.canceladas}</span>
                      &nbsp;canceladas
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {linhas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido ou nota no período para o filtro escolhido.
                </p>
              ) : filtradas.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Filter className="h-11 w-11 text-muted-foreground/50" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    O refino não deixou nenhuma linha das {linhas.length} da consulta.
                  </p>
                  <Button variant="outline" onClick={() => setFiltros(FILTROS_PEDIDOS_INICIAIS)}>
                    Limpar refino
                  </Button>
                </div>
              ) : isMobile && agrupar ? (
                // Agrupado no mobile: um cartão por pedido, com os itens abrindo dentro.
                <div className="space-y-3">
                  {gruposPagina.map((g) => {
                    const aberto = abertos.has(g.chave);
                    return (
                      <div key={g.chave} className="rounded-xl border border-border/80">
                        <button
                          type="button"
                          onClick={() => alternarGrupo(g.chave)}
                          aria-expanded={aberto}
                          className="flex w-full items-start gap-2 p-4 text-left"
                        >
                          {aberto ? (
                            <ChevronDown size={16} className="mt-0.5 shrink-0" />
                          ) : (
                            <ChevronRight size={16} className="mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-medium tabular-nums">
                              {rotuloDoGrupo(g, variasEmpresas)}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">
                              {g.valores.cliente_nome || '—'}
                            </p>
                            <p className="text-sm text-muted-foreground tabular-nums">
                              {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'} · Qtd{' '}
                              {INTEIRO.format(g.quantidade)} · {MOEDA.format(g.valor)}
                            </p>
                            {(g.divergencia || g.canceladas > 0) && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {g.divergencia && (
                                  <Badge variant="destructive">A conferir</Badge>
                                )}
                                {g.canceladas > 0 && (
                                  <Badge variant="warning">
                                    {g.canceladas === g.itens.length
                                      ? 'Cancelada'
                                      : `${g.canceladas} cancelada(s)`}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                        {aberto && (
                          <ul className="divide-y divide-border/60 border-t border-border/60">
                            {g.itens.map((l, i) => (
                              <li
                                key={`${g.chave}-${l.numero_nota}-${l.codigo_auxiliar}-${i}`}
                                className="space-y-1 px-4 py-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium">{l.codigo_auxiliar ?? '—'}</p>
                                  <BadgeClassificacao valor={l.classif_operacao} />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {l.produto_desc}
                                </p>
                                <p className="text-sm text-muted-foreground tabular-nums">
                                  NF {l.numero_nota ?? '—'} · {formatarData(l.nota_movimento)} ·
                                  Qtd {l.quantidade} ·{' '}
                                  {MOEDA.format(Number(l.valor_liquido) || 0)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : isMobile ? (
                // Tabela com mais de 4 colunas vira lista de cartões no mobile.
                <div className="space-y-3">
                  {paginatedData.map((l, i) => (
                    <div
                      key={`${l.numero_nota}-${l.codigo_auxiliar}-${i}`}
                      className="rounded-xl border border-border/80 p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{l.codigo_auxiliar ?? '—'}</p>
                          <p className="text-sm text-muted-foreground">{l.produto_desc}</p>
                        </div>
                        <BadgeClassificacao valor={l.classif_operacao} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="tabular-nums">Ped. {l.numero_pedido ?? '—'}</span>
                        <span className="tabular-nums">NF {l.numero_nota ?? '—'}</span>
                        <span className="tabular-nums">{formatarData(l.nota_movimento)}</span>
                        <span className="tabular-nums">Qtd {l.quantidade}</span>
                        <span className="tabular-nums">
                          {MOEDA.format(Number(l.valor_liquido) || 0)}
                        </span>
                      </div>
                      <p className="text-sm">{l.cliente_nome}</p>
                      {(l.divergencia || l.marca || l.nota_situacao_cod === 'C') && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {l.marca && <Badge variant="outline">{l.marca}</Badge>}
                          {l.divergencia && <Badge variant="destructive">{l.divergencia}</Badge>}
                          {l.nota_situacao_cod === 'C' && (
                            <Badge variant="warning">Cancelada</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                // A Analítica tem 32 colunas: rola dentro do próprio quadro, sem empurrar
                // a página. `overflow-hidden` do raio e `overflow-x-auto` da rolagem não
                // convivem no mesmo elemento, daí os dois aninhados.
                <div className="overflow-hidden rounded-xl border border-border/80">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                          {/* No agrupado, uma coluna à frente para a identidade do pedido
                              e o botão de expandir: pendurar o botão na primeira coluna de
                              dado faria o cabeçalho dela mentir sobre o que há embaixo. */}
                          {agrupar && (
                            <TableHead className="font-semibold">
                              <span className="sr-only">Pedido</span>
                            </TableHead>
                          )}
                          {colunas.map((coluna) => (
                            <CabecalhoOrdenavel
                              key={coluna.campo}
                              rotulo={coluna.titulo}
                              campo={coluna.campo}
                              ordenacao={ordem}
                              onOrdenar={ordenar}
                              alinhamento={alinhamentoDaColuna(coluna)}
                              className={coluna.largura ?? ''}
                            />
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agrupar
                          ? gruposPagina.map((g) => {
                              const aberto = abertos.has(g.chave);
                              // Pedido inteiro cancelado é contexto; um item cancelado no
                              // meio de um pedido válido não esmaece a linha do pedido.
                              const tudoCancelado = g.canceladas === g.itens.length;
                              return (
                                <Fragment key={g.chave}>
                                  <TableRow
                                    className={`font-medium ${
                                      tudoCancelado
                                        ? 'bg-muted/30 text-muted-foreground'
                                        : 'bg-muted/20'
                                    }`}
                                  >
                                    <TableCell className="py-3">
                                      <button
                                        type="button"
                                        onClick={() => alternarGrupo(g.chave)}
                                        aria-expanded={aberto}
                                        className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      >
                                        {aberto ? (
                                          <ChevronDown size={16} className="shrink-0" />
                                        ) : (
                                          <ChevronRight size={16} className="shrink-0" />
                                        )}
                                        <span className="whitespace-nowrap">
                                          <span className="tabular-nums">
                                            {rotuloDoGrupo(g, variasEmpresas)}
                                          </span>
                                          <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                                            {g.itens.length}{' '}
                                            {g.itens.length === 1 ? 'item' : 'itens'}
                                          </span>
                                        </span>
                                      </button>
                                    </TableCell>
                                    {colunas.map((coluna) => (
                                      <TableCell
                                        key={coluna.campo}
                                        className={classeCelula(coluna)}
                                      >
                                        {celulaGrupo(coluna, g, visao)}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                  {aberto &&
                                    g.itens.map((l, i) => (
                                      <TableRow
                                        key={`${g.chave}-${l.numero_nota}-${l.codigo_auxiliar}-${i}`}
                                        className={
                                          l.nota_situacao_cod === 'C'
                                            ? 'bg-muted/30 text-muted-foreground'
                                            : ''
                                        }
                                      >
                                        {/* Célula do recuo: é ela que mostra que a linha
                                            pertence ao pedido acima. */}
                                        <TableCell className="py-3" />
                                        {colunas.map((coluna) => (
                                          <TableCell
                                            key={coluna.campo}
                                            className={classeCelula(coluna)}
                                          >
                                            {celulaItem(coluna, l, visao)}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                </Fragment>
                              );
                            })
                          : paginatedData.map((l, i) => (
                              <TableRow
                                key={`${l.numero_nota}-${l.codigo_auxiliar}-${i}`}
                                // Linha cancelada é contexto, não alerta: fundo neutro e
                                // texto esmaecido, sem `opacity` (cinza sobre cinza fica
                                // ilegível).
                                className={
                                  l.nota_situacao_cod === 'C'
                                    ? 'bg-muted/30 text-muted-foreground'
                                    : ''
                                }
                              >
                                {colunas.map((coluna) => (
                                  <TableCell
                                    key={coluna.campo}
                                    className={classeCelula(coluna)}
                                  >
                                    {celulaItem(coluna, l, visao)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* A unidade paginada muda com o modo: linhas no plano, pedidos no
                  agrupado — um pedido pode ter 30 itens e continua sendo UMA unidade. */}
              {agrupar
                ? paginacaoGrupos.totalPages > 1 && (
                    <Pagination {...paginacaoGrupos} unidade="pedidos" />
                  )
                : paginacao.totalPages > 1 && <Pagination {...paginacao} unidade="linhas" />}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
