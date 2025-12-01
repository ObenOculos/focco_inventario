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
  Users,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  FileCheck
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { VendedorEstoqueCard } from '@/components/VendedorEstoqueCard';
import { calcularEstoqueTeorico } from '@/lib/estoque';

interface MovimentacaoResumo {
  totalRemessas: number;
  unidadesRemessa: number;
  valorRemessa: number;
  totalVendas: number;
  unidadesVenda: number;
  valorVenda: number;
}

interface StatusInventario {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventarios_pendentes: number;
  inventarios_aprovados: number;
  inventarios_revisao: number;
  ultimo_inventario: string | null;
}

interface Divergencia {
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string;
  data: string;
}

interface VendedorEstoque {
  codigo_vendedor: string;
  nome_vendedor: string;
  totalRemessas: number;
  totalVendas: number;
  estoqueAtual: number;
  itens: EstoqueItem[];
  pedidosRecentes: any[];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalItens: 0,
    totalModelos: 0,
    inventariosPendentes: 0,
    inventariosAprovados: 0,
    inventariosRevisao: 0,
    totalVendedores: 0,
    produtosNegativos: 0,
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
  const [statusInventarios, setStatusInventarios] = useState<StatusInventario[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [produtosNegativos, setProdutosNegativos] = useState<EstoqueItem[]>([]);
  const [vendedoresEstoque, setVendedoresEstoque] = useState<VendedorEstoque[]>([]);

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    if (profile) {
      fetchEstoque();
      fetchMovimentacao();
      if (isGerente) {
        fetchStatusInventarios();
        fetchDivergencias();
        fetchVendedoresEstoque();
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
    const negativos = estoqueArray.filter(e => e.estoque_teorico < 0);
    setProdutosNegativos(negativos);
    
    // Update stats
    const produtosCriticos = estoqueArray.filter(e => e.estoque_teorico > 0 && e.estoque_teorico <= 5).length;
    
    setStats(prev => ({
      ...prev,
      totalItens: estoqueArray.reduce((acc, item) => acc + item.estoque_teorico, 0),
      totalModelos: new Set(estoqueArray.map(e => e.modelo)).size,
      produtosNegativos: negativos.length,
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

  const fetchStatusInventarios = async () => {
    // Buscar todos os inventários
    const { data: inventarios, error: invError } = await supabase
      .from('inventarios')
      .select('codigo_vendedor, status, data_inventario');

    if (invError) {
      console.error('Erro ao buscar inventários:', invError);
      return;
    }

    // Buscar vendedores únicos
    const vendedorCodigos = [...new Set(inventarios?.map(i => i.codigo_vendedor) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .in('codigo_vendedor', vendedorCodigos);

    const nomeMap = new Map(profiles?.map(p => [p.codigo_vendedor, p.nome]) || []);

    // Agrupar por vendedor
    const statusMap = new Map<string, StatusInventario>();
    
    inventarios?.forEach(inv => {
      const current = statusMap.get(inv.codigo_vendedor) || {
        codigo_vendedor: inv.codigo_vendedor,
        nome_vendedor: nomeMap.get(inv.codigo_vendedor) || inv.codigo_vendedor,
        inventarios_pendentes: 0,
        inventarios_aprovados: 0,
        inventarios_revisao: 0,
        ultimo_inventario: null,
      };

      if (inv.status === 'pendente') current.inventarios_pendentes++;
      if (inv.status === 'aprovado') current.inventarios_aprovados++;
      if (inv.status === 'revisao') current.inventarios_revisao++;

      // Atualizar último inventário
      if (!current.ultimo_inventario || new Date(inv.data_inventario) > new Date(current.ultimo_inventario)) {
        current.ultimo_inventario = inv.data_inventario;
      }

      statusMap.set(inv.codigo_vendedor, current);
    });

    // Ordenar por pendentes + revisão (prioridade) e depois por último inventário
    const statusArray = Array.from(statusMap.values())
      .sort((a, b) => {
        const prioridadeA = a.inventarios_pendentes + a.inventarios_revisao;
        const prioridadeB = b.inventarios_pendentes + b.inventarios_revisao;
        if (prioridadeB !== prioridadeA) return prioridadeB - prioridadeA;
        
        if (!a.ultimo_inventario) return 1;
        if (!b.ultimo_inventario) return -1;
        return new Date(b.ultimo_inventario).getTime() - new Date(a.ultimo_inventario).getTime();
      })
      .slice(0, 5);

    setStatusInventarios(statusArray);
    setStats(prev => ({ 
      ...prev, 
      totalVendedores: vendedorCodigos.length,
    }));
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

  const fetchVendedoresEstoque = async () => {
    // Buscar todos os vendedores
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .eq('role', 'vendedor')
      .not('codigo_vendedor', 'is', null);

    if (profilesError || !profiles) {
      console.error('Erro ao buscar vendedores:', profilesError);
      return;
    }

    const vendedoresData: VendedorEstoque[] = [];

    for (const vendedor of profiles) {
      // Calcular estoque usando a função centralizada
      const estoqueMap = await calcularEstoqueTeorico(vendedor.codigo_vendedor!);
      const itensArray = Array.from(estoqueMap.values());

      // Buscar pedidos recentes (últimos 10)
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

    // Ordenar por estoque negativo primeiro, depois por estoque total
    vendedoresData.sort((a, b) => {
      if (a.estoqueAtual < 0 && b.estoqueAtual >= 0) return -1;
      if (a.estoqueAtual >= 0 && b.estoqueAtual < 0) return 1;
      return Math.abs(b.estoqueAtual) - Math.abs(a.estoqueAtual);
    });

    setVendedoresEstoque(vendedoresData);
  };

  useEffect(() => {
    if (!loading && profile && isGerente) {
      // Buscar contagens de inventários
      Promise.all([
        supabase.from('inventarios').select('id', { count: 'exact' }).eq('status', 'pendente'),
        supabase.from('inventarios').select('id', { count: 'exact' }).eq('status', 'aprovado'),
        supabase.from('inventarios').select('id', { count: 'exact' }).eq('status', 'revisao'),
      ]).then(([pendentes, aprovados, revisao]) => {
        setStats(prev => ({
          ...prev,
          inventariosPendentes: pendentes.count || 0,
          inventariosAprovados: aprovados.count || 0,
          inventariosRevisao: revisao.count || 0,
        }));
      });
    } else if (!loading && profile && !isGerente) {
      supabase
        .from('inventarios')
        .select('id', { count: 'exact' })
        .eq('status', 'pendente')
        .eq('codigo_vendedor', profile.codigo_vendedor)
        .then(({ count }) => {
          setStats(prev => ({
            ...prev,
            inventariosPendentes: count || 0,
          }));
        });
    }
  }, [loading, profile, isGerente]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-base">
            {isGerente 
              ? 'Visão geral do sistema - Últimos 30 dias' 
              : 'Seu resumo de atividades - Últimos 30 dias'}
          </p>
        </div>

        {/* Alertas */}
        {(produtosNegativos.length > 0 || divergencias.length > 0) && (
          <div className="space-y-3">
            {produtosNegativos.length > 0 && (
              <div className="flex items-center gap-4 p-5 bg-destructive/10 border-2 border-destructive rounded-lg">
                <AlertTriangle className="text-destructive shrink-0 h-6 w-6" />
                <div className="flex-1">
                  <p className="font-semibold text-destructive text-base">
                    {produtosNegativos.length} produto(s) com estoque negativo
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Verifique divergências de inventário
                  </p>
                </div>
                <Link to="/pedidos">
                  <Button variant="outline" size="sm">Ver detalhes</Button>
                </Link>
              </div>
            )}
            {isGerente && divergencias.length > 0 && (
              <div className="flex items-center gap-4 p-5 bg-orange-100 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg">
                <AlertTriangle className="text-orange-600 shrink-0 h-6 w-6" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400 text-base">
                    {divergencias.length} inventário(s) aguardando revisão
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="border-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <TrendingUp size={18} />
                {isGerente ? 'Remessas Enviadas' : 'Remessas Recebidas'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                  {movimentacao.unidadesRemessa.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  unidades em {movimentacao.totalRemessas} remessa(s)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                <TrendingDown size={18} />
                Vendas Realizadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-green-800 dark:text-green-200">
                  {movimentacao.unidadesVenda.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  unidades em {movimentacao.totalVendas} venda(s)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats - Linha atualizada para gerente */}
        {isGerente ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package size={18} />
                  Estoque Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalItens}</p>
                <p className="text-xs text-muted-foreground mt-1">unidades</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp size={18} />
                  Modelos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalModelos}</p>
                <p className="text-xs text-muted-foreground mt-1">diferentes</p>
              </CardContent>
            </Card>

            <Card className="border-2 bg-destructive/10 border-destructive">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                  <XCircle size={18} />
                  Negativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-destructive">{stats.produtosNegativos}</p>
                <p className="text-xs text-muted-foreground mt-1">produtos</p>
              </CardContent>
            </Card>

            <Card className="border-2 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-300">
                  <AlertTriangle size={18} />
                  Críticos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{stats.produtosCriticos}</p>
                <p className="text-xs text-muted-foreground mt-1">≤ 5 unid.</p>
              </CardContent>
            </Card>

            <Card className="border-2 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Clock size={18} />
                  Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{stats.inventariosPendentes}</p>
                <p className="text-xs text-muted-foreground mt-1">inventários</p>
              </CardContent>
            </Card>

            <Card className="border-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 size={18} />
                  Aprovados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{stats.inventariosAprovados}</p>
                <p className="text-xs text-muted-foreground mt-1">inventários</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package size={18} />
                  Total em Estoque
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalItens}</p>
                <p className="text-xs text-muted-foreground mt-1">unidades</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp size={18} />
                  Modelos Diferentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.totalModelos}</p>
                <p className="text-xs text-muted-foreground mt-1">modelos</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ClipboardList size={18} />
                  Inventários Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.inventariosPendentes}</p>
                <p className="text-xs text-muted-foreground mt-1">aguardando</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Controle de Estoque dos Vendedores (apenas gerente) */}
        {isGerente && vendedoresEstoque.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Controle de Estoque por Vendedor</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Visão detalhada de remessas, vendas e itens de cada vendedor
                </p>
              </div>
              <Link to="/estoque-teorico">
                <Button variant="outline" size="sm">
                  Ver Estoque Completo <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vendedoresEstoque.map((vendedor) => (
                <VendedorEstoqueCard
                  key={vendedor.codigo_vendedor}
                  codigo_vendedor={vendedor.codigo_vendedor}
                  nome_vendedor={vendedor.nome_vendedor}
                  totalRemessas={vendedor.totalRemessas}
                  totalVendas={vendedor.totalVendas}
                  estoqueAtual={vendedor.estoqueAtual}
                  itens={vendedor.itens}
                  pedidosRecentes={vendedor.pedidosRecentes}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status dos Inventários (apenas gerente) */}
        {isGerente && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-2">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <FileCheck className="text-primary" size={22} />
                    Status dos Inventários
                  </span>
                  <Link to="/conferencia">
                    <Button variant="ghost" size="sm">
                      Ver todos <ArrowRight size={14} className="ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusInventarios.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum inventário registrado
                  </p>
                ) : (
                  <div className="space-y-3">
                    {statusInventarios.map((status) => (
                      <div 
                        key={status.codigo_vendedor}
                        className="flex items-center justify-between p-4 border-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-base">{status.nome_vendedor}</p>
                          <p className="text-xs text-muted-foreground mt-1">{status.codigo_vendedor}</p>
                          {status.ultimo_inventario && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Último: {new Date(status.ultimo_inventario).toLocaleDateString('pt-BR')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {status.inventarios_pendentes > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                              <Clock size={12} className="mr-1" />
                              {status.inventarios_pendentes}
                            </Badge>
                          )}
                          {status.inventarios_revisao > 0 && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                              <AlertTriangle size={12} className="mr-1" />
                              {status.inventarios_revisao}
                            </Badge>
                          )}
                          {status.inventarios_aprovados > 0 && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle2 size={12} className="mr-1" />
                              {status.inventarios_aprovados}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ações Rápidas */}
            <Card className="border-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Link to="/importar">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Importar Pedidos</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Carregar remessas e vendas</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/conferencia">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-orange-100 dark:bg-orange-900 rounded-lg">
                          <ClipboardList className="text-orange-600 dark:text-orange-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Conferir Inventários</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {stats.inventariosPendentes + stats.inventariosRevisao} aguardando
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/produtos">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-purple-100 dark:bg-purple-900 rounded-lg">
                          <Package className="text-purple-600 dark:text-purple-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Gerenciar Produtos</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Cadastrar e gerar QR codes</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/estoque-teorico">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-green-100 dark:bg-green-900 rounded-lg">
                          <Package className="text-green-600 dark:text-green-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Ver Estoque Completo</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{stats.totalItens} unidades</p>
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

        {/* Painel do Vendedor - Resumo */}
        {!isGerente && (
          <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Resumo do Estoque</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="p-5 border-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-3">
                    <TrendingUp size={18} />
                    <span className="font-medium">Remessas Recebidas</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">{movimentacao.unidadesRemessa}</p>
                  <p className="text-sm text-muted-foreground mt-1">unidades em {movimentacao.totalRemessas} remessa(s)</p>
                </div>
                <div className="p-5 border-2 rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-3">
                    <TrendingDown size={18} />
                    <span className="font-medium">Vendas Realizadas</span>
                  </div>
                  <p className="text-3xl font-bold text-green-800 dark:text-green-200">{movimentacao.unidadesVenda}</p>
                  <p className="text-sm text-muted-foreground mt-1">unidades em {movimentacao.totalVendas} venda(s)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Acesso rápido ao estoque - apenas vendedor */}
        {!isGerente && (
          <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package size={22} />
                Estoque Teórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="p-5 border-2 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">Total em Estoque</p>
                    <p className="text-3xl font-bold">{stats.totalItens}</p>
                    <p className="text-xs text-muted-foreground mt-1">unidades</p>
                  </div>
                  <div className="p-5 border-2 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">Modelos</p>
                    <p className="text-3xl font-bold">{stats.totalModelos}</p>
                    <p className="text-xs text-muted-foreground mt-1">diferentes</p>
                  </div>
                </div>
                <Link to="/estoque-teorico">
                  <Button className="w-full h-11">
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
