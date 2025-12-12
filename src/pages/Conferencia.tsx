import { useEffect, useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { DivergenciaItem, InventoryStatus } from '@/types/app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown, Save, PackageX, ChevronDown, ChevronUp, User, Calendar, Package, Clock, ChevronsRight, Loader2 } from 'lucide-react';
import { DivergenciaStats } from '@/components/DivergenciaStats';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
  profiles?: { nome: string };
};

type ItemNaoContado = {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
};

export default function Conferencia() {
  const [inventarios, setInventarios] = useState<InventarioComItens[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInventario, setSelectedInventario] = useState<InventarioComItens | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaItem[]>([]);
  const [itensNaoContados, setItensNaoContados] = useState<ItemNaoContado[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [observacoes, setObservacoes] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [showItensNaoContados, setShowItensNaoContados] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const queryClient = useQueryClient();

  const filteredDivergencias = useMemo(() => {
    let filtered = divergencias;
    if (filterTipo === 'ok') filtered = filtered.filter(item => item.tipo === 'ok');
    if (filterTipo === 'sobra') filtered = filtered.filter(item => item.tipo === 'sobra');
    if (filterTipo === 'falta') filtered = filtered.filter(item => item.tipo === 'falta');
    return filtered;
  }, [divergencias, filterTipo]);

  const {
    paginatedData: paginatedDivergencias,
    ...paginationProps
  } = usePagination({
    data: filteredDivergencias,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
    itemsPerPage: 20,
  });

  useEffect(() => {
    fetchInventarios();
  }, []);
  
  const fetchInventarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventarios')
      .select(`*, itens_inventario (*), profiles!inventarios_user_id_fkey (nome)`)
      .in('status', ['pendente', 'revisao'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar inventários:', error);
      toast.error("Falha ao carregar inventários.");
    } else {
      setInventarios(data as unknown as InventarioComItens[]);
      if (data.length > 0 && !selectedInventario) {
        handleSelectInventario(data[0]);
      }
    }
    setLoading(false);
  };
  
  const handleSelectInventario = async (inventario: InventarioComItens) => {
    if (selectedInventario?.id === inventario.id) return;
    
    setIsDetailLoading(true);
    setSelectedInventario(inventario);
    setObservacoes('');
    setSearchTerm('');
    setFilterTipo('todos');
    setEditedValues({});
    setShowItensNaoContados(false);
  
    const estoque = await calcularEstoqueTeorico(inventario.codigo_vendedor);
    
    const divergenciasList: DivergenciaItem[] = [];
    const itensContadosCodigos = new Set(inventario.itens_inventario.map(i => i.codigo_auxiliar));
    const itensNaoContadosList: ItemNaoContado[] = [];

    for (const item of inventario.itens_inventario) {
      const estoqueItem = estoque.get(item.codigo_auxiliar);
      const estoqueTeoricoValue = estoqueItem?.estoque_teorico || 0;
      const diferenca = item.quantidade_fisica - estoqueTeoricoValue;
      const percentual = estoqueTeoricoValue !== 0 ? ((diferenca / estoqueTeoricoValue) * 100) : (item.quantidade_fisica > 0 ? 100 : 0);
      let tipo: 'ok' | 'sobra' | 'falta' = 'ok';
      if (diferenca > 0) tipo = 'sobra';
      else if (diferenca < 0) tipo = 'falta';

      divergenciasList.push({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto || '',
        estoque_teorico: estoqueTeoricoValue,
        quantidade_fisica: item.quantidade_fisica,
        diferenca, percentual, tipo,
      });
    }

    estoque.forEach((item, codigo) => {
      if (!itensContadosCodigos.has(codigo) && item.estoque_teorico > 0) {
        itensNaoContadosList.push({
          codigo_auxiliar: codigo,
          nome_produto: item.nome_produto,
          estoque_teorico: item.estoque_teorico,
        });
      }
    });

    setItensNaoContados(itensNaoContadosList.sort((a, b) => b.estoque_teorico - a.estoque_teorico));
    setDivergencias(divergenciasList.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)));
    setIsDetailLoading(false);
  };
  
  const handleManagerAction = async (action: 'aprovar' | 'revisao') => {
    if (!selectedInventario) return;
  
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
  
      queryClient.invalidateQueries({ queryKey: ['movimentacoes', 'inventarios', 'dashboard'] });
      setSelectedInventario(null); // Clear selection
      fetchInventarios(); // Refresh list
    } catch (error: any) {
      console.error(`Erro ao ${action} inventário:`, error);
      toast.error(`Erro ao ${action} inventário`, { description: error.message || 'Ocorreu um erro.' });
    } finally {
      setSaving(false);
    }
  };
  
  const handleEditValue = (codigoAuxiliar: string, value: string) => {
    const numValue = parseInt(value, 10);
    setEditedValues(prev => ({ ...prev, [codigoAuxiliar]: isNaN(numValue) ? 0 : numValue }));
  };

  const handleSaveEdits = async () => {
    if (!selectedInventario || Object.keys(editedValues).length === 0) return;

    setSaving(true);
    try {
      const updates = Object.entries(editedValues).map(([codigo, quantidade]) => {
        const item = selectedInventario.itens_inventario.find(i => i.codigo_auxiliar === codigo);
        return supabase.from('itens_inventario').update({ quantidade_fisica: quantidade }).eq('id', item!.id);
      });
      const results = await Promise.all(updates);
      results.forEach(res => { if (res.error) throw res.error; });

      setDivergencias(prev => prev.map(d => {
        if (editedValues[d.codigo_auxiliar] !== undefined) {
          const novaQuantidade = editedValues[d.codigo_auxiliar];
          const diferenca = novaQuantidade - d.estoque_teorico;
          return { ...d, quantidade_fisica: novaQuantidade, diferenca };
        }
        return d;
      }));

      setEditedValues({});
      toast.success('Alterações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const hasEdits = Object.keys(editedValues).length > 0;
  const stats = useMemo(() => ({
    itensCorretos: divergencias.filter(d => d.diferenca === 0).length,
    itensSobra: divergencias.filter(d => d.diferenca > 0).length,
    itensFalta: divergencias.filter(d => d.diferenca < 0).length,
    valorTotalDivergencia: divergencias.reduce((acc, d) => acc + d.diferenca, 0),
  }), [divergencias]);

  if (loading) {
    return <AppLayout><div className="text-center py-8 text-muted-foreground">Carregando inventários...</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conferência de Inventários</h1>
          <p className="text-muted-foreground">
            Compare inventários físicos com o estoque teórico e analise divergências
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-12rem)]">
          {/* Coluna de Inventários (Master) */}
          <div className="lg:col-span-1 overflow-y-auto pr-2">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <ClipboardList size={20} />
              Inventários para Análise
              <Badge variant="secondary">{inventarios.length}</Badge>
            </h2>
            {inventarios.length === 0 ? (
              <Card className="border-2">
                <CardContent className="py-12 text-center">
                  <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
                  <h2 className="text-xl font-bold mb-2">Nenhum inventário pendente</h2>
                  <p className="text-muted-foreground">Não há nada para conferir no momento.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {inventarios.map((inv) => {
                  const isRevisao = inv.status === 'revisao';
                  return (
                    <Card
                      key={inv.id}
                      className={`border-2 transition-all cursor-pointer group ${selectedInventario?.id === inv.id ? 'border-primary shadow-lg' : 'hover:border-primary/70'}`}
                      onClick={() => handleSelectInventario(inv)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <User size={16} /> {inv.profiles?.nome || 'Vendedor'}
                          </CardTitle>
                          <Badge variant={isRevisao ? 'destructive' : 'outline'}>{isRevisao ? 'Revisão' : 'Pendente'}</Badge>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground pt-1">{inv.codigo_vendedor}</p>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Package size={14} /> {inv.itens_inventario.length} itens</span>
                          <span className="flex items-center gap-1.5"><Calendar size={14} /> {format(new Date(inv.data_inventario), "dd/MM/yy")}</span>
                        </div>
                        <div className="text-xs text-muted-foreground pt-1">
                          Enviado {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coluna de Detalhes (Detail) */}
          <div className="lg:col-span-2 overflow-y-auto pr-2 border-l-2 pl-6">
            {!selectedInventario ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <ChevronsRight size={48} className="mb-4" />
                <h2 className="text-xl font-bold">Selecione um inventário</h2>
                <p>Escolha um inventário da lista para iniciar a análise.</p>
              </div>
            ) : isDetailLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="mr-2 h-8 w-8 animate-spin" /> Carregando detalhes...
              </div>
            ) : (
              <div className="space-y-4">
                <DivergenciaStats totalItens={divergencias.length} {...stats} />
                
                {itensNaoContados.length > 0 && (
                  <Card className="bg-amber-50 border-amber-300">
                    <CardHeader className="pb-3">
                      <CardTitle 
                        className="text-base flex items-center justify-between cursor-pointer"
                        onClick={() => setShowItensNaoContados(!showItensNaoContados)}
                      >
                        <span className="flex items-center gap-2 text-amber-800"><PackageX size={18} /> {itensNaoContados.length} Itens Não Contados</span>
                        {showItensNaoContados ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </CardTitle>
                    </CardHeader>
                    {showItensNaoContados && (
                      <CardContent>
                        <p className="text-sm text-amber-700 mb-3">Estes itens possuem estoque teórico mas não foram contados.</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {itensNaoContados.map((item) => (
                            <div key={item.codigo_auxiliar} className="flex justify-between items-center text-sm bg-amber-100 p-2 rounded">
                              <span><span className="font-mono font-bold">{item.codigo_auxiliar}</span> - {item.nome_produto}</span>
                              <Badge className="bg-amber-600">Teórico: {item.estoque_teorico}</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row gap-3">
                      <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto..." />
                      <Select value={filterTipo} onValueChange={setFilterTipo}>
                        <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os Itens</SelectItem>
                          <SelectItem value="ok">Apenas OK</SelectItem>
                          <SelectItem value="sobra">Apenas Sobras</SelectItem>
                          <SelectItem value="falta">Apenas Faltas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[45%]">Produto</TableHead>
                            <TableHead className="text-center">Teórico</TableHead>
                            <TableHead className="text-center">Físico</TableHead>
                            <TableHead className="text-center">Divergência</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedDivergencias.length > 0 ? paginatedDivergencias.map((item) => (
                            <TableRow key={item.codigo_auxiliar} className={item.tipo !== 'ok' ? `bg-${item.tipo === 'sobra' ? 'yellow' : 'red'}-500/5` : ''}>
                              <TableCell>
                                <p className="font-medium truncate">{item.nome_produto}</p>
                                <p className="font-mono text-xs text-muted-foreground">{item.codigo_auxiliar}</p>
                              </TableCell>
                              <TableCell className="text-center font-medium">{item.estoque_teorico}</TableCell>
                              <TableCell className="text-center">
                                <Input
                                  type="text"
                                  value={editedValues[item.codigo_auxiliar] ?? item.quantidade_fisica}
                                  onChange={(e) => handleEditValue(item.codigo_auxiliar, e.target.value)}
                                  className="w-20 h-8 text-center font-bold border-2 mx-auto"
                                />
                              </TableCell>
                              <TableCell className={`text-center font-bold text-lg ${item.diferenca > 0 ? 'text-yellow-600' : item.diferenca < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                {item.diferenca > 0 ? `+${item.diferenca}` : item.diferenca}
                              </TableCell>
                            </TableRow>
                          )) : (
                            <TableRow><TableCell colSpan={4} className="h-24 text-center">Nenhum item corresponde ao filtro.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    {paginationProps.totalPages > 1 && (
                      <div className="pt-4"><Pagination {...paginationProps} /></div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <label className="font-medium">Observações para o Vendedor (opcional)</label>
                  <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Se não aprovar, explique o motivo aqui..." />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  {hasEdits && (
                    <Button onClick={handleSaveEdits} disabled={saving} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                      <Save size={16} className="mr-2" />{saving ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button onClick={() => handleManagerAction('revisao')} disabled={saving} variant="destructive" className="w-full sm:w-auto">
                    <XCircle size={16} className="mr-2" />Não Aprovar
                  </Button>
                  <Button onClick={() => handleManagerAction('aprovar')} disabled={saving} className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                    <CheckCircle size={16} className="mr-2" />{saving ? 'Processando...' : 'Aprovar e Ajustar'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
