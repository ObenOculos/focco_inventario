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

  const { data: acuracidadeMetrics, isLoading: loadingAcuracidade } =
    useAcuracidadeMetricsQuery(isGerente);

  const produtosNegativos = estoqueArray.filter((e) => e.estoque_teorico < 0);
  const produtosCriticos = estoqueArray.filter(
    (e) => e.estoque_teorico > 0 && e.estoque_teorico <= 5
  ).length;
  const totalItens = estoqueArray.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalModelos = new Set(estoqueArray.map((e) => e.modelo)).size;

  const vendorParam = isGerente ? 'todos' : (profile?.codigo_vendedor ?? '');
  const { data: comparacaoDados = [] } = useEstoqueTeoricoQuery(
    isGerente,
    vendorParam,
    profile?.codigo_vendedor
  );
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
      <div className="space-y-8 antialiased">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {isGerente
                ? 'Visão geral do sistema • Últimos 30 dias'
                : 'Seu resumo de atividades • Últimos 30 dias'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2 rounded-xl shadow-xs self-start sm:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>

        {/* Alertas Críticos */}
        {(produtosNegativos.length > 0 ||
          (isGerente && inventariosPendentes + inventariosRevisao > 0)) && (
          <div className="space-y-3">
            {produtosNegativos.length > 0 && (
              <div className="flex items-center gap-4 p-4 sm:p-5 bg-destructive/10 border border-destructive/30 rounded-2xl shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-destructive text-sm sm:text-base">
                    {produtosNegativos.length} produto(s) com estoque negativo
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Existem itens com saldo teórico inconsistente que precisam de verificação.
                  </p>
                </div>
                <Link to="/estoque-teorico">
                  <Button variant="outline" size="sm" className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10">
                    Ver detalhes
                  </Button>
                </Link>
              </div>
            )}
            {isGerente && inventariosPendentes + inventariosRevisao > 0 && (
              <div className="flex items-center gap-4 p-4 sm:p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Clock size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm sm:text-base">
                    {inventariosPendentes + inventariosRevisao} inventário(s) aguardando ação
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {inventariosPendentes > 0 && `${inventariosPendentes} pendente(s)`}
                    {inventariosPendentes > 0 && inventariosRevisao > 0 && ' • '}
                    {inventariosRevisao > 0 && `${inventariosRevisao} em revisão`}
                  </p>
                </div>
                <Link to="/conferencia">
                  <Button variant="outline" size="sm" className="rounded-xl border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
                    Conferir
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Resumo de Movimentações */}
        <Card className="border border-border/80 shadow-xs rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">Resumo de Movimentações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 sm:p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <TrendingUp size={16} />
                  </div>
                  {isGerente ? 'Remessas Enviadas' : 'Remessas Recebidas'}
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-300">
                    {movimentacao.unidadesRemessa.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    unidades movimentadas em {movimentacao.totalRemessas} remessa(s)
                  </p>
                </div>
              </div>

              <div className="flex-1 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 sm:p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <TrendingDown size={16} />
                  </div>
                  Vendas Realizadas
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                    {movimentacao.unidadesVenda.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    unidades faturadas em {movimentacao.totalVendas} venda(s)
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
            <Card className="border border-border/80 shadow-xs rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">Métricas Principais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <Package size={16} />
                      </div>
                      Estoque Total
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-bold tracking-tight">{totalItens.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">{totalProdutos} itens catalogados</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                        <Target size={16} />
                      </div>
                      Acuracidade Geral
                    </div>
                    {loadingAcuracidade ? (
                      <div className="h-9 bg-muted animate-pulse rounded-lg" />
                    ) : (
                      <div>
                        <p
                          className={`text-2xl sm:text-3xl font-bold tracking-tight ${
                            (acuracidadeMetrics?.taxaAcuracidadeGeral || 0) >= 95
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : (acuracidadeMetrics?.taxaAcuracidadeGeral || 0) >= 85
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-destructive'
                          }`}
                        >
                          {(acuracidadeMetrics?.taxaAcuracidadeGeral || 0).toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">últimos inventários</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 space-y-3 shadow-2xs">
                    <div className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
                        <XCircle size={16} />
                      </div>
                      Negativos
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-destructive">
                        {produtosNegativos.length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">produtos inconsistentes</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3 shadow-2xs">
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle size={16} />
                      </div>
                      Divergentes
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
                        {comparacaoDados.filter((d) => d.diferenca !== 0).length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">itens com divergência</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-500/10 text-slate-600 flex items-center justify-center">
                        <AlertTriangle size={16} />
                      </div>
                      Críticos
                    </div>
                    <div>
                      <p className="text-2xl sm:text-3xl font-bold tracking-tight">{produtosCriticos}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">≤ 5 unidades</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status de Inventários */}
            <Card className="border border-border/80 shadow-xs rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">Status de Inventários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 sm:p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Clock size={16} />
                      </div>
                      Pendentes
                    </div>
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-300">
                        {inventariosPendentes}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">
                        inventários para conferir
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 sm:p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle size={16} />
                      </div>
                      Em Revisão
                    </div>
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
                        {inventariosRevisao}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">aguardando correção</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 sm:p-5 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 size={16} />
                      </div>
                      Aprovados
                    </div>
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                        {inventariosAprovados}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">inventários finalizados</p>
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
                <Card className="border border-border/80 shadow-xs rounded-2xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                      Alertas de Vendedores
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {acuracidadeMetrics.vendedoresSemInventario60Dias > 0 && (
                        <div className="flex items-center gap-3.5 p-4 border border-amber-500/30 rounded-xl bg-amber-500/5">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <Clock size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm sm:text-base">
                              {acuracidadeMetrics.vendedoresSemInventario60Dias} vendedor(es)
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              sem inventário há mais de 60 dias
                            </p>
                          </div>
                        </div>
                      )}
                      {acuracidadeMetrics.vendedoresBaixaAcuracidade > 0 && (
                        <div className="flex items-center gap-3.5 p-4 border border-destructive/30 rounded-xl bg-destructive/5">
                          <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                            <Target size={20} />
                          </div>
                          <div>
                            <p className="font-semibold text-destructive text-sm sm:text-base">
                              {acuracidadeMetrics.vendedoresBaixaAcuracidade} vendedor(es)
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
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
            <Card className="border border-border/80 shadow-xs rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Link to="/importar">
                    <div className="group border border-border/70 hover:border-primary/40 bg-card hover:bg-accent/40 rounded-xl p-4 transition-all duration-200 shadow-2xs hover:shadow-sm flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                          <TrendingUp size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Importar Pedidos</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Remessas e vendas</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>

                  <Link to="/conferencia">
                    <div className="group border border-border/70 hover:border-primary/40 bg-card hover:bg-accent/40 rounded-xl p-4 transition-all duration-200 shadow-2xs hover:shadow-sm flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                          <ClipboardList size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Conferir Inventários</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inventariosPendentes + inventariosRevisao} aguardando
                          </p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>

                  <Link to="/controle-vendedores">
                    <div className="group border border-border/70 hover:border-primary/40 bg-card hover:bg-accent/40 rounded-xl p-4 transition-all duration-200 shadow-2xs hover:shadow-sm flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
                          <BarChart3 size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Painel Vendedores</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Desempenho geral</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>

                  <Link to="/vendedores">
                    <div className="group border border-border/70 hover:border-primary/40 bg-card hover:bg-accent/40 rounded-xl p-4 transition-all duration-200 shadow-2xs hover:shadow-sm flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                          <Users size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">Gerenciar Vendedores</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Cadastros</p>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Dashboard do Vendedor */
          <Card className="border border-border/80 shadow-xs rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">Resumo do Vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Package size={16} />
                    </div>
                    Total em Estoque
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{totalItens.toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">unidades físicas</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                      <TrendingUp size={16} />
                    </div>
                    Modelos Diferentes
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{totalModelos}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">modelos ativos em maleta</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <ClipboardList size={16} />
                    </div>
                    Inventários Pendentes
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{inventariosPendentes}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">aguardando envio/conferência</p>
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
