import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { DivergenciaItem } from '@/types/app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save,
  User,
  Calendar,
  Package,
  Loader2,
  Download,
  Trash2,
  Minus,
  ArrowLeft,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import { DivergenciaStats } from '@/components/DivergenciaStats';
import { ConferenciaSkeleton } from '@/components/skeletons/PageSkeleton';
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
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventariosPendentesQuery, InventarioComItens } from '@/hooks/useConferenciaQuery';
import { useVendedoresSimpleQuery } from '@/hooks/useAnaliseInventarioQuery';
import { RefetchIndicator } from '@/components/RefetchIndicator';

type ItemNaoContado = {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
};

// Função para calcular a diferença com lógica condicional
const calcularDiferenca = (estoqueTeor: number, estoqFisico: number): number => {
  return estoqueTeor <= 0 ? estoqueTeor + estoqFisico : estoqFisico - estoqueTeor;
};

export default function Conferencia() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  const [selectedInventario, setSelectedInventario] = useState<InventarioComItens | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaItem[]>([]);
  const [itensNaoContados, setItensNaoContados] = useState<ItemNaoContado[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroResultado, setFiltroResultado] = useState<string>('com_diferenca');
  const [observacoes, setObservacoes] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{
    codigo_auxiliar: string;
    nome_produto: string;
    itemId: string;
  } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const queryClient = useQueryClient();

  const { data: vendedores = [], isLoading: isLoadingVendedores } = useVendedoresSimpleQuery(isGerente);
  const {
    data: inventarios = [],
    isLoading: loading,
    isFetching,
    refetch: refetchInventarios,
  } = useInventariosPendentesQuery(statusFilter, selectedVendedor);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedInventario(null);
    setDivergencias([]);
    setItensNaoContados([]);
  }, [selectedVendedor, statusFilter]);

  const filteredDivergencias = useMemo(() => {
    if (filtroResultado === 'nao_contados') return [];

    let filtered = divergencias;

    if (filtroResultado === 'com_diferenca') {
      filtered = filtered.filter((item) => {
        const dif = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        return dif !== 0;
      });
    } else if (filtroResultado === 'sobras') {
      filtered = filtered.filter((item) => {
        const dif = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        return dif > 0;
      });
    } else if (filtroResultado === 'faltas') {
      filtered = filtered.filter((item) => {
        const dif = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        return dif < 0;
      });
    } else if (filtroResultado === 'corretos') {
      filtered = filtered.filter((item) => {
        const dif = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        return dif === 0;
      });
    }

    return filtered;
  }, [divergencias, filtroResultado]);

  // For "nao_contados" filter, show those items in the table
  const tableData = useMemo(() => {
    if (filtroResultado === 'nao_contados') {
      return itensNaoContados.map((item) => ({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        estoque_teorico: item.estoque_teorico,
        quantidade_fisica: 0,
        diferenca: calcularDiferenca(item.estoque_teorico, 0),
        percentual: 0,
        tipo: 'falta' as const,
        nao_contado: true,
      }));
    }
    return filteredDivergencias.map((item) => ({ ...item, nao_contado: false }));
  }, [filteredDivergencias, itensNaoContados, filtroResultado]);

  const { paginatedData: paginatedItems, ...paginationProps } = usePagination({
    data: tableData,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
    itemsPerPage: 10,
  });

  const handleSelectInventario = useCallback(
    async (inventario: InventarioComItens) => {
      if (selectedInventario?.id === inventario.id) return;

      setIsDetailLoading(true);
      setSelectedInventario(inventario);
      setObservacoes('');
      setSearchTerm('');
      setFiltroResultado('com_diferenca');
      setEditedValues({});

      const fetchComparativoInBatches = async () => {
        const allData: any[] = [];
        let offset = 0;
        const batchSize = 500;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase.rpc('comparar_estoque_inventario_paginado', {
            p_inventario_id: inventario.id,
            p_limit: batchSize,
            p_offset: offset,
          });

          if (error) {
            console.error(`Erro ao comparar inventário (offset ${offset}):`, error);
            toast.error('Erro ao carregar divergências');
            setIsDetailLoading(false);
            return null;
          }

          if (data && data.length > 0) {
            allData.push(...(data as any[]));
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        return allData;
      };

      const comparativo = await fetchComparativoInBatches();
      if (comparativo === null) return;

      const divergenciasList: DivergenciaItem[] = [];
      const itensNaoContadosList: ItemNaoContado[] = [];

      for (const rawItem of comparativo || []) {
        const item = {
          codigo_auxiliar: rawItem.codigo_auxiliar,
          nome_produto: rawItem.nome_produto,
          estoque_teorico: Number(rawItem.estoque_teorico ?? 0),
          quantidade_fisica: Number(rawItem.quantidade_fisica ?? 0),
          divergencia: Number(rawItem.divergencia ?? 0),
          foi_contado: rawItem.foi_contado,
        };

        const diferenca = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
        const percentual =
          item.estoque_teorico !== 0
            ? (diferenca / item.estoque_teorico) * 100
            : item.quantidade_fisica > 0
              ? 100
              : 0;

        let tipo: 'ok' | 'sobra' | 'falta' = 'ok';
        if (diferenca > 0) tipo = 'sobra';
        else if (diferenca < 0) tipo = 'falta';

        if (item.foi_contado) {
          divergenciasList.push({
            codigo_auxiliar: item.codigo_auxiliar,
            nome_produto: item.nome_produto || '',
            estoque_teorico: item.estoque_teorico,
            quantidade_fisica: item.quantidade_fisica,
            diferenca,
            percentual,
            tipo,
          });
        } else {
          if (item.estoque_teorico !== 0) {
            itensNaoContadosList.push({
              codigo_auxiliar: item.codigo_auxiliar,
              nome_produto: item.nome_produto || '',
              estoque_teorico: item.estoque_teorico,
            });
          }
        }
      }

      setItensNaoContados(
        itensNaoContadosList.sort(
          (a, b) => Math.abs(b.estoque_teorico) - Math.abs(a.estoque_teorico)
        )
      );
      setDivergencias(
        divergenciasList.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
      );
      setIsDetailLoading(false);
    },
    [selectedInventario]
  );

  const handleManagerAction = async (action: 'aprovar' | 'revisao') => {
    if (!selectedInventario) return;

    if (!isGerente) {
      toast.error('Acesso negado. Apenas gerentes podem aprovar ou revisar inventários.');
      return;
    }

    if (action === 'revisao' && !observacoes.trim()) {
      toast.error('Informe o motivo da não aprovação para enviar para revisão.');
      return;
    }

    setSaving(true);
    try {
      if (action === 'aprovar') {
        const { data, error } = await supabase.functions.invoke('aprovar-e-ajustar-inventario', {
          body: { inventario_id: selectedInventario.id },
        });
        if (error) throw error;
        toast.success(data.message || 'Inventário aprovado e estoque ajustado!');
      } else {
        const { error } = await supabase
          .from('inventarios')
          .update({ status: 'revisao', observacoes_gerente: observacoes })
          .eq('id', selectedInventario.id);
        if (error) throw error;
        toast.info('Inventário enviado para revisão.');
      }

      queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedInventario(null);
      refetchInventarios();
    } catch (error: any) {
      console.error(`Erro ao ${action} inventário:`, error);
      toast.error(`Erro ao ${action} inventário`, {
        description: error.message || 'Ocorreu um erro.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditValue = (codigoAuxiliar: string, value: string) => {
    if (value === '' || value === '-') {
      setEditedValues((prev) => ({ ...prev, [codigoAuxiliar]: 0 }));
      return;
    }
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setEditedValues((prev) => ({ ...prev, [codigoAuxiliar]: numValue }));
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedInventario || Object.keys(editedValues).length === 0) return;

    setSaving(true);
    try {
      const updates = Object.entries(editedValues).map(([codigo, quantidade]) => {
        const item = selectedInventario.itens_inventario.find((i) => i.codigo_auxiliar === codigo);
        return supabase
          .from('itens_inventario')
          .update({ quantidade_fisica: quantidade })
          .eq('id', item!.id);
      });
      const results = await Promise.all(updates);
      results.forEach((res) => {
        if (res.error) throw res.error;
      });

      setDivergencias((prev) =>
        prev.map((d) => {
          if (editedValues[d.codigo_auxiliar] !== undefined) {
            const novaQuantidade = editedValues[d.codigo_auxiliar];
            const diferenca = calcularDiferenca(d.estoque_teorico, novaQuantidade);
            const tipo: 'ok' | 'sobra' | 'falta' = diferenca > 0 ? 'sobra' : diferenca < 0 ? 'falta' : 'ok';
            return { ...d, quantidade_fisica: novaQuantidade, diferenca, tipo };
          }
          return d;
        })
      );

      setEditedValues({});
      toast.success('Alterações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem || !selectedInventario) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('itens_inventario')
        .delete()
        .eq('id', deletingItem.itemId);

      if (error) throw error;

      setDivergencias((prev) =>
        prev.filter((d) => d.codigo_auxiliar !== deletingItem.codigo_auxiliar)
      );

      setSelectedInventario((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          itens_inventario: prev.itens_inventario.filter((i) => i.id !== deletingItem.itemId),
        };
      });

      toast.success(`Item ${deletingItem.codigo_auxiliar} removido do inventário.`);
      setDeletingItem(null);
    } catch (error: any) {
      console.error('Erro ao deletar item:', error);
      toast.error('Erro ao remover item', {
        description: error.message || 'Ocorreu um erro.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInventario = async () => {
    if (!selectedInventario || !isGerente) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('inventarios').delete().eq('id', selectedInventario.id);
      if (error) throw error;

      toast.success('Inventário excluído com sucesso.');
      setSelectedInventario(null);
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

  const hasEdits = Object.keys(editedValues).length > 0;
  const isPendingOrRevisao = selectedInventario && ['pendente', 'revisao'].includes(selectedInventario.status);
  const stats = useMemo(
    () => ({
      itensCorretos: divergencias.filter((d) => d.diferenca === 0).length,
      itensSobra: divergencias.filter((d) => d.diferenca > 0).length,
      itensFalta: divergencias.filter((d) => d.diferenca < 0).length,
      totalItens: divergencias.length,
      valorTotalDivergencia: divergencias.reduce((acc, d) => acc + d.diferenca, 0),
    }),
    [divergencias]
  );

  const handleExportExcel = async (exportAll: boolean = false) => {
    if (!selectedInventario || (divergencias.length === 0 && itensNaoContados.length === 0)) {
      toast.error('Não há dados para exportar.');
      return;
    }

    const dataToExport = exportAll ? divergencias : filteredDivergencias;

    // Buscar custos dos produtos em lotes
    const todosCodigos = [
      ...dataToExport.map((item) => item.codigo_auxiliar),
      ...itensNaoContados.map((item) => item.codigo_auxiliar),
    ];

    const TAMANHO_LOTE = 100;
    const custosMap: Record<string, number> = {};

    for (let i = 0; i < todosCodigos.length; i += TAMANHO_LOTE) {
      const lote = todosCodigos.slice(i, i + TAMANHO_LOTE);
      const { data: produtosCusto } = await supabase
        .from('produtos')
        .select('codigo_auxiliar, valor_produto')
        .in('codigo_auxiliar', lote);

      if (produtosCusto) {
        produtosCusto.forEach((p) => {
          custosMap[p.codigo_auxiliar] = p.valor_produto || 0;
        });
      }
    }

    const exportData = dataToExport.map((item) => {
      const diferencaCalculada = calcularDiferenca(item.estoque_teorico, item.quantidade_fisica);
      return {
        'Código Auxiliar': item.codigo_auxiliar,
        'Nome Produto': item.nome_produto,
        'Custo Produto': custosMap[item.codigo_auxiliar] || 0,
        'Estoque Teórico': item.estoque_teorico,
        'Quantidade Física': item.quantidade_fisica,
        Diferença: diferencaCalculada,
        Status: item.tipo === 'ok' ? 'OK' : item.tipo === 'sobra' ? 'Sobra' : 'Falta',
      };
    });

    itensNaoContados.forEach((item) => {
      exportData.push({
        'Código Auxiliar': item.codigo_auxiliar,
        'Nome Produto': item.nome_produto,
        'Custo Produto': custosMap[item.codigo_auxiliar] || 0,
        'Estoque Teórico': item.estoque_teorico,
        'Quantidade Física': 0,
        Diferença: calcularDiferenca(item.estoque_teorico, 0),
        Status: 'Não Contado',
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conferência');

    const vendorName = selectedInventario.profiles?.nome || selectedInventario.codigo_vendedor;
    const dateStr = format(new Date(selectedInventario.data_inventario), 'dd-MM-yyyy');
    const suffix = exportAll ? '_completo' : '_filtrado';
    const fileName = `conferencia_${vendorName}_${dateStr}${suffix}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Arquivo ${fileName} baixado com sucesso.`);
  };

  const isInitialLoading = loading || (isGerente && isLoadingVendedores);

  if (isInitialLoading) {
    return (
      <AppLayout>
        <ConferenciaSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conferência de Inventários</h1>
            <p className="text-muted-foreground">
              Compare inventários físicos com o estoque teórico e analise diferenças
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !loading} />
        </div>

        {!selectedInventario ? (
          <div>
            {/* Filters */}
            {isGerente && (
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Filtrar por vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.codigo_vendedor} value={v.codigo_vendedor}>
                        {v.nome} ({v.codigo_vendedor})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendentes">Pendentes / Revisão</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="revisao">Revisão</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <ClipboardList size={20} />
              Inventários para Análise
              <Badge variant="secondary">{inventarios.length}</Badge>
            </h2>
            {inventarios.length === 0 ? (
              <Card className="border-2 shadow-none">
                <CardContent className="py-12 text-center">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                  <h2 className="text-xl font-bold mb-2">Nenhum inventário encontrado</h2>
                  <p className="text-muted-foreground">Ajuste os filtros ou aguarde novos inventários.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {inventarios.map((inv) => {
                  const isRevisao = inv.status === 'revisao';
                  const isAprovado = inv.status === 'aprovado';
                  return (
                    <Card
                      key={inv.id}
                      className="border-2 transition-all cursor-pointer group shadow-none hover:border-blue-300"
                      onClick={() => handleSelectInventario(inv)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <User size={16} /> {inv.profiles?.nome || 'Vendedor'}
                          </CardTitle>
                          <Badge
                            variant={isRevisao ? 'destructive' : isAprovado ? 'default' : 'outline'}
                          >
                            <span className="capitalize">{inv.status}</span>
                          </Badge>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground pt-1">
                          {inv.codigo_vendedor}
                        </p>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Package size={14} />
                            {inv.itens_inventario.length} produtos · {inv.itens_inventario.reduce(
                              (sum, item) => sum + item.quantidade_fisica,
                              0
                            )} un.
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar size={14} />{' '}
                            {format(new Date(inv.data_inventario), 'dd/MM/yy')}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          Enviado{' '}
                          {formatDistanceToNow(new Date(inv.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : isDetailLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin" /> Carregando detalhes...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Back button + inventory info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedInventario(null);
                  setDivergencias([]);
                  setItensNaoContados([]);
                  setSearchTerm('');
                  setFiltroResultado('com_diferenca');
                  setObservacoes('');
                  setEditedValues({});
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para lista
              </Button>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User size={14} /> {selectedInventario.profiles?.nome || selectedInventario.codigo_vendedor}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />{' '}
                  {format(new Date(selectedInventario.data_inventario), 'dd/MM/yyyy')}
                </span>
                <Badge
                  variant={
                    selectedInventario.status === 'revisao'
                      ? 'destructive'
                      : selectedInventario.status === 'aprovado'
                        ? 'default'
                        : 'outline'
                  }
                >
                  <span className="capitalize">{selectedInventario.status}</span>
                </Badge>
              </div>
            </div>

            <DivergenciaStats {...stats} />

            {/* Manager Actions */}
            {isGerente && (
              <Card className="border-2 shadow-none">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Ações do Gerente</h3>
                      <p className="text-sm text-muted-foreground">
                        Gerencie este inventário. A aprovação é irreversível.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={isDeleting || saving}
                        size="sm"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                      {isPendingOrRevisao && (
                        <>
                          <Button
                            onClick={() => handleManagerAction('revisao')}
                            disabled={saving}
                            variant="outline"
                            size="sm"
                          >
                            <XCircle size={16} className="mr-2" />
                            Não Aprovar
                          </Button>
                          <Button
                            onClick={() => handleManagerAction('aprovar')}
                            disabled={saving}
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle size={16} className="mr-2" />
                            {saving ? 'Processando...' : 'Aprovar e Ajustar'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {isPendingOrRevisao && (
                    <div className="mt-4 space-y-2">
                      <label htmlFor="observacoes-gerente" className="text-sm font-medium">
                        Observações para o Vendedor (obrigatório para não aprovação)
                      </label>
                      <Textarea
                        id="observacoes-gerente"
                        name="observacoes"
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Se não aprovar, explique o motivo aqui..."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-2 shadow-none">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">Comparativo de Estoque</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={divergencias.length === 0}
                        className="shrink-0 h-9 w-9"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExportExcel(false)}>
                        Exportar Filtrado
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportExcel(true)}>
                        Exportar Tudo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <SearchFilter
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar produto..."
                    className="min-w-0 flex-1 basis-40"
                  />
                  <Select value={filtroResultado} onValueChange={setFiltroResultado}>
                    <SelectTrigger className="w-full basis-44 sm:w-48">
                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <SelectValue placeholder="Filtrar resultado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os itens</SelectItem>
                      <SelectItem value="com_diferenca">Com diferença</SelectItem>
                      <SelectItem value="sobras">Sobras (+)</SelectItem>
                      <SelectItem value="faltas">Faltas (-)</SelectItem>
                      <SelectItem value="corretos">Corretos (0)</SelectItem>
                      <SelectItem value="nao_contados">Não Contados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[35%]">Produto</TableHead>
                        <TableHead className="text-center">Teórico</TableHead>
                        <TableHead className="text-center">Físico</TableHead>
                        <TableHead className="text-center">Diferença</TableHead>
                        {isPendingOrRevisao && <TableHead className="text-center w-[60px]">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.length > 0 ? (
                        paginatedItems.map((item) => {
                          const isNaoContado = item.nao_contado;
                          const currentFisica = isNaoContado
                            ? 0
                            : (editedValues[item.codigo_auxiliar] ?? item.quantidade_fisica);
                          const diferencaCalculada = calcularDiferenca(
                            item.estoque_teorico,
                            currentFisica
                          );

                          return (
                            <TableRow
                              key={item.codigo_auxiliar}
                              className={
                                isNaoContado
                                  ? 'bg-muted/30'
                                  : diferencaCalculada > 0
                                    ? 'bg-blue-500/5'
                                    : diferencaCalculada < 0
                                      ? 'bg-orange-500/5'
                                      : ''
                              }
                            >
                              <TableCell className="font-medium">
                                <span className="font-mono text-sm">{item.codigo_auxiliar}</span>
                                {isNaoContado && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Não contado
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {item.estoque_teorico}
                              </TableCell>
                              <TableCell className="text-center">
                                {isPendingOrRevisao && !isNaoContado ? (
                                  <Input
                                    type="text"
                                    value={currentFisica}
                                    onChange={(e) =>
                                      handleEditValue(item.codigo_auxiliar, e.target.value)
                                    }
                                    className="w-20 h-8 text-center font-bold border-2 mx-auto"
                                  />
                                ) : (
                                  <span className="font-semibold">{currentFisica}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <span
                                  className={`font-bold ${
                                    diferencaCalculada > 0
                                      ? 'text-blue-600'
                                      : diferencaCalculada < 0
                                        ? 'text-orange-600'
                                        : 'text-muted-foreground'
                                  }`}
                                >
                                  {diferencaCalculada > 0
                                    ? `+${diferencaCalculada}`
                                    : diferencaCalculada}
                                </span>
                              </TableCell>
                              {isPendingOrRevisao && (
                                <TableCell className="text-center">
                                  {!isNaoContado && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => {
                                        const inventarioItem =
                                          selectedInventario?.itens_inventario.find(
                                            (i) => i.codigo_auxiliar === item.codigo_auxiliar
                                          );
                                        if (inventarioItem) {
                                          setDeletingItem({
                                            codigo_auxiliar: item.codigo_auxiliar,
                                            nome_produto: item.nome_produto,
                                            itemId: inventarioItem.id,
                                          });
                                        }
                                      }}
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={isPendingOrRevisao ? 5 : 4} className="h-24 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Minus className="h-8 w-8 text-muted-foreground/50" />
                              <p className="text-sm text-muted-foreground">
                                Nenhum item encontrado com os filtros aplicados
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {paginatedItems.length > 0 && (
                  <div className="pt-4">
                    <Pagination {...paginationProps} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save edits button */}
            {hasEdits && isPendingOrRevisao && (
              <div className="flex justify-end">
                <Button
                  onClick={handleSaveEdits}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save size={16} className="mr-2" />
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete item dialog */}
      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o item{' '}
              <span className="font-bold">{deletingItem?.codigo_auxiliar}</span> do inventário?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive hover:bg-destructive/90"
            >
              {saving ? 'Removendo...' : 'Remover Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete inventory dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o inventário e todos os
              seus itens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInventario}
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
