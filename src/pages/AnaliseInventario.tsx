import { AppLayout } from '@/components/layout/AppLayout';
import { useState, useEffect, useMemo } from 'react';
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
import { AlertTriangle, PackageSearch, CheckCircle, Loader2 } from 'lucide-react';

interface InventarioInfo {
  id: string;
  data_inventario: string;
  status: string;
}

interface ComparativoItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  divergencia: number;
}

export default function AnaliseInventario() {
  const { profile } = useAuth();
  const [inventarios, setInventarios] = useState<InventarioInfo[]>([]);
  const [selectedInventario, setSelectedInventario] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparativo, setComparativo] = useState<ComparativoItem[]>([]);

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    const fetchInventarios = async () => {
      if (!profile) return;

      let query = supabase
        .from('inventarios')
        .select('id, data_inventario, status')
        .order('data_inventario', { ascending: false });
      
      // Gerentes podem ver todos, vendedores apenas os seus
      if (!isGerente) {
        query = query.eq('codigo_vendedor', profile.codigo_vendedor);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Erro ao buscar inventários:", error);
        setError("Não foi possível carregar os inventários.");
      } else {
        setInventarios(data);
        if (data.length > 0 && !selectedInventario) {
          setSelectedInventario(data[0].id);
        }
      }
    };

    fetchInventarios();
  }, [profile, isGerente, selectedInventario]);

  useEffect(() => {
    const fetchComparativo = async () => {
      if (!selectedInventario) return;

      setLoading(true);
      setError(null);
      setComparativo([]);
      
      const { data, error: rpcError } = await supabase.rpc('comparar_estoque_inventario', {
        p_inventario_id: selectedInventario,
      });

      if (rpcError) {
        console.error('Erro ao buscar comparativo:', rpcError);
        setError('Erro ao gerar a análise. Verifique se as funções SQL (`comparar_estoque_inventario` e `calcular_estoque_vendedor_ate_data`) foram criadas corretamente no banco de dados.');
        setComparativo([]);
      } else {
        setComparativo(data || []);
      }
      
      setLoading(false);
    };

    fetchComparativo();
  }, [selectedInventario]);

  const handleApprove = async () => {
    if (!selectedInventario || !isGerente) return;

    setIsApproving(true);
    try {
        const { data, error } = await supabase.functions.invoke('aprovar-e-ajustar-inventario', {
            body: { inventario_id: selectedInventario },
        });

        if (error) throw error;

        toast.success(data.message || "Inventário aprovado e estoque ajustado com sucesso!");

        // Update local state to reflect the change
        setInventarios(prev => 
            prev.map(inv => 
                inv.id === selectedInventario ? { ...inv, status: 'aprovado' } : inv
            )
        );

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
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Selecione uma data de inventário" />
                </SelectTrigger>
                <SelectContent>
                  {inventarios.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {new Date(inv.data_inventario).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} - <span className="capitalize">{inv.status}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                        {error}
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
                
                <div className="border-2 rounded-lg">
                    <div className="p-4 bg-muted/50 text-sm font-medium grid grid-cols-4 gap-4">
                        <div>Produto</div>
                        <div className="text-center">Est. Teórico</div>
                        <div className="text-center">Est. Físico</div>
                        <div className="text-center">Divergência</div>
                    </div>
                    {comparativo.length === 0 && (
                        <div className="text-center p-8 text-muted-foreground">Nenhum item para comparar neste inventário.</div>
                    )}
                    <div className="space-y-2 p-4">
                        {comparativo.map(item => (
                            <div key={item.codigo_auxiliar} className={`grid grid-cols-4 gap-4 items-center p-2 rounded-md ${item.divergencia !== 0 ? 'bg-amber-500/10' : ''}`}>
                                <div>
                                    <p className="font-semibold truncate">{item.nome_produto}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{item.codigo_auxiliar}</p>
                                </div>
                                <div className="text-center font-medium">{item.estoque_teorico}</div>
                                <div className="text-center font-medium">{item.quantidade_fisica}</div>
                                <div className={`text-center font-bold text-lg ${
                                    item.divergencia > 0 ? 'text-green-600' :
                                    item.divergencia < 0 ? 'text-destructive' : ''
                                }`}>
                                    {item.divergencia > 0 ? `+${item.divergencia}` : item.divergencia}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
