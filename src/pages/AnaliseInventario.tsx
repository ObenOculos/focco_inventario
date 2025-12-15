import { AppLayout } from '@/components/layout/AppLayout';
import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, PackageSearch, CheckCircle, Loader2, Download, User, Calendar, Hash } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as XLSX from 'xlsx';
import { 
  useInventariosAnaliseQuery, 
  useComparativoInventarioQuery, 
  useVendedoresSimpleQuery 
} from '@/hooks/useAnaliseInventarioQuery';

export default function AnaliseInventario() {
  const { profile } = useAuth();
  const [selectedInventario, setSelectedInventario] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [divergenceFilter, setDivergenceFilter] = useState('todos');
  const [selectedVendedor, setSelectedVendedor] = useState<string>('todos');

  const isGerente = profile?.role === 'gerente';
  const queryClient = useQueryClient();

  const { data: vendedores = [] } = useVendedoresSimpleQuery(isGerente);
  const { data: inventarios = [] } = useInventariosAnaliseQuery(
    isGerente,
    profile?.codigo_vendedor,
    selectedVendedor,
    vendedores
  );
  const { data: comparativo = [], isLoading: loading, error } = useComparativoInventarioQuery(selectedInventario);

  // Reset selected inventory when seller filter changes
  useEffect(() => {
    setSelectedInventario(null);
  }, [selectedVendedor]);

  // Auto-select first inventory when list changes
  useEffect(() => {
    if (inventarios.length > 0 && !selectedInventario) {
      setSelectedInventario(inventarios[0].id);
    }
  }, [inventarios, selectedInventario]);

  const filteredComparativo = useMemo(() => {
    let filteredData = comparativo;

    if (divergenceFilter === 'com_divergencia') {
      filteredData = filteredData.filter(item => item.divergencia !== 0);
    } else if (divergenceFilter === 'sem_divergencia') {
      filteredData = filteredData.filter(item => item.divergencia === 0);
    } else if (divergenceFilter === 'positiva') {
      filteredData = filteredData.filter(item => item.divergencia > 0);
    } else if (divergenceFilter === 'negativa') {
      filteredData = filteredData.filter(item => item.divergencia < 0);
    }

    return filteredData;
  }, [comparativo, divergenceFilter]);
  
  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedComparativo,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({
    data: filteredComparativo,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
  });

  const handleApprove = async () => {
    if (!selectedInventario || !isGerente) return;

    setIsApproving(true);
    try {
        const { data, error } = await supabase.functions.invoke('aprovar-e-ajustar-inventario', {
            body: { inventario_id: selectedInventario },
        });

        if (error) throw error;

        toast.success(data.message || "Inventário aprovado e estoque ajustado com sucesso!");

        queryClient.invalidateQueries({ queryKey: ['inventariosAnalise'] });
        queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
        queryClient.invalidateQueries({ queryKey: ['inventarios'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    } catch (err: any) {
        console.error("Erro ao aprovar inventário:", err);
        toast.error("Falha ao aprovar inventário", {
            description: err.message || err.data?.error || 'Ocorreu um erro inesperado.',
        });
    } finally {
        setIsApproving(false);
    }
  };

  const selectedInventarioInfo = useMemo(
    () => inventarios.find(inv => inv.id === selectedInventario),
    [inventarios, selectedInventario]
  );
  
  const totalDivergencias = comparativo.filter(item => item.divergencia !== 0).length;
  const showApprovalButton = isGerente && selectedInventarioInfo && ['pendente', 'revisao'].includes(selectedInventarioInfo.status);

  const handleExportDivergencias = () => {
    if (!selectedInventarioInfo || filteredComparativo.length === 0) {
      toast.error("Não há dados para exportar.");
      return;
    }

    const dataExport = filteredComparativo.map(item => ({
      'Código Auxiliar': item.codigo_auxiliar,
      'Produto': item.nome_produto,
      'Estoque Teórico': item.estoque_teorico,
      'Estoque Físico': item.quantidade_fisica,
      'Divergência': item.divergencia,
    }));

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergências');

    const vendedorNome = selectedInventarioInfo.vendedor_nome || selectedInventarioInfo.codigo_vendedor;
    const dataInventario = new Date(selectedInventarioInfo.data_inventario).toLocaleDateString('pt-BR', { timeZone: 'UTC' }).replace(/\//g, '-');
    const fileName = `divergencias_${vendedorNome}_${dataInventario}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    toast.success("Arquivo exportado com sucesso!");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análise de Inventário</h1>
          <p className="text-muted-foreground">
            Compare o estoque físico contado com o estoque teórico do sistema.
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle>Selecione o Inventário para Análise</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Select
                value={selectedInventario ?? ''}
                onValueChange={setSelectedInventario}
                disabled={inventarios.length === 0}
              >
                <SelectTrigger className="w-full sm:w-[400px]">
                  <SelectValue placeholder="Selecione uma data de inventário" />
                </SelectTrigger>
                <SelectContent>
                  {inventarios.map((inv, index) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      <span className="font-medium">#{inventarios.length - index}</span> - {new Date(inv.data_inventario).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} - {inv.vendedor_nome} - <span className="capitalize">{inv.status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isGerente && (
                <Select
                  value={selectedVendedor}
                  onValueChange={setSelectedVendedor}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Filtrar por vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map((vendedor) => (
                      <SelectItem key={vendedor.codigo_vendedor} value={vendedor.codigo_vendedor}>
                        {vendedor.nome} ({vendedor.codigo_vendedor})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Analisando dados...</div>
            ) : error ? (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
                    <AlertTriangle className="text-destructive shrink-0" />
                    <div className="flex-1">
                    <p className="font-semibold text-destructive">
                        {error.message}
                    </p>
                    </div>
              </div>
            ) : !selectedInventario ? (
              <div className="text-center py-12">
                <PackageSearch size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhum inventário encontrado.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Inventory Identification Card */}
                {selectedInventarioInfo && (
                  <Card className="bg-muted/30 border-2">
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Hash size={16} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Inventário:</span>
                          <span className="font-semibold">#{inventarios.findIndex(inv => inv.id === selectedInventario) >= 0 ? inventarios.length - inventarios.findIndex(inv => inv.id === selectedInventario) : '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User size={16} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Vendedor:</span>
                          <span className="font-semibold">{selectedInventarioInfo.vendedor_nome} ({selectedInventarioInfo.codigo_vendedor})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Data:</span>
                          <span className="font-semibold">{new Date(selectedInventarioInfo.data_inventario).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            selectedInventarioInfo.status === 'aprovado' ? 'bg-green-500/20 text-green-700' :
                            selectedInventarioInfo.status === 'pendente' ? 'bg-amber-500/20 text-amber-700' :
                            'bg-red-500/20 text-red-700'
                          }`}>
                            {selectedInventarioInfo.status}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        {totalDivergencias > 0 ? <AlertTriangle size={16} className="text-amber-500" /> : <CheckCircle size={16} className="text-green-600" />}
                        Itens com Divergência
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-3xl font-bold ${totalDivergencias > 0 ? 'text-amber-500' : 'text-green-600'}`}>{totalDivergencias}</p>
                    </CardContent>
                  </Card>
                  {showApprovalButton && (
                    <Card className="col-span-1 sm:col-span-1 lg:col-span-3 bg-green-500/10 border-green-500/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Aprovar Inventário</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                          Ao aprovar, o estoque teórico será atualizado com base neste inventário. Esta ação não pode ser desfeita.
                        </p>
                        <Button onClick={handleApprove} disabled={isApproving}>
                          {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {isApproving ? 'Aprovando...' : 'Aprovar e Ajustar Estoque'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
                
                <div className="border-2 rounded-lg overflow-hidden">
                    <div className="p-4 border-b-2 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                        <div className="flex flex-col md:flex-row gap-4 flex-1">
                          <SearchFilter
                              value={searchTerm}
                              onChange={setSearchTerm}
                              placeholder="Buscar por código ou produto..."
                          />
                          <Select value={divergenceFilter} onValueChange={setDivergenceFilter}>
                            <SelectTrigger className="w-full md:w-52">
                              <SelectValue placeholder="Filtrar por divergência" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todos">Todas as divergências</SelectItem>
                              <SelectItem value="com_divergencia">Com divergência</SelectItem>
                              <SelectItem value="sem_divergencia">Sem divergência</SelectItem>
                              <SelectItem value="positiva">Divergência positiva</SelectItem>
                              <SelectItem value="negativa">Divergência negativa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button 
                          variant="outline" 
                          onClick={handleExportDivergencias}
                          disabled={filteredComparativo.length === 0}
                          className="flex items-center gap-2"
                        >
                          <Download size={16} />
                          Exportar
                        </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50%]">Produto</TableHead>
                          <TableHead className="text-center">Est. Teórico</TableHead>
                          <TableHead className="text-center">Est. Físico</TableHead>
                          <TableHead className="text-center">Divergência</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedComparativo.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                              Nenhum item encontrado.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedComparativo.map((item) => (
                            <TableRow key={item.codigo_auxiliar} className={item.divergencia !== 0 ? 'bg-amber-500/5' : ''}>
                              <TableCell>
                                <p className="font-medium truncate">{item.nome_produto}</p>
                                <p className="font-mono text-xs text-muted-foreground">{item.codigo_auxiliar}</p>
                              </TableCell>
                              <TableCell className="text-center font-medium">{item.estoque_teorico}</TableCell>
                              <TableCell className="text-center font-medium">{item.quantidade_fisica}</TableCell>
                              <TableCell className={`text-center font-bold ${item.divergencia > 0 ? 'text-yellow-600' : item.divergencia < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                {item.divergencia > 0 ? `+${item.divergencia}` : item.divergencia}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}