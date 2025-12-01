import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  TrendingUp, 
  TrendingDown, 
  ClipboardList, 
  AlertTriangle,
  DollarSign,
  Users,
  Trophy,
  Percent,
  BarChart3,
  ArrowRight,
  Clock
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
  valor_vendido: number;
  numero_vendas: number;
}

interface Divergencia {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string;
  data: string;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItens: 0,
    totalModelos: 0,
    inventariosPendentes: 0,
    totalVendedores: 0,
    produtosCriticos: 0,
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
    setProdutosNegativos(estoqueArray.filter(e => e.estoque_teorico < 0));
    
    // Update stats
    const produtosCriticos = estoqueArray.filter(e => e.estoque_teorico > 0 && e.estoque_teorico <= 5).length;
    
    setStats(prev => ({
      ...prev,
      totalItens: estoqueArray.reduce((acc, item) => acc + item.estoque_teorico, 0),
      totalModelos: new Set(estoqueArray.map(e => e.modelo)).size,
      produtosCriticos,
    }));
    
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
      .select('id, codigo_vendedor, nome_vendedor, valor_total')
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

    const vendedorMap = new Map<string, { nome: string; unidades: number; valor: number; vendas: number }>();
    
    pedidos?.forEach(pedido => {
      const current = vendedorMap.get(pedido.codigo_vendedor) || { 
        nome: pedido.nome_vendedor || pedido.codigo_vendedor, 
        unidades: 0,
        valor: 0,
        vendas: 0,
      };
      
      const pedidoItens = itens?.filter(i => i.pedido_id === pedido.id) || [];
      const unidades = pedidoItens.reduce((acc, i) => acc + Number(i.quantidade), 0);
      
      current.unidades += unidades;
      current.valor += Number(pedido.valor_total);
      current.vendas += 1;
      vendedorMap.set(pedido.codigo_vendedor, current);
    });

    const top = Array.from(vendedorMap.entries())
      .map(([codigo, data]) => ({
        codigo_vendedor: codigo,
        nome_vendedor: data.nome,
        unidades_vendidas: data.unidades,
        valor_vendido: data.valor,
        numero_vendas: data.vendas,
      }))
      .sort((a, b) => b.valor_vendido - a.valor_vendido)
      .slice(0, 5);

    setTopVendedores(top);
    
    // Count unique active sellers
    const vendedoresAtivos = new Set(pedidos?.map(p => p.codigo_vendedor) || []).size;
    setStats(prev => ({ ...prev, totalVendedores: vendedoresAtivos }));
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
      supabase
        .from('inventarios')
        .select('id', { count: 'exact' })
        .eq('status', 'pendente')
        .then(({ count }) => {
          setStats(prev => ({
            ...prev,
            inventariosPendentes: count || 0,
          }));
        });
    }
  }, [loading, profile]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  {movimentacao.totalRemessas}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
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
                  {movimentacao.totalVendas}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {movimentacao.unidadesVenda.toLocaleString('pt-BR')} unidades
                </p>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {movimentacao.valorVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
            </CardContent>
          </Card>

          {isGerente && (
            <>
              <Card className="border-2 bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-700 dark:text-purple-300">
                    <Percent size={16} />
                    Taxa de Venda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-purple-800 dark:text-purple-200">
                      {movimentacao.unidadesRemessa > 0 
                        ? Math.round((movimentacao.unidadesVenda / movimentacao.unidadesRemessa) * 100) 
                        : 0}%
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      vendas / remessas
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-300">
                    <BarChart3 size={16} />
                    Ticket Médio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-orange-800 dark:text-orange-200">
                      {movimentacao.totalVendas > 0 
                        ? (movimentacao.valorVenda / movimentacao.totalVendas).toLocaleString('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })
                        : 'R$ 0'}
                    </p>
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      por venda
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Stats - Linha atualizada para gerente */}
        {isGerente ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package size={16} />
                  Estoque Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalItens}</p>
                <p className="text-xs text-muted-foreground">unidades</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp size={16} />
                  Modelos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalModelos}</p>
                <p className="text-xs text-muted-foreground">diferentes</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users size={16} />
                  Vendedores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalVendedores}</p>
                <p className="text-xs text-muted-foreground">ativos</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle size={16} />
                  Estoque Crítico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.produtosCriticos}</p>
                <p className="text-xs text-muted-foreground">≤ 5 unidades</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock size={16} />
                  Inventários
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.inventariosPendentes}</p>
                <p className="text-xs text-muted-foreground">pendentes</p>
              </CardContent>
            </Card>
          </div>
        ) : (
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
                  Meus Inventários Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.inventariosPendentes}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Top Vendedores (apenas gerente) */}
        {isGerente && topVendedores.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Trophy className="text-yellow-500" size={20} />
                    Top 5 Vendedores
                  </span>
                  <Link to="/vendedores">
                    <Button variant="ghost" size="sm">
                      Ver todos <ArrowRight size={14} className="ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topVendedores.map((vendedor, index) => (
                    <div 
                      key={vendedor.codigo_vendedor}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-10 h-10 flex items-center justify-center font-bold text-lg rounded ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200' :
                        index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' :
                        index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}°
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{vendedor.nome_vendedor}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{vendedor.codigo_vendedor}</span>
                          <span>•</span>
                          <span>{vendedor.numero_vendas} vendas</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600 dark:text-green-400">
                          {vendedor.valor_vendido.toLocaleString('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {vendedor.unidades_vendidas.toLocaleString('pt-BR')} un
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Ações Rápidas */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Link to="/importar">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                          <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium">Importar Pedidos</p>
                          <p className="text-xs text-muted-foreground">Carregar arquivo Excel</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/conferencia">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                          <ClipboardList className="text-orange-600 dark:text-orange-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium">Revisar Inventários</p>
                          <p className="text-xs text-muted-foreground">
                            {stats.inventariosPendentes} pendente{stats.inventariosPendentes !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/produtos">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                          <Package className="text-purple-600 dark:text-purple-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium">Gerenciar Produtos</p>
                          <p className="text-xs text-muted-foreground">Cadastrar e gerar QR codes</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/estoque-teorico">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                          <BarChart3 className="text-green-600 dark:text-green-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium">Ver Estoque Completo</p>
                          <p className="text-xs text-muted-foreground">{stats.totalItens} unidades</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
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

        {/* Acesso rápido ao estoque - apenas vendedor */}
        {!isGerente && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package size={20} />
                Estoque Teórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-1">Total em Estoque</p>
                    <p className="text-3xl font-bold">{stats.totalItens}</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-1">Modelos</p>
                    <p className="text-3xl font-bold">{stats.totalModelos}</p>
                  </div>
                </div>
                <Link to="/estoque-teorico">
                  <Button className="w-full">
                    Ver Estoque Completo
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
