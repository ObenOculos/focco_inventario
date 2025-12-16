import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, TrendingUp, TrendingDown, Download, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
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

export default function EstoqueTeorico() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [teoricoFilter, setTeoricoFilter] = useState<string>('todos');
  const [realFilter, setRealFilter] = useState<string>('todos');
  const [divergenciaFilter, setDivergenciaFilter] = useState<string>('todos');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos');

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

  // Totais gerais (dados completos)
  const totalGeralProdutos = dados.length;

  // Totais filtrados (baseados nos dados após filtros)
  const totalFiltradoTeorico = dadosFiltrados.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalFiltradoReal = dadosFiltrados.reduce((acc, item) => acc + item.estoque_real, 0);
  const totalFiltradoDivergencia = dadosFiltrados.reduce((acc, item) => acc + item.diferenca, 0);
  const totalFiltradoProdutos = dadosFiltrados.length;

  // Contagem de itens com divergência
  const itensDivergentesTotal = dados.filter((d) => d.diferenca !== 0).length;
  const itensDivergentesFiltrados = dadosFiltrados.filter((d) => d.diferenca !== 0).length;

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
    toast.success(`Arquivo exportado: ${fileName}`);
  };

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              Estoque (Teórico x Real)
            </h1>
            <p className="text-sm text-muted-foreground">
              {isGerente
                ? 'Compare o estoque teórico com o real'
                : 'Compare seu estoque teórico com o real'}
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !loading} />
        </div>

        {produtosNegativos.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 md:p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <AlertTriangle className="text-destructive shrink-0" size={20} />
              <div>
                <p className="font-semibold text-destructive text-sm md:text-base">
                  {produtosNegativos.length} produto(s) com estoque negativo
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Verifique divergências
                </p>
              </div>
            </div>
            <Link to="/pedidos">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                Ver detalhes
              </Button>
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <Card className="flex-1 basis-36 border-2">
            <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-1 md:gap-2">
                <Package size={14} className="hidden sm:block" />
                <Package size={12} className="sm:hidden" />
                Produtos
                {hasActiveFilters && <Filter size={10} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
              <p className="text-xl md:text-3xl font-bold">{totalFiltradoProdutos}</p>
              {hasActiveFilters && (
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  de {totalGeralProdutos}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 basis-36 border-2">
            <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-1 md:gap-2">
                <TrendingUp
                  size={14}
                  className={`hidden sm:block ${totalFiltradoTeorico >= 0 ? 'text-primary' : 'text-destructive'}`}
                />
                <TrendingUp
                  size={12}
                  className={`sm:hidden ${totalFiltradoTeorico >= 0 ? 'text-primary' : 'text-destructive'}`}
                />
                Estoque ERP
                {hasActiveFilters && <Filter size={10} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
              <p
                className={`text-xl md:text-3xl font-bold ${totalFiltradoTeorico < 0 ? 'text-destructive' : ''}`}
              >
                {totalFiltradoTeorico}
              </p>
              <p className="text-[10px] md:text-xs text-muted-foreground">unid.</p>
            </CardContent>
          </Card>

          <Card className="flex-1 basis-36 border-2">
            <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-1 md:gap-2">
                <Package size={14} className="text-purple-600 hidden sm:block" />
                <Package size={12} className="text-purple-600 sm:hidden" />
                Inventário
                {hasActiveFilters && <Filter size={10} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
              <p className="text-xl md:text-3xl font-bold text-purple-600">{totalFiltradoReal}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground">unid.</p>
            </CardContent>
          </Card>

          <Card className="flex-1 basis-36 border-2">
            <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-1 md:gap-2">
                <TrendingDown
                  size={14}
                  className={`hidden sm:block ${totalFiltradoDivergencia === 0 ? 'text-green-600' : 'text-destructive'}`}
                />
                <TrendingDown
                  size={12}
                  className={`sm:hidden ${totalFiltradoDivergencia === 0 ? 'text-green-600' : 'text-destructive'}`}
                />
                Diverg.
                {hasActiveFilters && <Filter size={10} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
              <p
                className={`text-xl md:text-3xl font-bold ${totalFiltradoDivergencia === 0 ? 'text-green-600' : 'text-destructive'}`}
              >
                {totalFiltradoDivergencia > 0
                  ? `+${totalFiltradoDivergencia}`
                  : totalFiltradoDivergencia}
              </p>
              <p className="text-[10px] md:text-xs text-muted-foreground">unid.</p>
            </CardContent>
          </Card>

          <Card className="flex-1 basis-36 border-2">
            <CardHeader className="pb-1 md:pb-2 px-3 md:px-6 pt-3 md:pt-6">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground flex items-center gap-1 md:gap-2">
                <TrendingDown
                  size={14}
                  className={`hidden sm:block ${itensDivergentesFiltrados === 0 ? 'text-green-600' : 'text-orange-700'}`}
                />
                <TrendingDown
                  size={12}
                  className={`sm:hidden ${itensDivergentesFiltrados === 0 ? 'text-green-600' : 'text-orange-700'}`}
                />
                Itens Divergentes
                {hasActiveFilters && <Filter size={10} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
              <p
                className={`text-xl md:text-3xl font-bold ${itensDivergentesFiltrados === 0 ? 'text-green-600' : 'text-orange-700'}`}
              >
                {itensDivergentesFiltrados}
              </p>
              {hasActiveFilters ? (
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  de {itensDivergentesTotal}
                </p>
              ) : (
                <p className="text-[10px] md:text-xs text-muted-foreground mt-1">itens</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-2">
          <CardHeader className="px-3 md:px-6 py-3 md:py-6">
            <CardTitle className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-base md:text-lg">
                  <Package size={18} />
                  Comparação
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="text-sm md:text-lg px-2 md:px-3 py-0.5 md:py-1"
                  >
                    {totalItems}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportExcel}
                    disabled={dadosFiltrados.length === 0}
                    className="hidden sm:flex"
                  >
                    <Download size={16} className="mr-2" />
                    Exportar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleExportExcel}
                    disabled={dadosFiltrados.length === 0}
                    className="sm:hidden h-8 w-8"
                  >
                    <Download size={16} />
                  </Button>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6 pb-3 md:pb-6">
            <div className="space-y-2">
              <SearchFilter
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Buscar código ou produto..."
              />
              <div className="grid grid-cols-2 md:flex md:flex-row gap-2">
                {isGerente && (
                  <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                    <SelectTrigger className="w-full md:w-40 text-xs md:text-sm h-9">
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
                  <SelectTrigger className="w-full md:w-36 text-xs md:text-sm h-9">
                    <SelectValue placeholder="Estoque ERP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Estoque ERP: Todos</SelectItem>
                    <SelectItem value="positivo">Positivo</SelectItem>
                    <SelectItem value="zero">Zero</SelectItem>
                    <SelectItem value="negativo">Negativo</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={realFilter} onValueChange={setRealFilter}>
                  <SelectTrigger className="w-full md:w-36 text-xs md:text-sm h-9">
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
                  <SelectTrigger className="w-full md:w-40 text-xs md:text-sm h-9">
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
                  className="text-muted-foreground text-xs h-8 w-full md:w-auto"
                >
                  Limpar filtros
                </Button>
              )}
            </div>

            {loading ? (
              <EstoqueTeoricSkeleton />
            ) : totalItems === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {searchTerm
                    ? 'Nenhum produto encontrado'
                    : 'Nenhum produto com estoque real registrado'}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: Card Layout */}
                <div className="md:hidden space-y-2">
                  {paginatedData.map((item) => (
                    <div
                      key={item.codigo_auxiliar}
                      className={`border-2 rounded-lg p-3 ${item.diferenca !== 0 ? 'bg-destructive/5 border-destructive/30' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.diferenca !== 0 && (
                            <AlertTriangle className="text-destructive shrink-0" size={14} />
                          )}
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-sm block">
                              {item.codigo_auxiliar}
                            </span>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.nome_produto}
                            </p>
                          </div>
                        </div>
                        {item.diferenca === 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-green-500/10 text-green-600 border-green-500/30 text-xs shrink-0"
                          >
                            OK
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={`font-bold text-xs shrink-0 ${
                              item.diferenca > 0
                                ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
                                : 'bg-destructive/10 text-destructive border-destructive/30'
                            }`}
                          >
                            {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Estoque ERP</p>
                          <p
                            className={`font-bold text-sm ${item.estoque_teorico < 0 ? 'text-destructive' : ''}`}
                          >
                            {item.estoque_teorico}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Inventário</p>
                          <p className="font-bold text-sm text-purple-600">{item.estoque_real}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Diverg.</p>
                          <p
                            className={`font-bold text-sm ${item.diferenca === 0 ? 'text-green-600' : item.diferenca > 0 ? 'text-yellow-600' : 'text-destructive'}`}
                          >
                            {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                          </p>
                        </div>
                      </div>
                      {item.data_atualizacao_real && (
                        <p className="text-[10px] text-muted-foreground text-center mt-1">
                          Atualizado:{' '}
                          {new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

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
                          className={item.diferenca !== 0 ? 'bg-destructive/5' : ''}
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
                                <p className="text-xs text-muted-foreground truncate">
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
