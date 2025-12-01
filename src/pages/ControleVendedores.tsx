import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { EstoqueItem } from '@/types/database';
import { Users, AlertTriangle, Package, TrendingUp, TrendingDown, FileText, CalendarIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface VendedorEstoque {
  codigo_vendedor: string;
  nome_vendedor: string;
  totalRemessas: number;
  totalVendas: number;
  estoqueAtual: number;
  itens: EstoqueItem[];
  pedidosRecentes: any[];
}

export default function ControleVendedores() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<VendedorEstoque[]>([]);
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    if (profile?.role === 'gerente') {
      fetchVendedoresEstoque();
    }
  }, [profile]);

  useEffect(() => {
    // Selecionar o primeiro vendedor automaticamente quando carregar
    if (vendedores.length > 0 && !selectedVendedor) {
      setSelectedVendedor(vendedores[0].codigo_vendedor);
    }
  }, [vendedores, selectedVendedor]);

  const fetchVendedoresEstoque = async () => {
    setLoading(true);
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .eq('role', 'vendedor')
      .not('codigo_vendedor', 'is', null);

    if (profilesError || !profiles) {
      console.error('Erro ao buscar vendedores:', profilesError);
      setLoading(false);
      return;
    }

    const vendedoresData: VendedorEstoque[] = [];

    for (const vendedor of profiles) {
      // Calcular estoque teórico total (sem filtro de período)
      const estoqueMap = await calcularEstoqueTeorico(vendedor.codigo_vendedor!);
      const itensArray = Array.from(estoqueMap.values());
      const estoqueAtual = itensArray.reduce((sum, item) => sum + item.estoque_teorico, 0);

      // Buscar pedidos recentes para a tabela
      const { data: pedidosRecentes } = await supabase
        .from('pedidos')
        .select('numero_pedido, data_emissao, codigo_tipo, situacao, valor_total')
        .eq('codigo_vendedor', vendedor.codigo_vendedor)
        .order('data_emissao', { ascending: false })
        .limit(50);

      // Buscar todos os pedidos para calcular totais de remessa/venda
      const { data: todosPedidos } = await supabase
        .from('pedidos')
        .select('id, codigo_tipo')
        .eq('codigo_vendedor', vendedor.codigo_vendedor);

      // Buscar itens dos pedidos
      const pedidoIds = todosPedidos?.map(p => p.id) || [];
      const { data: itensPedidos } = await supabase
        .from('itens_pedido')
        .select('pedido_id, quantidade')
        .in('pedido_id', pedidoIds);

      // Mapear quantidade por pedido
      const quantidadePorPedido = new Map<string, number>();
      itensPedidos?.forEach(item => {
        const current = quantidadePorPedido.get(item.pedido_id) || 0;
        quantidadePorPedido.set(item.pedido_id, current + Number(item.quantidade));
      });

      // Calcular totais
      let totalRemessas = 0;
      let totalVendas = 0;
      
      todosPedidos?.forEach(pedido => {
        const quantidade = quantidadePorPedido.get(pedido.id) || 0;
        if (pedido.codigo_tipo === 7) {
          totalRemessas += quantidade;
        } else if (pedido.codigo_tipo === 2) {
          totalVendas += quantidade;
        }
      });

      vendedoresData.push({
        codigo_vendedor: vendedor.codigo_vendedor!,
        nome_vendedor: vendedor.nome,
        totalRemessas,
        totalVendas,
        estoqueAtual,
        itens: itensArray.sort((a, b) => b.estoque_teorico - a.estoque_teorico),
        pedidosRecentes: pedidosRecentes || [],
      });
    }

    vendedoresData.sort((a, b) => {
      if (a.estoqueAtual < 0 && b.estoqueAtual >= 0) return -1;
      if (a.estoqueAtual >= 0 && b.estoqueAtual < 0) return 1;
      return Math.abs(b.estoqueAtual) - Math.abs(a.estoqueAtual);
    });

    setVendedores(vendedoresData);
    setLoading(false);
  };

  if (profile?.role !== 'gerente') {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito a gerentes.
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const vendedorSelecionado = vendedores.find(v => v.codigo_vendedor === selectedVendedor);

  // Filtrar pedidos pelo período selecionado
  const pedidosFiltrados = vendedorSelecionado?.pedidosRecentes.filter((pedido) => {
    if (!dateRange?.from) return true;
    const dataPedido = new Date(pedido.data_emissao);
    const dataInicio = dateRange.from;
    const dataFim = dateRange.to || new Date();
    return dataPedido >= dataInicio && dataPedido <= dataFim;
  }) || [];

  // Calcular totais do período
  let remessasPeriodo = 0;
  let vendasPeriodo = 0;
  
  pedidosFiltrados.forEach(pedido => {
    if (pedido.codigo_tipo === 7) {
      remessasPeriodo += Number(pedido.valor_total || 0);
    } else if (pedido.codigo_tipo === 2) {
      vendasPeriodo += Number(pedido.valor_total || 0);
    }
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="text-primary" />
            Controle de Vendedores
          </h1>
          <p className="text-muted-foreground text-base">
            Visualize remessas, vendas, pedidos e itens em estoque de cada vendedor
          </p>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Seletor de Vendedor */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base">Selecione um Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                <SelectTrigger className="w-full border-2">
                  <SelectValue placeholder="Escolha um vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.codigo_vendedor} value={v.codigo_vendedor}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{v.nome_vendedor}</span>
                        <span className="text-xs text-muted-foreground">({v.codigo_vendedor})</span>
                        {v.estoqueAtual < 0 && (
                          <Badge variant="destructive" className="ml-2">Negativo</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Filtro de Período */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-base">Período dos Pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal border-2',
                      !dateRange && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'dd/MM/yyyy')} -{' '}
                          {format(dateRange.to, 'dd/MM/yyyy')}
                        </>
                      ) : (
                        format(dateRange.from, 'dd/MM/yyyy')
                      )
                    ) : (
                      <span>Selecione o período</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo do Vendedor Selecionado */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando dados dos vendedores...</p>
          </div>
        ) : !vendedorSelecionado ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum vendedor cadastrado.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header do Vendedor com Stats Inline */}
            <Card className={`border-2 ${
              vendedorSelecionado.estoqueAtual < 0 ? 'border-destructive' : ''
            }`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">{vendedorSelecionado.nome_vendedor}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Código: {vendedorSelecionado.codigo_vendedor}
                    </p>
                  </div>
                  {vendedorSelecionado.estoqueAtual < 0 && (
                    <Badge variant="destructive" className="text-base px-3 py-1">
                      <AlertTriangle size={16} className="mr-1" />
                      Estoque Negativo
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                      <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{vendedorSelecionado.totalRemessas.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Remessas (Total)</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {pedidosFiltrados.filter(p => p.codigo_tipo === 7).length} no período
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                      <TrendingDown className="text-green-600 dark:text-green-400" size={20} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{vendedorSelecionado.totalVendas.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground">Vendas (Total)</p>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {pedidosFiltrados.filter(p => p.codigo_tipo === 2).length} no período
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded ${
                      vendedorSelecionado.estoqueAtual < 0 
                        ? 'bg-destructive/10' 
                        : 'bg-muted'
                    }`}>
                      <Package className={
                        vendedorSelecionado.estoqueAtual < 0 
                          ? 'text-destructive' 
                          : 'text-muted-foreground'
                      } size={20} />
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${
                        vendedorSelecionado.estoqueAtual < 0 ? 'text-destructive' : ''
                      }`}>
                        {vendedorSelecionado.estoqueAtual}
                      </p>
                      <p className="text-xs text-muted-foreground">Estoque Atual</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabelas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Itens em Estoque */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package size={18} />
                    Itens em Estoque ({vendedorSelecionado.itens.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vendedorSelecionado.itens.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum item em estoque</p>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Código</TableHead>
                            <TableHead className="text-xs text-right">Remessas</TableHead>
                            <TableHead className="text-xs text-right">Vendas</TableHead>
                            <TableHead className="text-xs text-right">Estoque</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vendedorSelecionado.itens.map((item) => (
                            <TableRow key={item.codigo_auxiliar}>
                              <TableCell className="text-xs font-medium">
                                {item.codigo_auxiliar}
                              </TableCell>
                              <TableCell className="text-xs text-right text-blue-600 dark:text-blue-400">
                                {item.quantidade_remessa}
                              </TableCell>
                              <TableCell className="text-xs text-right text-green-600 dark:text-green-400">
                                {item.quantidade_venda}
                              </TableCell>
                              <TableCell className={`text-xs text-right font-semibold ${
                                item.estoque_teorico < 0 ? 'text-destructive' : ''
                              }`}>
                                {item.estoque_teorico}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* Pedidos no Período */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText size={18} />
                    Pedidos no Período ({pedidosFiltrados.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pedidosFiltrados.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum pedido no período selecionado
                    </p>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Pedido</TableHead>
                            <TableHead className="text-xs">Data</TableHead>
                            <TableHead className="text-xs">Tipo</TableHead>
                            <TableHead className="text-xs text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pedidosFiltrados.map((pedido) => (
                            <TableRow key={pedido.numero_pedido}>
                              <TableCell className="text-xs font-medium">
                                {pedido.numero_pedido}
                              </TableCell>
                              <TableCell className="text-xs">
                                {new Date(pedido.data_emissao).toLocaleDateString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-xs">
                                <Badge 
                                  variant="secondary" 
                                  className={pedido.codigo_tipo === 7 
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' 
                                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                                  }
                                >
                                  {pedido.codigo_tipo === 7 ? 'Remessa' : 'Venda'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                R$ {pedido.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
