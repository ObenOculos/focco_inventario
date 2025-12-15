import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { EstoqueTeoricSkeleton } from '@/components/skeletons/PageSkeleton';
import { useEstoqueTeoricoQuery, useVendedoresQuery } from '@/hooks/useEstoqueTeoricoQuery';

export default function EstoqueTeorico() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [saldoFilter, setSaldoFilter] = useState<string>('todos');
  const [estoqueRealFilter, setEstoqueRealFilter] = useState<string>('todos');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos');

  const isGerente = profile?.role === 'gerente';

  const { data: vendedores = [] } = useVendedoresQuery(isGerente);
  const { data: dados = [], isLoading: loading } = useEstoqueTeoricoQuery(
    isGerente,
    selectedVendor,
    profile?.codigo_vendedor
  );

  const produtosNegativos = useMemo(
    () => dados.filter(e => e.estoque_teorico < 0),
    [dados]
  );

  const dadosFiltrados = useMemo(() => {
    let filtered = dados;

    // Filtro de estoque real
    if (estoqueRealFilter === 'com_real') {
      filtered = filtered.filter(e => e.data_atualizacao_real !== null);
    } else if (estoqueRealFilter === 'sem_real') {
      filtered = filtered.filter(e => e.data_atualizacao_real === null);
    }

    // Filtro de saldo/divergência
    switch (saldoFilter) {
      case 'ok':
        filtered = filtered.filter(e => e.diferenca === 0);
        break;
      case 'divergente':
        filtered = filtered.filter(e => e.diferenca !== 0);
        break;
      case 'falta':
        filtered = filtered.filter(e => e.diferenca < 0);
        break;
      case 'sobra':
        filtered = filtered.filter(e => e.diferenca > 0);
        break;
      case 'negativo':
        filtered = filtered.filter(e => e.estoque_teorico < 0);
        break;
    }

    return filtered;
  }, [dados, saldoFilter, estoqueRealFilter]);

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


  const totalEstoqueTeorico = dados.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalEstoqueReal = dados.reduce((acc, item) => acc + item.estoque_real, 0);
  const totalDivergencia = dados.reduce((acc, item) => acc + item.diferenca, 0);
  const totalModelos = new Set(dados.map(e => e.codigo_auxiliar.split(' ')[0])).size;

  const handleExportExcel = () => {
    if (dadosFiltrados.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há dados para exportar.",
        variant: "destructive"
      });
      return;
    }

    const exportData = dadosFiltrados.map(item => ({
      'Código Auxiliar': item.codigo_auxiliar,
      'Nome Produto': item.nome_produto,
      'Estoque Teórico': item.estoque_teorico,
      'Estoque Real': item.estoque_real,
      'Divergência': item.diferenca,
      'Data Atualização Real': item.data_atualizacao_real 
        ? new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR')
        : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque Teórico x Real');

    const vendorName = selectedVendor !== 'todos' 
      ? vendedores.find(v => v.codigo_vendedor === selectedVendor)?.nome || selectedVendor
      : 'consolidado';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `estoque_teorico_real_${vendorName}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, fileName);

    toast({
      title: "Exportação concluída",
      description: `Arquivo ${fileName} baixado com sucesso.`
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque (Teórico x Real)</h1>
          <p className="text-muted-foreground">
            {isGerente 
              ? 'Compare o estoque teórico com o real de todos os vendedores' 
              : 'Compare seu estoque teórico com o real baseado em inventários'}
          </p>
        </div>

        {produtosNegativos.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
            <AlertTriangle className="text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">
                {produtosNegativos.length} produto(s) com estoque teórico negativo
              </p>
              <p className="text-sm text-muted-foreground">
                Verifique divergências de inventário
              </p>
            </div>
            <Link to="/pedidos">
              <Button variant="outline" size="sm">Ver detalhes</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Estoque Teórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalEstoqueTeorico}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Estoque Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">{totalEstoqueReal}</p>
            </CardContent>
          </Card>
          
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpCircle size={16} className="text-green-600" />
                Modelos Diferentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalModelos}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownCircle size={16} className={totalDivergencia === 0 ? 'text-green-600' : 'text-destructive'} />
                Divergência Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${totalDivergencia === 0 ? 'text-green-600' : 'text-destructive'}`}>
                {totalDivergencia > 0 ? `+${totalDivergencia}` : totalDivergencia}
              </p>
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
            <div className="flex flex-col md:flex-row gap-4">
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
              <Select value={estoqueRealFilter} onValueChange={setEstoqueRealFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Est. Real" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="com_real">Com Est. Real</SelectItem>
                  <SelectItem value="sem_real">Sem Est. Real</SelectItem>
                </SelectContent>
              </Select>
              <Select value={saldoFilter} onValueChange={setSaldoFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Divergência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ok">Sem Divergência</SelectItem>
                  <SelectItem value="divergente">Com Divergência</SelectItem>
                  <SelectItem value="falta">Falta (Real &lt; Teórico)</SelectItem>
                  <SelectItem value="sobra">Sobra (Real &gt; Teórico)</SelectItem>
                  <SelectItem value="negativo">Teórico Negativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <EstoqueTeoricSkeleton />
            ) : totalItems === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto com estoque real registrado'}
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
                            <p className={`font-bold text-lg ${item.estoque_teorico < 0 ? 'text-destructive' : 'text-foreground'}`}>
                              {item.estoque_teorico}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <p className="font-bold text-lg text-purple-600">
                              {item.estoque_real}
                            </p>
                            {item.data_atualizacao_real && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(item.data_atualizacao_real).toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.diferenca === 0 ? (
                              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
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
