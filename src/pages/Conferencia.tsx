import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { DivergenciaItem, InventoryStatus } from '@/types/app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, CheckCircle, XCircle, Eye, AlertTriangle, TrendingUp, TrendingDown, Save, Edit2 } from 'lucide-react';
import { DivergenciaStats } from '@/components/DivergenciaStats';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { useQueryClient } from '@tanstack/react-query';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
  profiles?: { nome: string };
};

export default function Conferencia() {
  const [inventarios, setInventarios] = useState<InventarioComItens[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInventario, setSelectedInventario] = useState<InventarioComItens | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [observacoes, setObservacoes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();

  // Filtrar divergências antes da paginação
  const filteredDivergencias = divergencias.filter(item => {
    const matchesSearch = 
      item.codigo_auxiliar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nome_produto.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTipo = 
      filterTipo === 'todos' ||
      (filterTipo === 'ok' && item.tipo === 'ok') ||
      (filterTipo === 'sobra' && item.tipo === 'sobra') ||
      (filterTipo === 'falta' && item.tipo === 'falta');

    return matchesSearch && matchesTipo;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedDivergencias,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({
    data: filteredDivergencias,
    itemsPerPage: 20,
  });

  useEffect(() => {
    fetchInventarios();
  }, []);

  const fetchInventarios = async () => {
    const { data, error } = await supabase
      .from('inventarios')
      .select(`
        *,
        itens_inventario (*),
        profiles!inventarios_user_id_fkey (nome)
      `)
      .in('status', ['pendente', 'revisao'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar inventários:', error);
    } else {
      setInventarios(data as unknown as InventarioComItens[]);
    }
    setLoading(false);
  };

  const openConferencia = async (inventario: InventarioComItens) => {
    setSelectedInventario(inventario);
    setObservacoes('');
    setSearchTerm('');
    setFilterTipo('todos');
    setEditedValues({});

    const estoque = await calcularEstoqueTeorico(inventario.codigo_vendedor);
    
    const divergenciasList: DivergenciaItem[] = [];

    // Verificar apenas os itens que o vendedor escaneou
    for (const item of inventario.itens_inventario) {
      const estoqueItem = estoque.get(item.codigo_auxiliar);
      const estoqueTeoricoValue = estoqueItem?.estoque_teorico || 0;
      const diferenca = item.quantidade_fisica - estoqueTeoricoValue;
      const percentual = estoqueTeoricoValue > 0 
        ? ((diferenca / estoqueTeoricoValue) * 100) 
        : (item.quantidade_fisica > 0 ? 100 : 0);

      let tipo: 'ok' | 'sobra' | 'falta' = 'ok';
      if (diferenca > 0) tipo = 'sobra';
      else if (diferenca < 0) tipo = 'falta';

      divergenciasList.push({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto || '',
        estoque_teorico: estoqueTeoricoValue,
        quantidade_fisica: item.quantidade_fisica,
        diferenca,
        percentual,
        tipo,
      });
    }

    setDivergencias(divergenciasList.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)));
    setDialogOpen(true);
  };

  const handleAprovar = async () => {
    if (!selectedInventario) return;

    setSaving(true);
    try {
      // Chamar a função Edge para aprovar e ajustar o estoque real
      const { data, error } = await supabase.functions.invoke('aprovar-e-ajustar-inventario', {
        body: { inventario_id: selectedInventario.id },
      });

      if (error) throw error;

      toast.success(data.message || 'Inventário aprovado e estoque real atualizado!');

      // Invalidate queries to refetch data across the app
      queryClient.invalidateQueries({ queryKey: ['movimentacoes'] });
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });

      setDialogOpen(false);
      fetchInventarios();
    } catch (error: any) {
      console.error('Erro ao aprovar inventário:', error);
      toast.error('Erro ao aprovar inventário', {
        description: error.message || error.data?.error || 'Ocorreu um erro inesperado.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevisao = async () => {
    if (!selectedInventario) return;

    if (!observacoes.trim()) {
      toast.error('Informe o motivo da não aprovação');
      return;
    }

    const { error } = await supabase
      .from('inventarios')
      .update({ 
        status: 'revisao' as InventoryStatus,
        observacoes_gerente: observacoes 
      })
      .eq('id', selectedInventario.id);

    if (error) {
      toast.error('Erro ao rejeitar inventário');
    } else {
      toast.success('Inventário não aprovado!');
      setDialogOpen(false);
      fetchInventarios();
    }
  };

  const handleEditValue = (codigoAuxiliar: string, value: number) => {
    setEditedValues(prev => ({ ...prev, [codigoAuxiliar]: value }));
  };

  const handleSaveEdits = async () => {
    if (!selectedInventario || Object.keys(editedValues).length === 0) return;

    setSaving(true);
    try {
      // Update each edited item
      for (const [codigoAuxiliar, novaQuantidade] of Object.entries(editedValues)) {
        const item = selectedInventario.itens_inventario.find(i => i.codigo_auxiliar === codigoAuxiliar);
        
        if (item) {
          // Update existing item
          const { error } = await supabase
            .from('itens_inventario')
            .update({ quantidade_fisica: novaQuantidade })
            .eq('id', item.id);
          
          if (error) throw error;
        } else {
          // Insert new item (for products not originally counted)
          const divergencia = divergencias.find(d => d.codigo_auxiliar === codigoAuxiliar);
          const { error } = await supabase
            .from('itens_inventario')
            .insert({
              inventario_id: selectedInventario.id,
              codigo_auxiliar: codigoAuxiliar,
              nome_produto: divergencia?.nome_produto || '',
              quantidade_fisica: novaQuantidade,
            });
          
          if (error) throw error;
        }
      }

      // Update divergencias state with new values
      setDivergencias(prev => prev.map(d => {
        const editedValue = editedValues[d.codigo_auxiliar];
        if (editedValue !== undefined) {
          const diferenca = editedValue - d.estoque_teorico;
          const percentual = d.estoque_teorico > 0 
            ? ((diferenca / d.estoque_teorico) * 100) 
            : (editedValue > 0 ? 100 : 0);
          let tipo: 'ok' | 'sobra' | 'falta' = 'ok';
          if (diferenca > 0) tipo = 'sobra';
          else if (diferenca < 0) tipo = 'falta';
          
          return { ...d, quantidade_fisica: editedValue, diferenca, percentual, tipo };
        }
        return d;
      }));

      setEditedValues({});
      toast.success('Alterações salvas!');
      fetchInventarios(); // Refresh to get updated data
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  };

  const hasEdits = Object.keys(editedValues).length > 0;

  // Estatísticas
  const itensCorretos = divergencias.filter(d => d.diferenca === 0).length;
  const itensSobra = divergencias.filter(d => d.diferenca > 0).length;
  const itensFalta = divergencias.filter(d => d.diferenca < 0).length;
  const valorTotalDivergencia = divergencias.reduce((acc, d) => acc + d.diferenca, 0);
  const hasDivergencias = divergencias.some(d => d.diferenca !== 0);

  const getTipoIcon = (tipo: 'ok' | 'sobra' | 'falta') => {
    switch (tipo) {
      case 'ok':
        return <CheckCircle size={14} className="text-green-600" />;
      case 'sobra':
        return <TrendingUp size={14} className="text-yellow-600" />;
      case 'falta':
        return <TrendingDown size={14} className="text-red-600" />;
    }
  };

  const getTipoLabel = (tipo: 'ok' | 'sobra' | 'falta') => {
    switch (tipo) {
      case 'ok': return 'OK';
      case 'sobra': return 'SOBRA';
      case 'falta': return 'FALTA';
    }
  };

  const getTipoBgClass = (tipo: 'ok' | 'sobra' | 'falta') => {
    switch (tipo) {
      case 'ok': return 'bg-green-50 border-green-200';
      case 'sobra': return 'bg-yellow-50 border-yellow-200';
      case 'falta': return 'bg-red-50 border-red-200';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conferência de Inventários</h1>
          <p className="text-muted-foreground">
            Compare inventários físicos com o estoque teórico e analise divergências
          </p>
        </div>

        {/* Dialog de conferência */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="border-2 max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Análise de Divergências</DialogTitle>
              <DialogDescription>
                Analise as divergências entre o estoque teórico e físico. Você pode editar as quantidades antes de aprovar.
              </DialogDescription>
            </DialogHeader>
            
            {selectedInventario && (
              <div className="space-y-4">
                <div className="p-3 bg-secondary border-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Vendedor</p>
                      <p className="font-bold">{selectedInventario.profiles?.nome}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Código</p>
                      <p className="font-mono font-bold">{selectedInventario.codigo_vendedor}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Data do Inventário</p>
                      <p className="font-medium">{format(new Date(selectedInventario.data_inventario), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total de Itens</p>
                      <p className="font-bold">{divergencias.length}</p>
                    </div>
                  </div>
                  {selectedInventario.observacoes && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-sm text-muted-foreground">Observações do vendedor:</p>
                      <p className="text-sm mt-1">{selectedInventario.observacoes}</p>
                    </div>
                  )}
                </div>

                {/* Estatísticas */}
                <DivergenciaStats
                  totalItens={divergencias.length}
                  itensCorretos={itensCorretos}
                  itensSobra={itensSobra}
                  itensFalta={itensFalta}
                  valorTotalDivergencia={valorTotalDivergencia}
                />

                {hasDivergencias && (
                  <div className="p-3 bg-yellow-50 border-2 border-yellow-300 flex items-start gap-2">
                    <AlertTriangle className="text-yellow-800 shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="font-medium text-yellow-800">
                        Atenção: {itensSobra + itensFalta} divergências encontradas
                      </p>
                      <p className="text-sm text-yellow-700">
                        {itensSobra > 0 && `${itensSobra} produto(s) com sobra`}
                        {itensSobra > 0 && itensFalta > 0 && ' • '}
                        {itensFalta > 0 && `${itensFalta} produto(s) com falta`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Filtros */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <SearchFilter
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por código ou produto..."
                  />
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="w-full sm:w-40 border-2">
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-2 z-50">
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="ok">Apenas OK</SelectItem>
                      <SelectItem value="sobra">Apenas Sobras</SelectItem>
                      <SelectItem value="falta">Apenas Faltas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="overflow-x-auto border-2 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 bg-secondary">
                        <th className="text-left py-3 px-3">Produto</th>
                        <th className="text-center py-3 px-3">Teórico</th>
                        <th className="text-center py-3 px-3">Físico</th>
                        <th className="text-center py-3 px-3">Diferença</th>
                        <th className="text-center py-3 px-3">%</th>
                        <th className="text-center py-3 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDivergencias.map((item) => (
                        <tr 
                          key={item.codigo_auxiliar} 
                          className={`border-b ${getTipoBgClass(item.tipo)}`}
                        >
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-sm">{item.codigo_auxiliar}</span>
                            <br />
                            <span className="text-xs text-muted-foreground">{item.nome_produto}</span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-blue-600">{item.estoque_teorico}</td>
                          <td className="py-3 px-3 text-center">
                            <Input
                              type="number"
                              min="0"
                              value={editedValues[item.codigo_auxiliar] ?? item.quantidade_fisica}
                              onChange={(e) => handleEditValue(item.codigo_auxiliar, parseInt(e.target.value) || 0)}
                              className="w-20 text-center font-bold border-2 mx-auto"
                            />
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`font-bold text-lg ${
                              item.diferenca > 0 
                                ? 'text-yellow-600' 
                                : item.diferenca < 0 
                                  ? 'text-red-600' 
                                  : 'text-green-600'
                            }`}>
                              {item.diferenca > 0 ? '+' : ''}{item.diferenca}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`text-sm font-medium ${
                              item.percentual > 0 
                                ? 'text-yellow-700' 
                                : item.percentual < 0 
                                  ? 'text-red-700' 
                                  : 'text-green-700'
                            }`}>
                              {item.percentual > 0 ? '+' : ''}{item.percentual.toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant="outline" className={`${getTipoBgClass(item.tipo)} border-2 font-bold`}>
                              <span className="flex items-center gap-1">
                                {getTipoIcon(item.tipo)}
                                {getTipoLabel(item.tipo)}
                              </span>
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalItems > itemsPerPage && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                )}

                <div>
                  <label className="font-medium">Observações do Gerente</label>
                  <Textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Adicione observações sobre a conferência..."
                    className="mt-2 border-2"
                    rows={3}
                  />
                </div>

                {hasEdits && (
                  <Button onClick={handleSaveEdits} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700">
                    <Save className="mr-2" size={16} />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                )}

                <div className="flex gap-3">
                  <Button onClick={handleAprovar} className="flex-1 bg-green-600 hover:bg-green-700">
                    <CheckCircle className="mr-2" size={16} />
                    Aprovar Inventário
                  </Button>
                  <Button 
                    onClick={handleRevisao} 
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="mr-2" size={16} />
                    Não Aprovar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : inventarios.length === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <ClipboardList size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Nenhum inventário pendente</h2>
              <p className="text-muted-foreground">
                Não há inventários aguardando conferência.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {inventarios.map((inventario) => (
              <Card key={inventario.id} className={`border-2 hover:border-primary transition-colors ${inventario.status === 'revisao' ? 'border-yellow-400 bg-yellow-50/50' : ''}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold">{inventario.profiles?.nome || 'Vendedor'}</h3>
                        <Badge variant="outline" className="font-mono">
                          {inventario.codigo_vendedor}
                        </Badge>
                        {inventario.status === 'revisao' ? (
                          <Badge className="bg-yellow-500 text-yellow-950 border-0">
                            Em Revisão
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500 text-white border-0">
                            Pendente
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {inventario.itens_inventario.length} itens contados
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(inventario.data_inventario), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button onClick={() => openConferencia(inventario)} size="lg">
                      <Eye className="mr-2" size={16} />
                      Analisar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
