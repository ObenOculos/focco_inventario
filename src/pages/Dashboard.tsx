import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  useEstoqueQuery,
  useMovimentacaoResumoQuery,
  useDivergenciasQuery,
} from '@/hooks/useDashboardQuery';
import { useEstoqueTeoricoQuery } from '@/hooks/useEstoqueTeoricoQuery';
import { useInventariosCountQuery } from '@/hooks/useInventariosQuery';
import { useAcuracidadeMetricsQuery } from '@/hooks/useDashboardMetricsQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  AlertTriangle,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Target,
  Users,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeleton';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: estoqueArray = [], isLoading: loadingEstoque } = useEstoqueQuery(
    profile?.codigo_vendedor,
    isGerente
  );

  const {
    data: movimentacao = {
      totalRemessas: 0,
      unidadesRemessa: 0,
      valorRemessa: 0,
      totalVendas: 0,
      unidadesVenda: 0,
      valorVenda: 0,
    },
    isLoading: loadingMovimentacao,
  } = useMovimentacaoResumoQuery(profile?.codigo_vendedor, isGerente);

  const { data: inventariosPendentes = 0 } = useInventariosCountQuery(
    isGerente ? null : profile?.codigo_vendedor,
    'pendente'
  );
  const { data: inventariosAprovados = 0 } = useInventariosCountQuery(
    isGerente ? null : profile?.codigo_vendedor,
    'aprovado'
  );
  const { data: inventariosRevisao = 0 } = useInventariosCountQuery(
    isGerente ? null : profile?.codigo_vendedor,
    'revisao'
  );

  const { data: divergencias = [] } = useDivergenciasQuery(isGerente);
  const { data: acuracidadeMetrics, isLoading: loadingAcuracidade } =
    useAcuracidadeMetricsQuery(isGerente);

  const produtosNegativos = estoqueArray.filter((e) => e.estoque_teorico < 0);
  const produtosCriticos = estoqueArray.filter(
    (e) => e.estoque_teorico > 0 && e.estoque_teorico <= 5
  ).length;
  const totalItens = estoqueArray.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalModelos = new Set(estoqueArray.map((e) => e.modelo)).size;

  // Usar o mesmo cálculo de itens da página "Estoque (Teórico x Real)" para garantir
  // que contamos todos os códigos auxiliares (incluindo estoques zero)
  const vendorParam = isGerente ? 'todos' : profile?.codigo_vendedor ?? '';
  const { data: comparacaoDados = [] } = useEstoqueTeoricoQuery(isGerente, vendorParam, profile?.codigo_vendedor);
  const totalProdutos = comparacaoDados.length;

  const isLoading = loadingEstoque || loadingMovimentacao;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
    toast.success('Dados atualizados', {
      description: 'Todas as informações foram recarregadas com sucesso.',
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-base">
              {isGerente
                ? 'Visão geral do sistema - Últimos 30 dias'
                : 'Seu resumo de atividades - Últimos 30 dias'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>

        {/* Alertas - apenas para problemas críticos */}
        {(produtosNegativos.length > 0 ||
          (isGerente && inventariosPendentes + inventariosRevisao > 0)) && (
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
                <Link to="/estoque-teorico">
                  <Button variant="outline" size="sm">
                    Ver detalhes
                  </Button>
                </Link>
              </div>
            )}
            {isGerente && inventariosPendentes + inventariosRevisao > 0 && (
              <div className="flex items-center gap-4 p-5 bg-orange-100 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg">
                <Clock className="text-orange-600 shrink-0 h-6 w-6" />
                <div className="flex-1">
                  <p className="font-semibold text-orange-700 dark:text-orange-400 text-base">
                    {inventariosPendentes + inventariosRevisao} inventário(s) aguardando ação
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {inventariosPendentes > 0 && `${inventariosPendentes} pendente(s)`}
                    {inventariosPendentes > 0 && inventariosRevisao > 0 && ', '}
                    {inventariosRevisao > 0 && `${inventariosRevisao} em revisão`}
                  </p>
                </div>
                <Link to="/conferencia">
                  <Button variant="outline" size="sm">
                    Conferir
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Resumo de Movimentações */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg">Resumo de Movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 rounded-lg bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 p-4 space-y-2">
                <div className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <TrendingUp size={18} />
                  {isGerente ? 'Remessas Enviadas' : 'Remessas Recebidas'}
                </div>
                <div>
                  <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                    {movimentacao.unidadesRemessa.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    unidades em {movimentacao.totalRemessas} remessa(s)
                  </p>
                </div>
              </div>

              <div className="flex-1 rounded-lg bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800 p-4 space-y-2">
                <div className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                  <TrendingDown size={18} />
                  Vendas Realizadas
                </div>
                <div>
                  <p className="text-3xl font-bold text-green-800 dark:text-green-200">
                    {movimentacao.unidadesVenda.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    unidades em {movimentacao.totalVendas} venda(s)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard do Gerente */}
        {isGerente ? (
          <>
            {/* Métricas Principais */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-lg">Métricas Principais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 basis-44 rounded-lg border-2 p-4 space-y-2">
                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Package size={18} />
                      Estoque Total
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{totalItens.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{totalProdutos} itens</p>
                    </div>
                  </div>

                  <div className="flex-1 basis-44 rounded-lg border-2 p-4 space-y-2">
                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Target size={18} />
                      Acuracidade Geral
                    </div>
                    {loadingAcuracidade ? (
                      <div className="h-10 bg-muted animate-pulse rounded" />
                    ) : (
                      <div>
                        <p
                          className={`text-3xl font-bold ${
                            (acuracidadeMetrics?.taxaAcuracidadeGeral || 0) >= 95
                              ? 'text-green-600'
                              : (acuracidadeMetrics?.taxaAcuracidadeGeral || 0) >= 85
                              ? 'text-yellow-600'
                              : 'text-destructive'
                          }`}
                        >
                          {(acuracidadeMetrics?.taxaAcuracidadeGeral || 0).toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">últimos inventários</p>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 basis-44 rounded-lg bg-destructive/10 border-2 border-destructive p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-destructive">
                      <XCircle size={18} />
                      Negativos
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-destructive">{produtosNegativos.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">produtos</p>
                    </div>
                  </div>

                  <div className="flex-1 basis-44 rounded-lg bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500 p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-300">
                      <AlertTriangle size={18} />
                      Itens Divergentes
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">
                        {comparacaoDados.filter((d) => d.diferenca !== 0).length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">itens</p>
                    </div>
                  </div>

                  <div className="flex-1 basis-44 rounded-lg border-2 p-4 space-y-2">
                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <AlertTriangle size={18} />
                      Críticos
                    </div>
                    <div>
                      <p className="text-3xl font-bold">{produtosCriticos}</p>
                      <p className="text-xs text-muted-foreground mt-1">≤ 5 unidades</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status de Inventários */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-lg">Status de Inventários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex-1 rounded-lg bg-blue-50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800 p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <Clock size={18} />
                      Pendentes
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                        {inventariosPendentes}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">inventários para conferir</p>
                    </div>
                  </div>

                  <div className="flex-1 rounded-lg bg-orange-50 dark:bg-orange-950/20 border-2 border-orange-200 dark:border-orange-800 p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-orange-700 dark:text-orange-300">
                      <AlertTriangle size={18} />
                      Em Revisão
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">
                        {inventariosRevisao}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">aguardando correção</p>
                    </div>
                  </div>

                  <div className="flex-1 rounded-lg bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800 p-4 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                      <CheckCircle2 size={18} />
                      Aprovados
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                        {inventariosAprovados}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">inventários finalizados</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alertas de Vendedores */}
            {!loadingAcuracidade &&
              acuracidadeMetrics &&
              (acuracidadeMetrics.vendedoresSemInventario60Dias > 0 ||
                acuracidadeMetrics.vendedoresBaixaAcuracidade > 0) && (
                <Card className="border-2">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">                      
                      Alertas de Vendedores
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {acuracidadeMetrics.vendedoresSemInventario60Dias > 0 && (
                        <div className="flex items-center gap-3 p-4 border-2 rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                          <Clock className="text-orange-600 shrink-0" size={24} />
                          <div>
                            <p className="font-semibold text-orange-700 dark:text-orange-300">
                              {acuracidadeMetrics.vendedoresSemInventario60Dias} vendedor(es)
                            </p>
                            <p className="text-sm text-muted-foreground">
                              sem inventário há mais de 60 dias
                            </p>
                          </div>
                        </div>
                      )}
                      {acuracidadeMetrics.vendedoresBaixaAcuracidade > 0 && (
                        <div className="flex items-center gap-3 p-4 border-2 rounded-lg bg-destructive/10 border-destructive">
                          <Target className="text-destructive shrink-0" size={24} />
                          <div>
                            <p className="font-semibold text-destructive">
                              {acuracidadeMetrics.vendedoresBaixaAcuracidade} vendedor(es)
                            </p>
                            <p className="text-sm text-muted-foreground">
                              com acuracidade abaixo de 85%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Ações Rápidas */}
            <Card className="border-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Link to="/importar">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <TrendingUp className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Importar Pedidos</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Remessas e vendas</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/conferencia">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-orange-100 dark:bg-orange-900 rounded-lg">
                          <ClipboardList
                            className="text-orange-600 dark:text-orange-400"
                            size={20}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-base">Conferir Inventários</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inventariosPendentes + inventariosRevisao} aguardando
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/controle-vendedores">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-purple-100 dark:bg-purple-900 rounded-lg">
                          <BarChart3 className="text-purple-600 dark:text-purple-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Painel Vendedores</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Desempenho geral</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>

                  <Link to="/vendedores">
                    <Button variant="outline" className="w-full justify-between h-auto py-4">
                      <div className="flex items-center gap-3 text-left">
                        <div className="p-2.5 bg-green-100 dark:bg-green-900 rounded-lg">
                          <Users className="text-green-600 dark:text-green-400" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-base">Gerenciar Vendedores</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Cadastros</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Dashboard do Vendedor */
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg">Resumo do Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 rounded-lg border-2 p-4 space-y-2">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Package size={18} />
                    Total em Estoque
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalItens}</p>
                    <p className="text-xs text-muted-foreground mt-1">unidades</p>
                  </div>
                </div>

                <div className="flex-1 rounded-lg border-2 p-4 space-y-2">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <TrendingUp size={18} />
                    Modelos Diferentes
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalModelos}</p>
                    <p className="text-xs text-muted-foreground mt-1">modelos</p>
                  </div>
                </div>

                <div className="flex-1 rounded-lg border-2 p-4 space-y-2">
                  <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClipboardList size={18} />
                    Inventários Pendentes
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{inventariosPendentes}</p>
                    <p className="text-xs text-muted-foreground mt-1">aguardando</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
