import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Inventario, ItemInventario, EstoqueItem, InventoryStatus } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, CheckCircle, XCircle, Eye } from 'lucide-react';

interface InventarioComItens extends Inventario {
  itens_inventario: ItemInventario[];
  profiles?: { nome: string };
}

interface DivergenciaItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  diferenca: number;
}

export default function Conferencia() {
  const [inventarios, setInventarios] = useState<InventarioComItens[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInventario, setSelectedInventario] = useState<InventarioComItens | null>(null);
  const [divergencias, setDivergencias] = useState<DivergenciaItem[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

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
      .eq('status', 'pendente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar inventários:', error);
    } else {
      setInventarios(data as unknown as InventarioComItens[]);
    }
    setLoading(false);
  };

  const calcularEstoqueTeorico = async (codigoVendedor: string): Promise<Map<string, EstoqueItem>> => {
    const { data } = await supabase
      .from('itens_pedido')
      .select(`
        codigo_auxiliar,
        nome_produto,
        quantidade,
        pedidos!inner (
          codigo_vendedor,
          codigo_tipo
        )
      `)
      .eq('pedidos.codigo_vendedor', codigoVendedor);

    const estoqueMap = new Map<string, EstoqueItem>();

    data?.forEach((item: any) => {
      const key = item.codigo_auxiliar;
      const existing = estoqueMap.get(key) || {
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        modelo: '',
        cor: '',
        quantidade_remessa: 0,
        quantidade_venda: 0,
        estoque_teorico: 0,
      };

      const quantidade = Number(item.quantidade) || 0;
      const codigoTipo = item.pedidos?.codigo_tipo;

      if (codigoTipo === 7) {
        existing.quantidade_remessa += quantidade;
      } else if (codigoTipo === 2) {
        existing.quantidade_venda += quantidade;
      }

      existing.estoque_teorico = existing.quantidade_remessa - existing.quantidade_venda;
      estoqueMap.set(key, existing);
    });

    return estoqueMap;
  };

  const openConferencia = async (inventario: InventarioComItens) => {
    setSelectedInventario(inventario);
    setObservacoes('');

    const estoque = await calcularEstoqueTeorico(inventario.codigo_vendedor);
    
    const divergenciasList: DivergenciaItem[] = [];

    // Verificar itens do inventário
    for (const item of inventario.itens_inventario) {
      const estoqueItem = estoque.get(item.codigo_auxiliar);
      const estoqueTeoricoValue = estoqueItem?.estoque_teorico || 0;
      const diferenca = item.quantidade_fisica - estoqueTeoricoValue;

      divergenciasList.push({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto || '',
        estoque_teorico: estoqueTeoricoValue,
        quantidade_fisica: item.quantidade_fisica,
        diferenca,
      });
    }

    // Verificar itens em estoque que não foram inventariados
    for (const [codigo, estoqueItem] of estoque) {
      if (estoqueItem.estoque_teorico > 0 && !inventario.itens_inventario.some(i => i.codigo_auxiliar === codigo)) {
        divergenciasList.push({
          codigo_auxiliar: codigo,
          nome_produto: estoqueItem.nome_produto,
          estoque_teorico: estoqueItem.estoque_teorico,
          quantidade_fisica: 0,
          diferenca: -estoqueItem.estoque_teorico,
        });
      }
    }

    setDivergencias(divergenciasList.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)));
    setDialogOpen(true);
  };

  const handleAprovar = async () => {
    if (!selectedInventario) return;

    const { error } = await supabase
      .from('inventarios')
      .update({ 
        status: 'aprovado' as InventoryStatus,
        observacoes_gerente: observacoes 
      })
      .eq('id', selectedInventario.id);

    if (error) {
      toast.error('Erro ao aprovar inventário');
    } else {
      toast.success('Inventário aprovado!');
      setDialogOpen(false);
      fetchInventarios();
    }
  };

  const handleRevisao = async () => {
    if (!selectedInventario) return;

    if (!observacoes.trim()) {
      toast.error('Informe o motivo da revisão');
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
      toast.error('Erro ao solicitar revisão');
    } else {
      toast.success('Revisão solicitada!');
      setDialogOpen(false);
      fetchInventarios();
    }
  };

  const hasDivergencias = divergencias.some(d => d.diferenca !== 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conferência de Inventários</h1>
          <p className="text-muted-foreground">
            Compare inventários físicos com o estoque teórico
          </p>
        </div>

        {/* Dialog de conferência */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="border-2 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conferência de Inventário</DialogTitle>
            </DialogHeader>
            
            {selectedInventario && (
              <div className="space-y-4">
                <div className="p-3 bg-secondary">
                  <p><strong>Vendedor:</strong> {selectedInventario.profiles?.nome}</p>
                  <p><strong>Código:</strong> {selectedInventario.codigo_vendedor}</p>
                  <p><strong>Data:</strong> {format(new Date(selectedInventario.data_inventario), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  {selectedInventario.observacoes && (
                    <p className="mt-2"><strong>Obs. do vendedor:</strong> {selectedInventario.observacoes}</p>
                  )}
                </div>

                {hasDivergencias && (
                  <div className="p-3 bg-yellow-50 border-2 border-yellow-300">
                    <p className="font-medium text-yellow-800">
                      Atenção: Foram encontradas divergências entre o inventário e o estoque teórico.
                    </p>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-foreground">
                        <th className="text-left py-2">Código</th>
                        <th className="text-center py-2">Teórico</th>
                        <th className="text-center py-2">Físico</th>
                        <th className="text-center py-2">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divergencias.map((item) => (
                        <tr 
                          key={item.codigo_auxiliar} 
                          className={`border-b ${
                            item.diferenca !== 0 
                              ? item.diferenca > 0 
                                ? 'bg-green-50' 
                                : 'bg-red-50'
                              : ''
                          }`}
                        >
                          <td className="py-2">
                            <span className="font-mono">{item.codigo_auxiliar}</span>
                            <br />
                            <span className="text-xs text-muted-foreground">{item.nome_produto}</span>
                          </td>
                          <td className="py-2 text-center font-medium">{item.estoque_teorico}</td>
                          <td className="py-2 text-center font-medium">{item.quantidade_fisica}</td>
                          <td className="py-2 text-center">
                            <span className={`font-bold ${
                              item.diferenca > 0 
                                ? 'text-green-600' 
                                : item.diferenca < 0 
                                  ? 'text-red-600' 
                                  : ''
                            }`}>
                              {item.diferenca > 0 ? '+' : ''}{item.diferenca}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <label className="font-medium">Observações do Gerente</label>
                  <Textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Adicione observações sobre a conferência..."
                    className="mt-2 border-2"
                  />
                </div>

                <div className="flex gap-3">
                  <Button onClick={handleAprovar} className="flex-1 bg-green-600 hover:bg-green-700">
                    <CheckCircle className="mr-2" size={16} />
                    Aprovar
                  </Button>
                  <Button 
                    onClick={handleRevisao} 
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="mr-2" size={16} />
                    Solicitar Revisão
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
              <Card key={inventario.id} className="border-2">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold">{inventario.profiles?.nome || 'Vendedor'}</h3>
                      <p className="text-sm text-muted-foreground">
                        Código: {inventario.codigo_vendedor} • {inventario.itens_inventario.length} itens
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(inventario.data_inventario), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button onClick={() => openConferencia(inventario)}>
                      <Eye className="mr-2" size={16} />
                      Conferir
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
