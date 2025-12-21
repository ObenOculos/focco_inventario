import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, TrendingUp, TrendingDown, Download, Filter, X, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
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
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { EstoqueTeoricSkeleton } from '@/components/skeletons/PageSkeleton';
import { useEstoqueTeoricoQuery, useVendedoresQuery } from '@/hooks/useEstoqueTeoricoQuery';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { Input } from '@/components/ui/input';

export default function EstoqueTeorico() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [teoricoFilter, setTeoricoFilter] = useState<string>('todos');
  const [realFilter, setRealFilter] = useState<string>('todos');
  const [divergenciaFilter, setDivergenciaFilter] = useState<string>('todos');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos');
  const [showFilters, setShowFilters] = useState(false);

  const isGerente = profile?.role === 'gerente';

  const { data: vendedores = [] } = useVendedoresQuery(isGerente);
  const {
    data: dados = [],
    isLoading: loading,
    isFetching,
  } = useEstoqueTeoricoQuery(isGerente, selectedVendor, profile?.codigo_vendedor);

  const produtosNegativos = useMemo(() => dados.filter((e) => e.estoque_teorico < 0), [dados]);

  const dadosFiltrados = useMemo(() => {
    let filtered = dados;

    // Filtro de estoque teórico
    switch (teoricoFilter) {
      case 'positivo':
        filtered = filtered.filter((e) => e.estoque_teorico > 0);
        break;
      case 'zero':
        filtered = filtered.filter((e) => e.estoque_teorico === 0);
        break;
      case 'negativo':
        filtered = filtered.filter((e) => e.estoque_teorico < 0);
        break;
    }

    // Filtro de estoque real
    switch (realFilter) {
      case 'com_real':
        filtered = filtered.filter((e) => e.data_atualizacao_real !== null);
        break;
      case 'sem_real':
        filtered = filtered.filter((e) => e.data_atualizacao_real === null);
        break;
      case 'positivo':
        filtered = filtered.filter((e) => e.estoque_real > 0);
        break;
      case 'zero':
        filtered = filtered.filter((e) => e.estoque_real === 0);
        break;
      case 'negativo':
        filtered = filtered.filter((e) => e.estoque_real < 0);
        break;
    }

    // Filtro de divergência
    switch (divergenciaFilter) {
      case 'ok':
        filtered = filtered.filter((e) => e.diferenca === 0);
        break;
      case 'divergente':
        filtered = filtered.filter((e) => e.diferenca !== 0);
        break;
      case 'falta':
        filtered = filtered.filter((e) => e.diferenca < 0);
        break;
      case 'sobra':
        filtered = filtered.filter((e) => e.diferenca > 0);
        break;
    }

    return filtered;
  }, [dados, teoricoFilter, realFilter, divergenciaFilter]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({
    data: dadosFiltrados,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
  });

  // Totais filtrados
  const totalFiltradoTeorico = dadosFiltrados.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalFiltradoReal = dadosFiltrados.reduce((acc, item) => acc + item.estoque_real, 0);
  const totalFiltradoDivergencia = dadosFiltrados.reduce((acc, item) => acc + item.diferenca, 0);
  const itensDivergentes = dadosFiltrados.filter((d) => d.diferenca !== 0).length;
  const itensSobra = dadosFiltrados.filter((d) => d.diferenca > 0).length;
  const itensFalta = dadosFiltrados.filter((d) => d.diferenca < 0).length;

  // Verificar se há filtros ativos
  const hasActiveFilters =
    teoricoFilter !== 'todos' || realFilter !== 'todos' || divergenciaFilter !== 'todos';

  const clearAllFilters = () => {
    setTeoricoFilter('todos');
    setRealFilter('todos');
    setDivergenciaFilter('todos');
    setSearchTerm('');
  };

  const handleExportExcel = () => {
    if (dadosFiltrados.length === 0) {
      toast.warning('Sem dados para exportar');
      return;
    }

    const exportData = dadosFiltrados.map((item) => ({
      'Código Auxiliar': item.codigo_auxiliar,
      'Nome Produto': item.nome_produto,
      'Estoque Teórico': item.estoque_teorico,
      'Estoque Real': item.estoque_real,
      Divergência: item.diferenca,
      'Data Atualização Real': item.data_atualizacao_real
        ? new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR')
        : '-',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque Teórico x Real');

    const vendorName =
      selectedVendor !== 'todos'
        ? vendedores.find((v) => v.codigo_vendedor === selectedVendor)?.nome || selectedVendor
        : 'consolidado';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `estoque_teorico_real_${vendorName}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Arquivo exportado com sucesso!`);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Estoque (ERP x Inventário)</h1>
            <p className="text-muted-foreground mt-1">
              {isGerente
                ? 'Compare o estoque do ERP com o inventário físico'
                : 'Compare seu estoque do ERP com o inventário físico'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefetchIndicator isFetching={isFetching && !loading} />
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={dadosFiltrados.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </div>
        </div>

        {/* Alert for Negative Stock */}
        {produtosNegativos.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-destructive">
                      {produtosNegativos.length} produto(s) com estoque negativo
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Verifique as divergências e ajuste o estoque
                    </p>
                  </div>
                </div>
                <Link to="/pedidos">
                  <Button variant="outline" size="sm">
                    Ver detalhes
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Segmented KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          {/* Total Produtos */}
          <Card className="col-span-2 lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 rounded-lg shrink-0">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Produtos</p>
                  <p className="text-2xl font-bold">{totalItems}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ERP */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground font-medium mb-1">Estoque ERP</p>
              <p className={`text-2xl font-bold ${totalFiltradoTeorico < 0 ? 'text-destructive' : ''}`}>
                {totalFiltradoTeorico}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">unidades</p>
            </CardContent>
          </Card>

          {/* Inventário */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground font-medium mb-1">Inventário</p>
              <p className="text-2xl font-bold text-purple-600">
                {totalFiltradoReal}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">unidades</p>
            </CardContent>
          </Card>

          {/* Divergência */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground font-medium mb-1">Divergência Total</p>
              <p className={`text-2xl font-bold ${totalFiltradoDivergencia === 0 ? 'text-green-600' : totalFiltradoDivergencia > 0 ? 'text-yellow-600' : 'text-destructive'}`}>
                {totalFiltradoDivergencia > 0 ? `+${totalFiltradoDivergencia}` : totalFiltradoDivergencia}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">unidades</p>
            </CardContent>
          </Card>

          {/* Análise de Divergências */}
          <Card className="col-span-2 lg:col-span-1 border-2 border-destructive/30">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground font-medium mb-2.5">Análise</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Divergentes:</span>
                  <span className="text-lg font-bold text-destructive">{itensDivergentes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-yellow-700 flex items-center gap-1">
                    <TrendingUp size={12} /> Sobras:
                  </span>
                  <span className="text-sm font-semibold">{itensSobra}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-red-700 flex items-center gap-1">
                    <TrendingDown size={12} /> Faltas:
                  </span>
                  <span className="text-sm font-semibold">{itensFalta}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Package size={20} />
                  Comparação Detalhada
                </CardTitle>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalItems}
                </Badge>
              </div>
              <Button
                variant={hasActiveFilters ? "default" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter size={16} />
                Filtros
                {hasActiveFilters && <span className="ml-1 px-1.5 py-0.5 bg-primary-foreground text-primary text-xs rounded-full">•</span>}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código ou nome do produto..."
                className="pl-10"
              />
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="pt-3 border-t space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {isGerente && (
                    <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos Vendedores</SelectItem>
                        {vendedores.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.codigo_vendedor}>
                            {vendor.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={teoricoFilter} onValueChange={setTeoricoFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estoque ERP" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">ERP: Todos</SelectItem>
                      <SelectItem value="positivo">Positivo</SelectItem>
                      <SelectItem value="zero">Zero</SelectItem>
                      <SelectItem value="negativo">Negativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={realFilter} onValueChange={setRealFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Inventário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Inventário: Todos</SelectItem>
                      <SelectItem value="com_real">Com Inventário</SelectItem>
                      <SelectItem value="sem_real">Sem Inventário</SelectItem>
                      <SelectItem value="positivo">Positivo</SelectItem>
                      <SelectItem value="zero">Zero</SelectItem>
                      <SelectItem value="negativo">Negativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={divergenciaFilter} onValueChange={setDivergenciaFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Divergência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Diverg.: Todas</SelectItem>
                      <SelectItem value="ok">Sem Divergência</SelectItem>
                      <SelectItem value="divergente">Com Divergência</SelectItem>
                      <SelectItem value="falta">Falta</SelectItem>
                      <SelectItem value="sobra">Sobra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="gap-1"
                  >
                    <X size={14} />
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}

            {loading ? (
              <EstoqueTeoricSkeleton />
            ) : totalItems === 0 ? (
              <div className="text-center py-16">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium mb-1">Nenhum produto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm || hasActiveFilters
                    ? 'Tente ajustar os filtros ou termo de busca'
                    : 'Nenhum produto com estoque real registrado'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table Layout */}
                <div className="hidden md:block border-2 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Produto</TableHead>
                        <TableHead className="text-center">Estoque ERP</TableHead>
                        <TableHead className="text-center">Inventário</TableHead>
                        <TableHead className="text-center">Divergência</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((item) => (
                        <TableRow
                          key={item.codigo_auxiliar}
                          className={
                            item.diferenca > 0
                              ? 'bg-yellow-500/5'
                              : item.diferenca < 0
                                ? 'bg-red-500/5'
                                : ''
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {item.diferenca !== 0 && (
                                <AlertTriangle className="text-destructive shrink-0" size={16} />
                              )}
                              <div>
                                <span className="font-mono font-bold text-sm">
                                  {item.codigo_auxiliar}
                                </span>
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {item.nome_produto}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <p
                              className={`font-bold text-lg ${item.estoque_teorico < 0 ? 'text-destructive' : 'text-foreground'}`}
                            >
                              {item.estoque_teorico}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <p className="font-bold text-lg text-purple-600">{item.estoque_real}</p>
                            {item.data_atualizacao_real && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.diferenca === 0 ? (
                              <Badge
                                variant="outline"
                                className="bg-green-500/10 text-green-600 border-green-500/30"
                              >
                                OK
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className={`font-bold ${
                                  item.diferenca > 0
                                    ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                                    : 'bg-destructive/10 text-destructive border-destructive/30'
                                }`}
                              >
                                {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards Layout */}
                <div className="md:hidden space-y-3">
                  {paginatedData.map((item) => (
                    <Card
                      key={item.codigo_auxiliar}
                      className={
                        item.diferenca > 0
                          ? 'bg-yellow-500/5 border-yellow-500/30'
                          : item.diferenca < 0
                            ? 'bg-red-500/5 border-red-500/30'
                            : ''
                      }
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {item.diferenca !== 0 && (
                              <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={16} />
                            )}
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-sm block">
                                {item.codigo_auxiliar}
                              </span>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {item.nome_produto}
                              </p>
                            </div>
                          </div>
                          {item.diferenca === 0 ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 shrink-0">
                              OK
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`font-bold shrink-0 ${
                                item.diferenca > 0
                                  ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                                  : 'bg-destructive/10 text-destructive border-destructive/30'
                              }`}
                            >
                              {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">ERP</p>
                            <p className={`font-bold text-base ${item.estoque_teorico < 0 ? 'text-destructive' : ''}`}>
                              {item.estoque_teorico}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Inventário</p>
                            <p className="font-bold text-base text-purple-600">{item.estoque_real}</p>
                            {item.data_atualizacao_real && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Diverg.</p>
                            <p className={`font-bold text-base ${item.diferenca === 0 ? 'text-green-600' : item.diferenca > 0 ? 'text-yellow-600' : 'text-destructive'}`}>
                              {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={onPageChange}
                    onItemsPerPageChange={onItemsPerPageChange}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}