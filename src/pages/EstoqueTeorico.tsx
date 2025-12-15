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

  // Verificar se há filtros ativos
  const hasActiveFilters = teoricoFilter !== 'todos' || realFilter !== 'todos' || divergenciaFilter !== 'todos';

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
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Estoque (Teórico x Real)</h1>
            <p className="text-muted-foreground">
              {isGerente
                ? 'Compare o estoque teórico com o real de todos os vendedores'
                : 'Compare seu estoque teórico com o real baseado em inventários'}
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !loading} />
        </div>

        {produtosNegativos.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
            <AlertTriangle className="text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">
                {produtosNegativos.length} produto(s) com estoque teórico negativo
              </p>
              <p className="text-sm text-muted-foreground">Verifique divergências de inventário</p>
            </div>
            <Link to="/pedidos">
              <Button variant="outline" size="sm">
                Ver detalhes
              </Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Produtos
                {hasActiveFilters && <Filter size={12} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalFiltradoProdutos}</p>
              {hasActiveFilters && (
                <p className="text-xs text-muted-foreground">de {totalGeralProdutos} total</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp size={16} className={totalFiltradoTeorico >= 0 ? 'text-primary' : 'text-destructive'} />
                Est. Teórico
                {hasActiveFilters && <Filter size={12} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${totalFiltradoTeorico < 0 ? 'text-destructive' : ''}`}>
                {totalFiltradoTeorico}
              </p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} className="text-purple-600" />
                Est. Real
                {hasActiveFilters && <Filter size={12} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">{totalFiltradoReal}</p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown
                  size={16}
                  className={totalFiltradoDivergencia === 0 ? 'text-green-600' : 'text-destructive'}
                />
                Divergência
                {hasActiveFilters && <Filter size={12} className="text-primary" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-bold ${totalFiltradoDivergencia === 0 ? 'text-green-600' : 'text-destructive'}`}
              >
                {totalFiltradoDivergencia > 0 ? `+${totalFiltradoDivergencia}` : totalFiltradoDivergencia}
              </p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Package size={20} />
                Comparação: Teórico x Real
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalItems} produtos
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={dadosFiltrados.length === 0}
                >
                  <Download size={16} className="mr-2" />
                  Exportar Excel
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
              <SearchFilter
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Buscar por código ou produto..."
              />
              {isGerente && (
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger className="w-full md:w-44">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Vendedores</SelectItem>
                    {vendedores.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.codigo_vendedor}>
                        {vendor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={teoricoFilter} onValueChange={setTeoricoFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Est. Teórico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Teórico: Todos</SelectItem>
                  <SelectItem value="positivo">Teórico: Positivo</SelectItem>
                  <SelectItem value="zero">Teórico: Zero</SelectItem>
                  <SelectItem value="negativo">Teórico: Negativo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={realFilter} onValueChange={setRealFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Est. Real" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Real: Todos</SelectItem>
                  <SelectItem value="com_real">Com Est. Real</SelectItem>
                  <SelectItem value="sem_real">Sem Est. Real</SelectItem>
                  <SelectItem value="positivo">Real: Positivo</SelectItem>
                  <SelectItem value="zero">Real: Zero</SelectItem>
                  <SelectItem value="negativo">Real: Negativo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={divergenciaFilter} onValueChange={setDivergenciaFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Divergência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Divergência: Todas</SelectItem>
                  <SelectItem value="ok">Sem Divergência</SelectItem>
                  <SelectItem value="divergente">Com Divergência</SelectItem>
                  <SelectItem value="falta">Falta (Real &lt; Teórico)</SelectItem>
                  <SelectItem value="sobra">Sobra (Real &gt; Teórico)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <EstoqueTeoricSkeleton />
            ) : totalItems === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm
                    ? 'Nenhum produto encontrado'
                    : 'Nenhum produto com estoque real registrado'}
                </p>
              </div>
            ) : (
              <>
                <div className="border-2 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Produto</TableHead>
                        <TableHead className="text-center">Est. Teórico</TableHead>
                        <TableHead className="text-center">Est. Real</TableHead>
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
