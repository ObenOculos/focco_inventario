import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useEstoqueQuery, useMovimentacaoResumoQuery, useEstoqueRealStatsQuery, useStatusInventariosQuery, useDivergenciasQuery } from '@/hooks/useDashboardQuery';
import { useInventariosCountQuery } from '@/hooks/useInventariosQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, TrendingUp, TrendingDown, ClipboardList, AlertTriangle, Users, ArrowRight, Clock, CheckCircle2, XCircle, FileCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeleton';

export default function Dashboard() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  const {
    data: estoqueArray = [],
    isLoading: loadingEstoque
  } = useEstoqueQuery(profile?.codigo_vendedor, isGerente);

  const {
    data: movimentacao = {
      totalRemessas: 0,
      unidadesRemessa: 0,
      valorRemessa: 0,
      totalVendas: 0,
      unidadesVenda: 0,
      valorVenda: 0
    },
    isLoading: loadingMovimentacao
  } = useMovimentacaoResumoQuery(profile?.codigo_vendedor, isGerente);

  const { data: estoqueRealStats } = useEstoqueRealStatsQuery(isGerente);
  
  const { data: inventariosPendentes = 0 } = useInventariosCountQuery(isGerente ? null : profile?.codigo_vendedor, 'pendente');
  const { data: inventariosAprovados = 0 } = useInventariosCountQuery(isGerente ? null : profile?.codigo_vendedor, 'aprovado');
  const { data: inventariosRevisao = 0 } = useInventariosCountQuery(isGerente ? null : profile?.codigo_vendedor, 'revisao');

  // Novos hooks React Query para substituir useEffect
  const { data: statusInventarios = [], isLoading: loadingStatus } = useStatusInventariosQuery(isGerente);
  const { data: divergencias = [] } = useDivergenciasQuery(isGerente);

  const produtosNegativos = estoqueArray.filter(e => e.estoque_teorico < 0);
  const produtosCriticos = estoqueArray.filter(e => e.estoque_teorico > 0 && e.estoque_teorico <= 5).length;
  const totalItens = estoqueArray.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalModelos = new Set(estoqueArray.map(e => e.modelo)).size;

  const isLoading = loadingEstoque || loadingMovimentacao;

  if (isLoading) {
    return <AppLayout><DashboardSkeleton /></AppLayout>;
  }

  return <AppLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-base">
            {isGerente ? 'Visão geral do sistema - Últimos 30 dias' : 'Seu resumo de atividades - Últimos 30 dias'}
          </p>
        </div>

        {/* Alertas */}
        {(produtosNegativos.length > 0 || divergencias.length > 0) && <div className="space-y-3">
            {produtosNegativos.length > 0 && <div className="flex items-center gap-4 p-5 bg-destructive/10 border-2 border-destructive rounded-lg">
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
              </div>}
            {isGerente && divergencias.length > 0 && <div className="flex items-center gap-4 p-5 bg-orange-100 dark:bg-orange-900/20 border-2 border-orange-500 rounded-lg">
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
              </div>}
          </div>}

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
        {isGerente ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package size={18} />
                  Estoque Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalItens}</p>
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
                <p className="text-3xl font-bold">{totalModelos}</p>
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
                <p className="text-3xl font-bold text-destructive">{produtosNegativos.length}</p>
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
                <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{produtosCriticos}</p>
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
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{inventariosPendentes}</p>
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
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{inventariosAprovados}</p>
                <p className="text-xs text-muted-foreground mt-1">inventários</p>
              </CardContent>
            </Card>

            {estoqueRealStats && (
              <Card className="border-2 bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-purple-700 dark:text-purple-300">
                    <FileCheck size={18} />
                    Estoque Real
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">{estoqueRealStats.vendedoresComEstoqueReal}</p>
                  <p className="text-xs text-muted-foreground mt-1">vendedores atualizados</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    {estoqueRealStats.vendedoresAtualizadosRecentemente} nos últimos 7 dias
                  </p>
                </CardContent>
              </Card>
            )}
          </div> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package size={18} />
                  Total em Estoque
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalItens}</p>
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
                <p className="text-3xl font-bold">{totalModelos}</p>
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
                <p className="text-3xl font-bold">{inventariosPendentes}</p>
                <p className="text-xs text-muted-foreground mt-1">aguardando</p>
              </CardContent>
            </Card>
          </div>}

        {/* Status dos Inventários (apenas gerente) */}
        {isGerente && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                {statusInventarios.length === 0 ? <p className="text-muted-foreground text-center py-8">
                    Nenhum inventário registrado
                  </p> : <div className="space-y-3">
                    {statusInventarios.map(status => <div key={status.codigo_vendedor} className="flex items-center justify-between p-4 border-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-base">{status.nome_vendedor}</p>
                          <p className="text-xs text-muted-foreground mt-1">{status.codigo_vendedor}</p>
                          {status.ultimo_inventario && <p className="text-xs text-muted-foreground mt-1">
                              Último: {new Date(status.ultimo_inventario).toLocaleDateString('pt-BR')}
                            </p>}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {status.inventarios_pendentes > 0 && <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                              <Clock size={12} className="mr-1" />
                              {status.inventarios_pendentes}
                            </Badge>}
                          {status.inventarios_revisao > 0 && <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                              <AlertTriangle size={12} className="mr-1" />
                              {status.inventarios_revisao}
                            </Badge>}
                          {status.inventarios_aprovados > 0 && <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                              <CheckCircle2 size={12} className="mr-1" />
                              {status.inventarios_aprovados}
                            </Badge>}
                        </div>
                      </div>)}
                  </div>}
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
                            {inventariosPendentes + inventariosRevisao} aguardando
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
                          <p className="text-xs text-muted-foreground mt-0.5">{totalItens} unidades</p>
                        </div>
                      </div>
                      <ArrowRight size={16} />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>}

        {/* Painel do Vendedor - Resumo */}
        {!isGerente && <Card className="border-2">
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
          </Card>}

        {/* Acesso rápido ao estoque - apenas vendedor */}
        {!isGerente && <Card className="border-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package size={22} />
                Estoque Teórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5 py-0 pb-[15px]">
                  <div className="p-5 border-2 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">Total em Estoque</p>
                    <p className="text-3xl font-bold">{totalItens}</p>
                    <p className="text-xs text-muted-foreground mt-1">unidades</p>
                  </div>
                  <div className="p-5 border-2 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">Modelos</p>
                    <p className="text-3xl font-bold">{totalModelos}</p>
                    <p className="text-xs text-muted-foreground mt-1">diferentes</p>
                  </div>
                </div>
                <Link to="/estoque-teorico">
                  <Button className="w-full h-11 my-0">
                    Ver Estoque Completo
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>}
      </div>
    </AppLayout>;
}