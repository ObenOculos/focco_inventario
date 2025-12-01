import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { EstoqueItem } from '@/types/database';
import { Users, AlertTriangle, Package, TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

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
      const estoqueMap = await calcularEstoqueTeorico(vendedor.codigo_vendedor!);
      const itensArray = Array.from(estoqueMap.values());

      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('numero_pedido, data_emissao, codigo_tipo, situacao, valor_total')
        .eq('codigo_vendedor', vendedor.codigo_vendedor)
        .order('data_emissao', { ascending: false })
        .limit(10);

      const totalRemessas = itensArray.reduce((sum, item) => sum + item.quantidade_remessa, 0);
      const totalVendas = itensArray.reduce((sum, item) => sum + item.quantidade_venda, 0);
      const estoqueAtual = itensArray.reduce((sum, item) => sum + item.estoque_teorico, 0);

      vendedoresData.push({
        codigo_vendedor: vendedor.codigo_vendedor!,
        nome_vendedor: vendedor.nome,
        totalRemessas,
        totalVendas,
        estoqueAtual,
        itens: itensArray.sort((a, b) => b.estoque_teorico - a.estoque_teorico),
        pedidosRecentes: pedidos || [],
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
  const vendedoresComEstoqueNegativo = vendedores.filter(v => v.estoqueAtual < 0);

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

        {/* Stats Gerais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Users className="text-primary" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Vendedores</p>
                  <p className="text-2xl font-bold">{vendedores.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-destructive/10 border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-destructive/20 rounded-lg">
                  <AlertTriangle className="text-destructive" size={24} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Com Estoque Negativo</p>
                  <p className="text-2xl font-bold text-destructive">{vendedoresComEstoqueNegativo.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
            {/* Alertas do Vendedor */}
            {vendedorSelecionado.estoqueAtual < 0 && (
              <Alert variant="destructive" className="border-2">
                <AlertTriangle className="h-5 w-5" />
                <AlertDescription className="text-base">
                  <strong>{vendedorSelecionado.nome_vendedor}</strong> está com estoque negativo de{' '}
                  <strong>{Math.abs(vendedorSelecionado.estoqueAtual)} unidades</strong>
                </AlertDescription>
              </Alert>
            )}

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                    <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">Remessas</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                    {vendedorSelecionado.totalRemessas}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">unidades recebidas</p>
                </CardContent>
              </Card>

              <Card className="border-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingDown className="text-green-600 dark:text-green-400" size={20} />
                    <span className="text-sm text-green-700 dark:text-green-300 font-medium">Vendas</span>
                  </div>
                  <p className="text-3xl font-bold text-green-800 dark:text-green-200">
                    {vendedorSelecionado.totalVendas}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">unidades vendidas</p>
                </CardContent>
              </Card>

              <Card className={`border-2 ${
                vendedorSelecionado.estoqueAtual < 0 
                  ? 'bg-destructive/10 border-destructive' 
                  : ''
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Package className={vendedorSelecionado.estoqueAtual < 0 ? 'text-destructive' : 'text-muted-foreground'} size={20} />
                    <span className={`text-sm font-medium ${
                      vendedorSelecionado.estoqueAtual < 0 ? 'text-destructive' : 'text-muted-foreground'
                    }`}>Estoque Atual</span>
                  </div>
                  <p className={`text-3xl font-bold ${
                    vendedorSelecionado.estoqueAtual < 0 ? 'text-destructive' : ''
                  }`}>
                    {vendedorSelecionado.estoqueAtual}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">unidades em estoque</p>
                </CardContent>
              </Card>
            </div>

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

              {/* Pedidos Recentes */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText size={18} />
                    Pedidos Recentes ({vendedorSelecionado.pedidosRecentes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {vendedorSelecionado.pedidosRecentes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum pedido registrado</p>
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
                          {vendedorSelecionado.pedidosRecentes.map((pedido) => (
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
