import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  TrendingUp, 
  TrendingDown, 
  ClipboardList, 
  Search, 
  AlertTriangle,
  DollarSign,
  Users,
  Trophy
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface MovimentacaoResumo {
  totalRemessas: number;
  unidadesRemessa: number;
  valorRemessa: number;
  totalVendas: number;
  unidadesVenda: number;
  valorVenda: number;
}

interface TopVendedor {
  codigo_vendedor: string;
  nome_vendedor: string;
  unidades_vendidas: number;
}

interface Divergencia {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string;
  data: string;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalItens: 0,
    totalModelos: 0,
    inventariosPendentes: 0,
  });
  const [movimentacao, setMovimentacao] = useState<MovimentacaoResumo>({
    totalRemessas: 0,
    unidadesRemessa: 0,
    valorRemessa: 0,
    totalVendas: 0,
    unidadesVenda: 0,
    valorVenda: 0,
  });
  const [topVendedores, setTopVendedores] = useState<TopVendedor[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [produtosNegativos, setProdutosNegativos] = useState<EstoqueItem[]>([]);

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    if (profile) {
      fetchEstoque();
      fetchMovimentacao();
      if (isGerente) {
        fetchTopVendedores();
        fetchDivergencias();
      }
    }
  }, [profile]);

  const fetchEstoque = async () => {
    if (!profile) return;

    const codigoVendedor = isGerente ? null : profile.codigo_vendedor;
    
    let query = supabase
      .from('itens_pedido')
      .select(`
        codigo_auxiliar,
        nome_produto,
        quantidade,
        pedidos!inner (
          codigo_vendedor,
          codigo_tipo
        )
      `);

    if (codigoVendedor) {
      query = query.eq('pedidos.codigo_vendedor', codigoVendedor);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar estoque:', error);
      setLoading(false);
      return;
    }

    const estoqueMap = new Map<string, EstoqueItem>();

    data?.forEach((item: any) => {
      const key = item.codigo_auxiliar;
      const existing = estoqueMap.get(key) || {
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        modelo: item.codigo_auxiliar.split(' ')[0] || '',
        cor: item.codigo_auxiliar.split(' ')[1] || '',
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

    const estoqueArray = Array.from(estoqueMap.values()).filter(e => e.estoque_teorico !== 0);
    setEstoque(estoqueArray);
    setProdutosNegativos(estoqueArray.filter(e => e.estoque_teorico < 0));
    setLoading(false);
  };

  const fetchMovimentacao = async () => {
    if (!profile) return;

    const codigoVendedor = isGerente ? null : profile.codigo_vendedor;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let pedidosQuery = supabase
      .from('pedidos')
      .select('id, codigo_tipo, valor_total')
      .gte('data_emissao', thirtyDaysAgo.toISOString());

    if (codigoVendedor) {
      pedidosQuery = pedidosQuery.eq('codigo_vendedor', codigoVendedor);
    }

    const { data: pedidos, error: pedidosError } = await pedidosQuery;

    if (pedidosError) {
      console.error('Erro ao buscar movimentações:', pedidosError);
      return;
    }

    const pedidoIds = pedidos?.map(p => p.id) || [];
    
    let itensQuery = supabase
      .from('itens_pedido')
      .select('pedido_id, quantidade')
      .in('pedido_id', pedidoIds);

    const { data: itens } = await itensQuery;

    const itensPorPedido = new Map<string, number>();
    itens?.forEach(item => {
      const current = itensPorPedido.get(item.pedido_id) || 0;
      itensPorPedido.set(item.pedido_id, current + Number(item.quantidade));
    });

    let totalRemessas = 0, unidadesRemessa = 0, valorRemessa = 0;
    let totalVendas = 0, unidadesVenda = 0, valorVenda = 0;

    pedidos?.forEach(p => {
      const unidades = itensPorPedido.get(p.id) || 0;
      if (p.codigo_tipo === 7) {
        totalRemessas++;
        unidadesRemessa += unidades;
        valorRemessa += Number(p.valor_total);
      } else if (p.codigo_tipo === 2) {
        totalVendas++;
        unidadesVenda += unidades;
        valorVenda += Number(p.valor_total);
      }
    });

    setMovimentacao({
      totalRemessas,
      unidadesRemessa,
      valorRemessa,
      totalVendas,
      unidadesVenda,
      valorVenda,
    });
  };

  const fetchTopVendedores = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id, codigo_vendedor, nome_vendedor')
      .eq('codigo_tipo', 2)
      .gte('data_emissao', thirtyDaysAgo.toISOString());

    if (error) {
      console.error('Erro ao buscar top vendedores:', error);
      return;
    }

    const pedidoIds = pedidos?.map(p => p.id) || [];
    
    const { data: itens } = await supabase
      .from('itens_pedido')
      .select('pedido_id, quantidade')
      .in('pedido_id', pedidoIds);

    const vendedorMap = new Map<string, { nome: string; unidades: number }>();
    
    pedidos?.forEach(pedido => {
      const current = vendedorMap.get(pedido.codigo_vendedor) || { 
        nome: pedido.nome_vendedor || pedido.codigo_vendedor, 
        unidades: 0 
      };
      
      const pedidoItens = itens?.filter(i => i.pedido_id === pedido.id) || [];
      const unidades = pedidoItens.reduce((acc, i) => acc + Number(i.quantidade), 0);
      
      current.unidades += unidades;
      vendedorMap.set(pedido.codigo_vendedor, current);
    });

    const top = Array.from(vendedorMap.entries())
      .map(([codigo, data]) => ({
        codigo_vendedor: codigo,
        nome_vendedor: data.nome,
        unidades_vendidas: data.unidades,
      }))
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
      .slice(0, 5);

    setTopVendedores(top);
  };

  const fetchDivergencias = async () => {
    const { data, error } = await supabase
      .from('inventarios')
      .select('id, codigo_vendedor, data_inventario')
      .eq('status', 'revisao')
      .order('data_inventario', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Erro ao buscar divergências:', error);
      return;
    }

    // Get vendedor names
    const vendedorCodigos = [...new Set(data?.map(d => d.codigo_vendedor) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .in('codigo_vendedor', vendedorCodigos);

    const nomeMap = new Map(profiles?.map(p => [p.codigo_vendedor, p.nome]) || []);

    setDivergencias(
      data?.map(d => ({
        codigo_vendedor: d.codigo_vendedor,
        nome_vendedor: nomeMap.get(d.codigo_vendedor) || d.codigo_vendedor,
        inventario_id: d.id,
        data: d.data_inventario,
      })) || []
    );
  };

  useEffect(() => {
    if (!loading && profile) {
      const codigoVendedor = isGerente ? null : profile.codigo_vendedor;
      
      supabase
        .from('inventarios')
        .select('id', { count: 'exact' })
        .eq('status', 'pendente')
        .then(({ count }) => {
          setStats({
            totalItens: estoque.reduce((acc, item) => acc + item.estoque_teorico, 0),
            totalModelos: new Set(estoque.map(e => e.modelo)).size,
            inventariosPendentes: count || 0,
          });
        });
    }
  }, [estoque, loading]);

  const filteredEstoque = estoque.filter(item =>
    item.codigo_auxiliar.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.nome_produto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {isGerente 
              ? 'Visão geral do sistema - Últimos 30 dias' 
              : 'Seu resumo de atividades - Últimos 30 dias'}
          </p>
        </div>

        {/* Alertas */}
        {(produtosNegativos.length > 0 || divergencias.length > 0) && (
          <div className="space-y-2">
            {produtosNegativos.length > 0 && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
                <AlertTriangle className="text-destructive shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-destructive">
                    {produtosNegativos.length} produto(s) com estoque negativo
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Verifique divergências de inventário
                  </p>
                </div>
                <Link to="/pedidos">
                  <Button variant="outline" size="sm">Ver detalhes</Button>
                </Link>
              </div>
            )}
            {isGerente && divergencias.length > 0 && (
              <div className="flex items-center gap-3 p-4 bg-orange-100 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg">
                <AlertTriangle className="text-orange-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400">
                    {divergencias.length} inventário(s) aguardando revisão
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {divergencias.slice(0, 2).map(d => d.nome_vendedor).join(', ')}
                    {divergencias.length > 2 && ` e mais ${divergencias.length - 2}`}
                  </p>
                </div>
                <Link to="/conferencia">
                  <Button variant="outline" size="sm">Conferir</Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Resumo de Movimentações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Package size={16} />
                {isGerente ? 'Remessas Enviadas' : 'Remessas Recebidas'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                  {movimentacao.totalRemessas} pedidos
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  {movimentacao.unidadesRemessa.toLocaleString('pt-BR')} unidades
                </p>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {movimentacao.valorRemessa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                <DollarSign size={16} />
                Vendas Realizadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                  {movimentacao.totalVendas} pedidos
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  {movimentacao.unidadesVenda.toLocaleString('pt-BR')} unidades
                </p>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {movimentacao.valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Total em Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalItens}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp size={16} />
                Modelos Diferentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalModelos}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardList size={16} />
                {isGerente ? 'Inventários Pendentes' : 'Meus Inventários Pendentes'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.inventariosPendentes}</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Vendedores (apenas gerente) */}
        {isGerente && topVendedores.length > 0 && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="text-yellow-500" size={20} />
                Top 5 Vendedores (por volume)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topVendedores.map((vendedor, index) => (
                  <div 
                    key={vendedor.codigo_vendedor}
                    className="flex items-center gap-4 p-3 border rounded-lg"
                  >
                    <div className={`w-8 h-8 flex items-center justify-center font-bold rounded ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700' :
                      index === 1 ? 'bg-gray-100 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{vendedor.nome_vendedor}</p>
                      <p className="text-sm text-muted-foreground">{vendedor.codigo_vendedor}</p>
                    </div>
                    <Badge variant="secondary" className="font-bold">
                      {vendedor.unidades_vendidas.toLocaleString('pt-BR')} un
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Painel do Vendedor - Últimos pedidos */}
        {!isGerente && (
          <Card className="border-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Atividade Recente</CardTitle>
              <Link to="/pedidos">
                <Button variant="outline" size="sm">Ver todos</Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Package size={16} />
                    <span className="font-medium">Última Remessa</span>
                  </div>
                  <p className="text-2xl font-bold">{movimentacao.unidadesRemessa}</p>
                  <p className="text-sm text-muted-foreground">unidades recebidas</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <DollarSign size={16} />
                    <span className="font-medium">Minhas Vendas</span>
                  </div>
                  <p className="text-2xl font-bold">{movimentacao.unidadesVenda}</p>
                  <p className="text-sm text-muted-foreground">unidades vendidas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Estoque Table */}
        <Card className="border-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Estoque Teórico</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Buscar produto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 border-2"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredEstoque.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum item em estoque'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-foreground">
                      <th className="text-left py-3 px-2 font-bold">Código</th>
                      <th className="text-left py-3 px-2 font-bold hidden sm:table-cell">Produto</th>
                      <th className="text-center py-3 px-2 font-bold">
                        <TrendingUp size={14} className="inline mr-1" />
                        Remessa
                      </th>
                      <th className="text-center py-3 px-2 font-bold">
                        <TrendingDown size={14} className="inline mr-1" />
                        Venda
                      </th>
                      <th className="text-center py-3 px-2 font-bold">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEstoque.map((item) => (
                      <tr key={item.codigo_auxiliar} className="border-b border-border hover:bg-secondary/50">
                        <td className="py-3 px-2">
                          <div className="font-mono font-medium">{item.codigo_auxiliar}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">{item.nome_produto}</div>
                        </td>
                        <td className="py-3 px-2 hidden sm:table-cell text-sm">{item.nome_produto}</td>
                        <td className="py-3 px-2 text-center text-green-600 font-medium">{item.quantidade_remessa}</td>
                        <td className="py-3 px-2 text-center text-red-600 font-medium">{item.quantidade_venda}</td>
                        <td className="py-3 px-2 text-center">
                          <span className={`inline-block px-3 py-1 font-bold ${
                            item.estoque_teorico > 0 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                              : item.estoque_teorico < 0 
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-secondary'
                          }`}>
                            {item.estoque_teorico}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
