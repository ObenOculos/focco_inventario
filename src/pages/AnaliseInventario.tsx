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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  AlertTriangle,
  PackageSearch,
  CheckCircle,
  Loader2,
  Download,
  ChevronDown,
  Minus,
  Trash2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DivergenciaStats } from '@/components/DivergenciaStats';
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
} from '@/components/ui/table';
import * as XLSX from 'xlsx';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import {
  useInventariosAnaliseQuery,
  useVendedoresSimpleQuery,
  ComparativoItem,
} from '@/hooks/useAnaliseInventarioQuery';

// Função para calcular a diferença com lógica condicional
const calcularDiferenca = (estoqueTeor: number, estoqFisico: number): number => {
  return estoqueTeor <= 0 
    ? estoqueTeor + estoqFisico 
    : estoqueTeor - estoqFisico;
};

export default function AnaliseInventario() {
  const { profile } = useAuth();
  const [selectedInventario, setSelectedInventario] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [divergenceFilter, setDivergenceFilter] = useState('com_divergencia');
  const [diferencaFilter, setDiferencaFilter] = useState('todos');
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
  const [comparativo, setComparativo] = useState<ComparativoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Fetch comparison in batches to avoid Supabase RPC row limits
  useEffect(() => {
    if (!selectedInventario) {
      setComparativo([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchComparativoInBatches = async () => {
      setLoading(true);
      setIsFetching(true);
      setError(null);

      const allData: any[] = [];
      let offset = 0;
      const batchSize = 500;
      let hasMore = true;

      try {
        while (hasMore && !cancelled) {
          const { data, error } = await supabase.rpc('comparar_estoque_inventario_paginado', {
            p_inventario_id: selectedInventario,
            p_limit: batchSize,
            p_offset: offset,
          });

          if (error) {
            console.error(`Erro ao buscar comparativo (offset ${offset}):`, error);
            setError(error);
            setLoading(false);
            setIsFetching(false);
            return;
          }

          if (data && data.length > 0) {
            allData.push(...(data as any[]));
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        if (!cancelled) setComparativo(allData);
      } catch (err: any) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsFetching(false);
        }
      }
    };

    fetchComparativoInBatches();

    return () => {
      cancelled = true;
    };
  }, [selectedInventario]);

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

    // Filtro de divergência
    if (divergenceFilter === 'com_divergencia') {
      filteredData = filteredData.filter((item) => item.foi_contado && item.divergencia !== 0);
    } else if (divergenceFilter === 'sem_divergencia') {
      filteredData = filteredData.filter((item) => item.foi_contado && item.divergencia === 0);
    } else if (divergenceFilter === 'positiva') {
      filteredData = filteredData.filter((item) => item.foi_contado && item.divergencia > 0);
    } else if (divergenceFilter === 'negativa') {
      filteredData = filteredData.filter((item) => item.foi_contado && item.divergencia < 0);
    } else if (divergenceFilter === 'nao_contados') {
      filteredData = filteredData.filter((item) => !item.foi_contado);
    } else {
      // "todos" - mostra apenas os contados
      filteredData = filteredData.filter((item) => item.foi_contado);
    }

    // Filtro de diferença
    if (diferencaFilter !== 'todos') {
      filteredData = filteredData.filter((item) => {
        const diferenca = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        if (diferencaFilter === 'positiva') return diferenca > 0;
        if (diferencaFilter === 'negativa') return diferenca < 0;
        if (diferencaFilter === 'zero') return diferenca === 0;
        return true;
      });
    }

    return filteredData;
  }, [comparativo, divergenceFilter, diferencaFilter]);

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

      toast.success(data.message || 'Inventário aprovado e estoque ajustado com sucesso!');

      queryClient.invalidateQueries({ queryKey: ['inventariosAnalise'] });
      queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      console.error('Erro ao aprovar inventário:', err);
      toast.error('Falha ao aprovar inventário', {
        description: err.message || err.data?.error || 'Ocorreu um erro inesperado.',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedInventario || !isGerente) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('inventarios').delete().eq('id', selectedInventario);

      if (error) throw error;

      toast.success('Inventário excluído com sucesso.');
      setSelectedInventario(null);
      queryClient.invalidateQueries({ queryKey: ['inventariosAnalise'] });
      queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      console.error('Erro ao excluir inventário:', err);
      toast.error('Erro ao excluir inventário');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const selectedInventarioInfo = useMemo(
    () => inventarios.find((inv) => inv.id === selectedInventario),
    [inventarios, selectedInventario]
  );

  // Calculate statistics
  const stats = useMemo(() => {
    // Filtrar apenas itens que foram contados (igual à Conferência)
    const itensContados = comparativo.filter((item) => item.foi_contado);
    // Soma das quantidades físicas dos itens corretos (sem divergência)
    const itensCorretos = itensContados
      .filter((item) => item.divergencia === 0)
      .reduce((sum, item) => sum + item.quantidade_fisica, 0);
    // Total de itens (soma de todas as quantidades físicas)
    const totalItens = itensContados.reduce((sum, item) => sum + item.quantidade_fisica, 0);
    // Contagem de produtos com sobra
    const itensSobra = itensContados.filter((item) => item.divergencia > 0).length;
    // Contagem de produtos com falta
    const itensFalta = itensContados.filter((item) => item.divergencia < 0).length;
    // Soma total das divergências (positivas e negativas)
    const valorTotalDivergencia = itensContados.reduce((sum, item) => sum + item.divergencia, 0);

    return { itensCorretos, itensSobra, itensFalta, totalItens, valorTotalDivergencia };
  }, [comparativo]);

  // Itens não contados (com estoque teórico mas não foram contados)
  const itensNaoContados = useMemo(() => {
    return comparativo
      .filter((item) => !item.foi_contado && item.estoque_teorico !== 0)
      .map((item) => ({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        estoque_teorico: item.estoque_teorico,
      }))
      .sort((a, b) => Math.abs(b.estoque_teorico) - Math.abs(a.estoque_teorico));
  }, [comparativo]);

  const showApprovalButton =
    isGerente &&
    selectedInventarioInfo &&
    ['pendente', 'revisao'].includes(selectedInventarioInfo.status);

  const showDeleteButton = isGerente && selectedInventarioInfo;

  const handleExportDivergencias = (exportAll: boolean = false) => {
    const dataToExport = exportAll ? comparativo.filter((item) => item.foi_contado) : filteredComparativo;
    
    if (!selectedInventarioInfo || (dataToExport.length === 0 && itensNaoContados.length === 0)) {
      toast.error('Não há dados para exportar.');
      return;
    }

    const dataExport: Array<{
      'Código Auxiliar': string;
      'Nome Produto': string;
      'Estoque Teórico': number;
      'Estoque Físico': number;
      Divergência: number;
      Diferença: number;
      Status: string;
    }> = dataToExport.map((item) => ({
      'Código Auxiliar': item.codigo_auxiliar,
      'Nome Produto': item.nome_produto || '',
      'Estoque Teórico': item.estoque_teorico,
      'Estoque Físico': item.quantidade_fisica,
      Divergência: item.divergencia,
      Diferença: calcularDiferenca(item.estoque_teorico, item.quantidade_fisica),
      Status: item.divergencia === 0 ? 'OK' : item.divergencia > 0 ? 'Sobra' : 'Falta',
    }));

    // Adicionar itens não contados ao export
    itensNaoContados.forEach((item) => {
      dataExport.push({
        'Código Auxiliar': item.codigo_auxiliar,
        'Nome Produto': item.nome_produto || '',
        'Estoque Teórico': item.estoque_teorico,
        'Estoque Físico': 0,
        Divergência: -item.estoque_teorico,
        Diferença: calcularDiferenca(item.estoque_teorico, 0),
        Status: 'Não Contado',
      });
    });

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergências');

    const vendedorNome =
      selectedInventarioInfo.vendedor_nome || selectedInventarioInfo.codigo_vendedor;
    const dataInventario = new Date(selectedInventarioInfo.data_inventario)
      .toLocaleDateString('pt-BR', { timeZone: 'UTC' })
      .replace(/\//g, '-');
    const suffix = exportAll ? '_completo' : '_filtrado';
    const fileName = `divergencias_${vendedorNome}_${dataInventario}${suffix}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success('Arquivo exportado com sucesso!');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Análise de Inventário</h1>
            <p className="text-muted-foreground mt-1">
              Compare o estoque físico contado com o estoque teórico do sistema
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !loading} />
        </div>

        {/* Selection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selecione o Inventário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Inventário</label>
                <Select
                  value={selectedInventario ?? ''}
                  onValueChange={setSelectedInventario}
                  disabled={inventarios.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma data de inventário" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventarios.map((inv, index) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        <span className="font-medium">#{inventarios.length - index}</span> -{' '}
                        {new Date(inv.data_inventario).toLocaleDateString('pt-BR', {
                          timeZone: 'UTC',
                        })}{' '}
                        - {inv.vendedor_nome} - <span className="capitalize">{inv.status}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isGerente && (
                <div className="lg:w-80">
                  <label className="text-sm font-medium mb-2 block">Vendedor</label>
                  <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                    <SelectTrigger>
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
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content Area */}
        {loading ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-lg font-medium">Analisando dados...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Carregando comparativo de estoque
                </p>
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-destructive">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 bg-destructive/10 rounded-full">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-lg mb-1">Erro ao carregar dados</p>
                  <p className="text-sm text-muted-foreground">{error.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : !selectedInventario ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center">
                <PackageSearch className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium mb-1">Nenhum inventário selecionado</p>
                <p className="text-sm text-muted-foreground">
                  Selecione um inventário acima para visualizar a análise
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Statistics - usando o componente reutilizável */}
            <DivergenciaStats
              itensCorretos={stats.itensCorretos}
              itensSobra={stats.itensSobra}
              itensFalta={stats.itensFalta}
              totalItens={stats.totalItens}
              valorTotalDivergencia={stats.valorTotalDivergencia}
            />

            {/* Approval and Delete Buttons */}
            {(showApprovalButton || showDeleteButton) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Ações do Gerente</h3>
                      <p className="text-sm text-muted-foreground">
                        Gerencie este inventário. A aprovação é irreversível.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {showDeleteButton && (
                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={isDeleting || isApproving}
                          size="lg"
                          className="shrink-0"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      )}
                      {showApprovalButton && (
                        <Button
                          onClick={handleApprove}
                          disabled={isApproving || isDeleting}
                          size="lg"
                          className="shrink-0"
                        >
                          {isApproving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                          )}
                          {isApproving ? 'Aprovando...' : 'Aprovar Inventário'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Data Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <CardTitle>Comparativo de Estoque</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    <SearchFilter
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder="Buscar por código..."
                      className="w-full sm:w-64"
                    />
                    <Select value={divergenceFilter} onValueChange={setDivergenceFilter}>
                      <SelectTrigger className="w-full sm:w-48">
                        <SelectValue placeholder="Divergência" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas divergências</SelectItem>
                        <SelectItem value="com_divergencia">Com divergência</SelectItem>
                        <SelectItem value="sem_divergencia">Sem divergência</SelectItem>
                        <SelectItem value="positiva">Sobras (+)</SelectItem>
                        <SelectItem value="negativa">Faltas (-)</SelectItem>
                        <SelectItem value="nao_contados">Não Contados</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={diferencaFilter} onValueChange={setDiferencaFilter}>
                      <SelectTrigger className="w-full sm:w-44">
                        <SelectValue placeholder="Diferença" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas diferenças</SelectItem>
                        <SelectItem value="positiva">Diferença (+)</SelectItem>
                        <SelectItem value="negativa">Diferença (-)</SelectItem>
                        <SelectItem value="zero">Diferença (0)</SelectItem>
                      </SelectContent>
                    </Select>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={comparativo.length === 0}
                          className="shrink-0"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Exportar
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleExportDivergencias(false)}>
                          Exportar Filtrado
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportDivergencias(true)}>
                          Exportar Tudo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">Código Auxiliar</TableHead>
                        <TableHead className="text-center">Est. Teórico</TableHead>
                        <TableHead className="text-center">Est. Físico</TableHead>
                        <TableHead className="text-center">Divergência</TableHead>
                        <TableHead className="text-center">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedComparativo.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Minus className="h-8 w-8 text-muted-foreground/50" />
                              <p className="text-sm text-muted-foreground">
                                Nenhum item encontrado com os filtros aplicados
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedComparativo.map((item) => (
                          <TableRow
                            key={item.codigo_auxiliar}
                            className={
                              item.divergencia > 0
                                ? 'bg-yellow-500/5'
                                : item.divergencia < 0
                                  ? 'bg-red-500/5'
                                  : ''
                            }
                          >
                            <TableCell>
                              <span className="font-mono text-sm font-medium">
                                {item.codigo_auxiliar}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{item.estoque_teorico}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{item.quantidade_fisica}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                {item.divergencia > 0 ? (
                                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                                ) : item.divergencia < 0 ? (
                                  <TrendingDown className="h-4 w-4 text-red-600" />
                                ) : (
                                  <Minus className="h-4 w-4 text-green-600" />
                                )}
                                <span
                                  className={`font-bold ${
                                    item.divergencia > 0
                                      ? 'text-yellow-600'
                                      : item.divergencia < 0
                                        ? 'text-red-600'
                                        : 'text-green-600'
                                  }`}
                                >
                                  {item.divergencia > 0
                                    ? `+${item.divergencia}`
                                    : item.divergencia}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const diferenca = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
                                return (
                                  <span
                                    className={`font-bold ${
                                      diferenca > 0
                                        ? 'text-blue-600'
                                        : diferenca < 0
                                          ? 'text-orange-600'
                                          : 'text-muted-foreground'
                                    }`}
                                  >
                                    {diferenca > 0 ? `+${diferenca}` : diferenca}
                                  </span>
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="p-4 border-t">
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o inventário e todos os seus itens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir Inventário'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}