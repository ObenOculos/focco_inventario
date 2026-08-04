import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertTriangle,
  Users,
  Package,
  Clock,
  CheckCircle,
  CalendarX,
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
import { useVendedoresDesempenhoQuery } from '@/hooks/useVendedoresDesempenhoQuery';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import { StatsCardsSkeleton } from '@/components/skeletons/CardSkeleton';
import * as XLSX from 'xlsx';

type SortField = 'nome' | 'itens_contados' | 'dias_sem_inventario';
type SortDirection = 'asc' | 'desc';

export default function ControleVendedores() {
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // O seletor de período saiu junto com as métricas de remessas e vendas: nada mais nesta
  // tela é recortado por intervalo de datas.
  const { data: vendedores, isLoading, isFetching } = useVendedoresDesempenhoQuery();

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
        case 'itens_contados':
          comparison =
            (a.ultimo_inventario?.itens_contados ?? -1) -
            (b.ultimo_inventario?.itens_contados ?? -1);
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
    const nuncaInventariaram = vendedores.filter((v) => v.ultimo_inventario === null);

    return {
      totalVendedores: vendedores.length,
      vendedoresAtivos: ativos.length,
      comInventarioRecente: comInventarioRecente.length,
      semInventario: semInventario.length,
      nuncaInventariaram: nuncaInventariaram.length,
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
      'Último Inventário': v.ultimo_inventario
        ? new Date(v.ultimo_inventario.data).toLocaleDateString('pt-BR')
        : 'Nunca',
      'Status Inventário': v.ultimo_inventario?.status || '-',
      'Itens Contados': v.ultimo_inventario?.itens_contados ?? '-',
      'Dias sem Inventário': v.dias_sem_inventario ?? 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendedores');
    XLSX.writeFile(workbook, 'painel_vendedores.xlsx');
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
              Situação de inventário de cada representante.
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
                      <CalendarX className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {metricas.nuncaInventariaram}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">Nunca inventariaram</p>
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
              <TableSkeleton columns={4} rows={6} />
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
                        onClick={() => handleSort('itens_contados')}
                      >
                        <span className="flex items-center justify-center gap-1">
                          Itens Contados
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
                        <TableCell className="text-center font-bold text-sm">
                          {vendedor.ultimo_inventario ? (
                            vendedor.ultimo_inventario.itens_contados
                          ) : (
                            <span className="text-muted-foreground font-normal">-</span>
                          )}
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
