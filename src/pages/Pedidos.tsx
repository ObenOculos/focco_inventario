import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Package, DollarSign, AlertTriangle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Pedido {
  id: string;
  numero_pedido: string;
  data_emissao: string;
  codigo_vendedor: string;
  nome_vendedor: string | null;
  valor_total: number;
  codigo_tipo: number;
  situacao: string | null;
  numero_nota_fiscal: string | null;
  serie_nota_fiscal: string | null;
  codigo_cliente: string | null;
}

interface ItemPedido {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
}

interface PedidoComItens extends Pedido {
  itens_pedido: ItemPedido[];
}

export default function Pedidos() {
  const { profile } = useAuth();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [vendedores, setVendedores] = useState<{ codigo: string; nome: string }[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<PedidoComItens | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    fetchPedidos();
    if (isGerente) {
      fetchVendedores();
    }
  }, [profile]);

  const fetchPedidos = async () => {
    if (!profile) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('pedidos')
        .select('*')
        .order('data_emissao', { ascending: false });

      if (!isGerente && profile.codigo_vendedor) {
        query = query.eq('codigo_vendedor', profile.codigo_vendedor);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPedidos(data || []);
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendedores = async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('codigo_vendedor, nome_vendedor')
        .not('nome_vendedor', 'is', null);

      if (error) throw error;

      const uniqueVendedores = Array.from(
        new Map(data?.map(p => [p.codigo_vendedor, { codigo: p.codigo_vendedor, nome: p.nome_vendedor || p.codigo_vendedor }])).values()
      );
      setVendedores(uniqueVendedores);
    } catch (error) {
      console.error('Erro ao buscar vendedores:', error);
    }
  };

  const fetchPedidoDetalhes = async (pedido: Pedido) => {
    try {
      const { data: itens, error } = await supabase
        .from('itens_pedido')
        .select('*')
        .eq('pedido_id', pedido.id);

      if (error) throw error;

      setSelectedPedido({
        ...pedido,
        itens_pedido: itens || []
      });
      setDialogOpen(true);
    } catch (error) {
      console.error('Erro ao buscar itens do pedido:', error);
    }
  };

  const getTipoBadge = (codigoTipo: number) => {
    if (codigoTipo === 7) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Package className="w-3 h-3 mr-1" />
          Remessa
        </Badge>
      );
    } else if (codigoTipo === 2) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <DollarSign className="w-3 h-3 mr-1" />
          Venda
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Tipo {codigoTipo}
        </Badge>
      );
    }
  };

  const filteredPedidos = pedidos.filter(pedido => {
    const matchesSearch = pedido.numero_pedido.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pedido.nome_vendedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pedido.numero_nota_fiscal?.includes(searchTerm);

    const matchesTipo = tipoFilter === 'todos' || pedido.codigo_tipo.toString() === tipoFilter;
    const matchesVendedor = vendedorFilter === 'todos' || pedido.codigo_vendedor === vendedorFilter;

    return matchesSearch && matchesTipo && matchesVendedor;
  });

  const totalUnidades = (itens: ItemPedido[]) => {
    return itens.reduce((acc, item) => acc + Number(item.quantidade), 0);
  };

  const parseCodigoAuxiliar = (codigo: string) => {
    const parts = codigo.split(' ');
    return {
      modelo: parts[0] || codigo,
      cor: parts.slice(1).join(' ') || '-'
    };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isGerente ? 'Gestão de Pedidos' : 'Meus Pedidos'}
          </h1>
          <p className="text-muted-foreground">
            {isGerente 
              ? 'Visualize e gerencie todos os pedidos do sistema'
              : 'Acompanhe suas remessas recebidas e vendas realizadas'
            }
          </p>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por número do pedido, vendedor ou NF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="7">Remessa</SelectItem>
                  <SelectItem value="2">Venda</SelectItem>
                </SelectContent>
              </Select>
              {isGerente && (
                <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                  <SelectTrigger className="w-full md:w-52">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map(v => (
                      <SelectItem key={v.codigo} value={v.codigo}>
                        {v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lista de Pedidos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Pedidos ({filteredPedidos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando pedidos...
              </div>
            ) : filteredPedidos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum pedido encontrado
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Data</TableHead>
                      {isGerente && <TableHead>Vendedor</TableHead>}
                      <TableHead>Tipo</TableHead>
                      <TableHead>NF</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPedidos.map((pedido) => (
                      <TableRow key={pedido.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">#{pedido.numero_pedido}</TableCell>
                        <TableCell>
                          {format(new Date(pedido.data_emissao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        {isGerente && (
                          <TableCell className="max-w-[200px] truncate">
                            {pedido.nome_vendedor || pedido.codigo_vendedor}
                          </TableCell>
                        )}
                        <TableCell>{getTipoBadge(pedido.codigo_tipo)}</TableCell>
                        <TableCell>
                          {pedido.numero_nota_fiscal 
                            ? `${pedido.numero_nota_fiscal}${pedido.serie_nota_fiscal ? `-${pedido.serie_nota_fiscal}` : ''}`
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(pedido.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => fetchPedidoDetalhes(pedido)}
                          >
                            Ver Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de Detalhes do Pedido */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {selectedPedido && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    PEDIDO #{selectedPedido.numero_pedido}
                    {getTipoBadge(selectedPedido.codigo_tipo)}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Informações do Pedido */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Data:</span>
                      <p className="font-medium">
                        {format(new Date(selectedPedido.data_emissao), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vendedor:</span>
                      <p className="font-medium">{selectedPedido.nome_vendedor || selectedPedido.codigo_vendedor}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Nota Fiscal:</span>
                      <p className="font-medium">
                        {selectedPedido.numero_nota_fiscal 
                          ? `${selectedPedido.numero_nota_fiscal} - Série ${selectedPedido.serie_nota_fiscal || '1'}`
                          : '-'
                        }
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tipo:</span>
                      <p className="font-medium">
                        {selectedPedido.codigo_tipo === 7 ? 'Remessa' : selectedPedido.codigo_tipo === 2 ? 'Venda' : `Tipo ${selectedPedido.codigo_tipo}`}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Situação:</span>
                      <p className="font-medium">{selectedPedido.situacao === 'N' ? 'Normal' : selectedPedido.situacao || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>
                      <p className="font-medium">{selectedPedido.codigo_cliente || '-'}</p>
                    </div>
                  </div>

                  {/* Tabela de Produtos */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      {selectedPedido.codigo_tipo === 7 ? 'PRODUTOS ENVIADOS' : 'PRODUTOS VENDIDOS'}
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código QR</TableHead>
                            <TableHead className="hidden md:table-cell">Produto</TableHead>
                            <TableHead>Modelo</TableHead>
                            <TableHead>Cor</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Valor Un.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedPedido.itens_pedido.map((item) => {
                            const { modelo, cor } = parseCodigoAuxiliar(item.codigo_auxiliar);
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">{item.codigo_auxiliar}</TableCell>
                                <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                                  {item.nome_produto}
                                </TableCell>
                                <TableCell>{modelo}</TableCell>
                                <TableCell>{cor}</TableCell>
                                <TableCell className="text-right">{Number(item.quantidade)} un</TableCell>
                                <TableCell className="text-right hidden md:table-cell">
                                  {Number(item.valor_produto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Totais */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold">TOTAIS</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Modelos diferentes:</span>
                        <p className="font-bold text-lg">{selectedPedido.itens_pedido.length}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total de unidades:</span>
                        <p className="font-bold text-lg">{totalUnidades(selectedPedido.itens_pedido)} un</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor Total:</span>
                        <p className="font-bold text-lg text-primary">
                          {Number(selectedPedido.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
