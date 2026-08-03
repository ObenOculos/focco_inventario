import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  Users,
  Package,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  FileDown,
  ArrowUpDown,
} from 'lucide-react';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SearchFilter } from '@/components/SearchFilter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  useVendedoresDesempenhoQuery,
  VendedorDesempenho,
} from '@/hooks/useVendedoresDesempenhoQuery';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import { StatsCardsSkeleton } from '@/components/skeletons/CardSkeleton';
import * as XLSX from 'xlsx';
import { subDays, startOfDay, endOfDay } from 'date-fns';

type SortField = 'nome' | 'estoque_total' | 'total_vendas' | 'acuracidade' | 'dias_sem_inventario';
type SortDirection = 'asc' | 'desc';

export default function ControleVendedores() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [periodo, setPeriodo] = useState('30');
  const [sortField, setSortField] = useState<SortField>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Calcular datas do período com timestamps estáveis para cache do React Query
  const periodoOptions = useMemo(() => {
    if (periodo === 'todos') return {};

    const hoje = new Date();
    const dias = parseInt(periodo);

    return {
      periodoInicio: startOfDay(subDays(hoje, dias)),
      periodoFim: endOfDay(hoje),
    };
  }, [periodo]);

  const { data: vendedores, isLoading, isFetching } = useVendedoresDesempenhoQuery(periodoOptions);

  // Filtrar e ordenar vendedores
  const vendedoresFiltrados = useMemo(() => {
    if (!vendedores) return [];

    let resultado = vendedores.filter(
      (v) =>
        v.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.codigo_vendedor.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Ordenar
    resultado.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'nome':
          comparison = a.nome.localeCompare(b.nome);
          break;
        case 'estoque_total':
          comparison = a.estoque_total - b.estoque_total;
          break;
        case 'total_vendas':
          comparison = a.total_vendas - b.total_vendas;
          break;
        case 'acuracidade':
          const acuA = a.ultimo_inventario?.acuracidade ?? -1;
          const acuB = b.ultimo_inventario?.acuracidade ?? -1;
          comparison = acuA - acuB;
          break;
        case 'dias_sem_inventario':
          const diasA = a.dias_sem_inventario ?? 999;
          const diasB = b.dias_sem_inventario ?? 999;
          comparison = diasA - diasB;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return resultado;
  }, [vendedores, searchTerm, sortField, sortDirection]);

  // Métricas agregadas
  const metricas = useMemo(() => {
    if (!vendedores) return null;

    const ativos = vendedores.filter((v) => v.ativo);
    const comInventarioRecente = vendedores.filter(
      (v) => v.dias_sem_inventario !== null && v.dias_sem_inventario <= 30
    );
    const semInventario = vendedores.filter(
      (v) => v.dias_sem_inventario === null || v.dias_sem_inventario > 30
    );
    const baixaAcuracidade = vendedores.filter(
      (v) => v.ultimo_inventario?.acuracidade !== undefined && v.ultimo_inventario.acuracidade < 80
    );

    return {
      totalVendedores: vendedores.length,
      vendedoresAtivos: ativos.length,
      comInventarioRecente: comInventarioRecente.length,
      semInventario: semInventario.length,
      baixaAcuracidade: baixaAcuracidade.length,
      estoqueTotal: vendedores.reduce((sum, v) => sum + v.estoque_total, 0),
      vendasTotal: vendedores.reduce((sum, v) => sum + v.total_vendas, 0),
    };
  }, [vendedores]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    if (!vendedoresFiltrados) return;

    const dataToExport = vendedoresFiltrados.map((v) => ({
      Vendedor: v.nome,
      Código: v.codigo_vendedor,
      Status: v.ativo ? 'Ativo' : 'Inativo',
      'Estoque Total': v.estoque_total,
      'Remessas (período)': v.total_remessas,
      'Vendas (período)': v.total_vendas,
      'Último Inventário': v.ultimo_inventario
        ? new Date(v.ultimo_inventario.data).toLocaleDateString('pt-BR')
        : 'Nunca',
      'Status Inventário': v.ultimo_inventario?.status || '-',
      'Acuracidade (%)': v.ultimo_inventario?.acuracidade ?? '-',
      'Dias sem Inventário': v.dias_sem_inventario ?? 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Desempenho');
    XLSX.writeFile(workbook, `painel_vendedores_${periodo}dias.xlsx`);
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return null;

    switch (status) {
      case 'aprovado':
        return (
          <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Aprovado</Badge>
        );
      case 'pendente':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">Pendente</Badge>
        );
      case 'revisao':
        return (
          <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">Revisão</Badge>
        );
      default:
        return null;
    }
  };

  const getAcuracidadeBadge = (acuracidade: number | undefined) => {
    if (acuracidade === undefined) return <span className="text-muted-foreground">-</span>;

    if (acuracidade >= 95) {
      return (
        <Badge className="bg-green-500/20 text-green-700 border-green-500/30">{acuracidade}%</Badge>
      );
    } else if (acuracidade >= 80) {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
          {acuracidade}%
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-destructive/20 text-destructive border-destructive/30">
          {acuracidade}%
        </Badge>
      );
    }
  };

  if (profile?.role !== 'gerente') {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Acesso restrito a gerentes.</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 antialiased">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Painel de Vendedores</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              Visão geral do desempenho, inventário e acuracidade dos representantes.
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !isLoading} />
        </div>

        {/* Cards de métricas */}
        {isLoading ? (
          <StatsCardsSkeleton count={4} />
        ) : (
          metricas && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border border-border/80 rounded-2xl shadow-xs">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{metricas.vendedoresAtivos}</p>
                      <p className="text-xs text-muted-foreground font-medium">Vendedores Ativos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 rounded-2xl shadow-xs">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{metricas.comInventarioRecente}</p>
                      <p className="text-xs text-muted-foreground font-medium">Inventário em dia</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 rounded-2xl shadow-xs">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{metricas.semInventario}</p>
                      <p className="text-xs text-muted-foreground font-medium">Sem inventário recente</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border/80 rounded-2xl shadow-xs">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{metricas.baixaAcuracidade}</p>
                      <p className="text-xs text-muted-foreground font-medium">Baixa acuracidade</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        )}

        {/* Alertas */}
        {vendedores &&
          vendedores.filter((v) => v.dias_sem_inventario === null || v.dias_sem_inventario > 60)
            .length > 0 && (
            <Alert className="border border-amber-500/30 bg-amber-500/10 rounded-2xl text-amber-800 dark:text-amber-300">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-sm font-medium">
                <strong>
                  {
                    vendedores.filter(
                      (v) => v.dias_sem_inventario === null || v.dias_sem_inventario > 60
                    ).length
                  }
                </strong>{' '}
                vendedor(es) sem inventário realizado há mais de 60 dias.
              </AlertDescription>
            </Alert>
          )}

        {/* Tabela */}
        <Card className="border border-border/80 rounded-2xl shadow-xs">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-base sm:text-lg font-semibold tracking-tight">
              <span className="flex items-center gap-2">
                <Users size={20} className="text-primary" />
                Desempenho por Vendedor
              </span>
              <div className="flex flex-wrap gap-2">
                <div className="w-full sm:w-48">
                  <SearchFilter
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar vendedor..."
                  />
                </div>
                <Select value={periodo} onValueChange={setPeriodo}>
                  <SelectTrigger className="w-full sm:w-36 h-11 rounded-xl border-input shadow-2xs">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-border/80">
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="todos">Todo período</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  size={isMobile ? 'icon' : 'default'}
                  className={`h-11 rounded-xl shadow-2xs ${!isMobile ? 'flex items-center gap-2 px-4' : ''}`}
                >
                  <FileDown size={16} />
                  {!isMobile && 'Exportar'}
                  {isMobile && <span className="sr-only">Exportar</span>}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton columns={7} rows={6} />
            ) : vendedoresFiltrados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground/60" />
                <p className="text-sm font-medium">
                  {searchTerm
                    ? 'Nenhum vendedor encontrado para a busca.'
                    : 'Nenhum vendedor cadastrado.'}
                </p>
              </div>
            ) : (
              <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      <TableHead
                        className="cursor-pointer hover:bg-muted/60 font-semibold"
                        onClick={() => handleSort('nome')}
                      >
                        <span className="flex items-center gap-1">
                          Vendedor
                          <ArrowUpDown size={14} className="text-muted-foreground" />
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/60 text-center font-semibold"
                        onClick={() => handleSort('estoque_total')}
                      >
                        <span className="flex items-center justify-center gap-1">
                          Estoque
                          <ArrowUpDown size={14} className="text-muted-foreground" />
                        </span>
                      </TableHead>
                      <TableHead className="text-center font-semibold">
                        <span className="flex items-center justify-center gap-1">
                          <TrendingUp size={14} className="text-blue-500" />
                          Remessas
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/60 text-center font-semibold"
                        onClick={() => handleSort('total_vendas')}
                      >
                        <span className="flex items-center justify-center gap-1">
                          <TrendingDown size={14} className="text-emerald-500" />
                          Vendas
                          <ArrowUpDown size={14} className="text-muted-foreground" />
                        </span>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/60 text-center font-semibold"
                        onClick={() => handleSort('dias_sem_inventario')}
                      >
                        <span className="flex items-center justify-center gap-1">
                          Último Inventário
                          <ArrowUpDown size={14} className="text-muted-foreground" />
                        </span>
                      </TableHead>
                      <TableHead className="text-center font-semibold">Status</TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/60 text-center font-semibold"
                        onClick={() => handleSort('acuracidade')}
                      >
                        <span className="flex items-center justify-center gap-1">
                          Acuracidade
                          <ArrowUpDown size={14} className="text-muted-foreground" />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendedoresFiltrados.map((vendedor) => (
                      <TableRow
                        key={vendedor.codigo_vendedor}
                        className={`hover:bg-muted/30 transition-colors ${!vendedor.ativo ? 'opacity-50' : ''}`}
                      >
                        <TableCell>
                          <div>
                            <p className="font-semibold text-sm text-foreground">{vendedor.nome}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              Cód: {vendedor.codigo_vendedor}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm">
                          {vendedor.estoque_total}
                        </TableCell>
                        <TableCell className="text-center text-blue-600 dark:text-blue-400 font-semibold text-sm">
                          +{vendedor.total_remessas}
                        </TableCell>
                        <TableCell className="text-center text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                          -{vendedor.total_vendas}
                        </TableCell>
                        <TableCell className="text-center">
                          {vendedor.ultimo_inventario ? (
                            <div>
                              <p className="text-sm font-medium">
                                {new Date(vendedor.ultimo_inventario.data).toLocaleDateString(
                                  'pt-BR'
                                )}
                              </p>
                              {vendedor.dias_sem_inventario !== null &&
                                vendedor.dias_sem_inventario > 30 && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                                    ({vendedor.dias_sem_inventario} dias)
                                  </p>
                                )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs font-medium">Nunca</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(vendedor.ultimo_inventario?.status)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getAcuracidadeBadge(vendedor.ultimo_inventario?.acuracidade)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
