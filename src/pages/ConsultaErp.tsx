import { useMemo, useState } from 'react';
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
import { SearchFilter } from '@/components/SearchFilter';
import { Pagination } from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useIsMobile } from '@/hooks/use-mobile';
import { CloudOff, Search, TriangleAlert } from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import {
  empresasDaEscolha,
  useErpPedidosQuery,
  useErpVendedoresQuery,
  type EscolhaEmpresa,
  type ParametrosPedidos,
  type PedidoErp,
} from '@/hooks/useConsultaErpQuery';

/**
 * Consulta ao ERP Ciclone — somente leitura.
 *
 * Os dados não vêm do Supabase: atravessam a Edge Function `erp-consulta` até o
 * `erp-gateway`, que roda na máquina com acesso à VPN do Ciclone. Duas consequências
 * moldam a tela:
 *
 *   1. **É lenta e cara.** A consulta só dispara no clique, nunca ao digitar. Os
 *      filtros abaixo do resultado são locais e não voltam ao ERP.
 *   2. **A origem pode estar fora do ar** sem que nada no app esteja errado. Por isso
 *      "ERP indisponível" é um estado de primeira classe, distinto de erro.
 *
 * A tela não decide o que é venda ou remessa: essa classificação vem pronta de
 * `regras.py`, no gateway, e é a mesma que a ferramenta de auditoria local usa.
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

/** Badge da classificação derivada do CFOP. Cores por variante, nunca por className. */
function BadgeClassificacao({ valor }: { valor: string | null }) {
  if (!valor) return <span className="text-muted-foreground">—</span>;
  const variante =
    valor === 'VENDA' ? 'info' : valor === 'REMESSA' ? 'secondary' : 'neutral';
  return <Badge variant={variante}>{valor}</Badge>;
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

  const [busca, setBusca] = useState('');
  const [soDivergencias, setSoDivergencias] = useState(false);

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
    setConsulta({
      de,
      ate,
      vendedores: vendedor === 'todos' ? undefined : [Number(vendedor)],
      empresas: empresasDaEscolha(empresa),
      base_data: baseData,
    });
  };

  const linhasFiltradas = useMemo(() => {
    if (!soDivergencias) return linhas;
    return linhas.filter((l) => Boolean(l.divergencia));
  }, [linhas, soDivergencias]);

  const { paginatedData, ...paginacao } = usePagination<PedidoErp>({
    data: linhasFiltradas,
    searchTerm: busca,
    searchFields: ['codigo_auxiliar', 'produto_desc', 'cliente_nome', 'numero_nota'],
    itemsPerPage: 20,
  });

  const resumo = useMemo(() => {
    const comDivergencia = linhas.filter((l) => Boolean(l.divergencia)).length;
    const canceladas = linhas.filter((l) => l.situacao_nota === 'Cancelada').length;
    const valor = linhas.reduce((s, l) => s + (Number(l.valor_liquido) || 0), 0);
    return { total: linhas.length, comDivergencia, canceladas, valor };
  }, [linhas]);

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

        {consulta && !carregandoPedidos && !erroPedidos && (
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Resultado</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    <span className="tabular-nums">{resumo.total}</span>
                    &nbsp;linhas
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
                  <Badge variant="secondary">
                    <span className="tabular-nums">{MOEDA.format(resumo.valor)}</span>
                  </Badge>
                </div>
              </div>

              {linhas.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <SearchFilter
                    value={busca}
                    onChange={setBusca}
                    placeholder="Buscar produto, cliente ou nota…"
                  />
                  <Button
                    variant={soDivergencias ? 'default' : 'outline'}
                    onClick={() => setSoDivergencias((v) => !v)}
                  >
                    <TriangleAlert className="mr-2 h-4 w-4" />
                    Somente divergências
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {linhas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum pedido ou nota no período para o filtro escolhido.
                </p>
              ) : paginatedData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma linha corresponde aos filtros aplicados.
                </p>
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
                        <span>NF {l.numero_nota ?? '—'}</span>
                        <span>{formatarData(l.nota_movimento)}</span>
                        <span className="tabular-nums">Qtd {l.quantidade}</span>
                        <span className="tabular-nums">
                          {MOEDA.format(Number(l.valor_liquido) || 0)}
                        </span>
                      </div>
                      <p className="text-sm">{l.cliente_nome}</p>
                      {(l.divergencia || l.situacao_nota === 'Cancelada') && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {l.divergencia && (
                            <Badge variant="destructive">{l.divergencia}</Badge>
                          )}
                          {l.situacao_nota === 'Cancelada' && (
                            <Badge variant="warning">Cancelada</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        <TableHead>Data</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Operação</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((l, i) => {
                        const cancelada = l.situacao_nota === 'Cancelada';
                        return (
                          <TableRow
                            key={`${l.numero_nota}-${l.codigo_auxiliar}-${i}`}
                            // Linha cancelada é contexto, não alerta: fundo neutro e texto
                            // esmaecido, sem `opacity` (cinza sobre cinza fica ilegível).
                            className={cancelada ? 'bg-muted/30 text-muted-foreground' : ''}
                          >
                            <TableCell className="py-3 tabular-nums">
                              {formatarData(l.nota_movimento)}
                            </TableCell>
                            <TableCell className="py-3 tabular-nums">
                              {l.numero_nota ?? '—'}
                            </TableCell>
                            <TableCell className="py-3 max-w-[16rem] truncate">
                              {l.cliente_nome ?? '—'}
                            </TableCell>
                            <TableCell className="py-3">
                              <span className="font-medium">{l.codigo_auxiliar ?? '—'}</span>
                              <span className="block text-xs text-muted-foreground truncate max-w-[14rem]">
                                {l.produto_desc}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 text-right tabular-nums">
                              {l.quantidade}
                            </TableCell>
                            <TableCell className="py-3 text-right tabular-nums">
                              {MOEDA.format(Number(l.valor_liquido) || 0)}
                            </TableCell>
                            <TableCell className="py-3">
                              <BadgeClassificacao valor={l.classif_operacao} />
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-wrap gap-1">
                                {l.divergencia && (
                                  <Badge variant="destructive">A conferir</Badge>
                                )}
                                {cancelada && <Badge variant="warning">Cancelada</Badge>}
                                {!l.divergencia && !cancelada && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {paginacao.totalPages > 1 && <Pagination {...paginacao} />}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
