import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useInventariosEmRevisaoQuery } from '@/hooks/useDashboardQuery';
import { useInventariosCountQuery } from '@/hooks/useInventariosQuery';
import { useVendedoresSemInventarioQuery } from '@/hooks/useDashboardMetricsQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ClipboardCheck,
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  UserCog,
  GitCompare,
  FileCode,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeleton';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Dashboard() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const codigoDoVendedor = isGerente ? null : profile?.codigo_vendedor;

  const { data: inventariosPendentes = 0, isLoading: loadingPendentes } =
    useInventariosCountQuery(codigoDoVendedor, 'pendente');
  const { data: inventariosAprovados = 0, isLoading: loadingAprovados } =
    useInventariosCountQuery(codigoDoVendedor, 'aprovado');
  const { data: inventariosRevisao = 0, isLoading: loadingRevisao } = useInventariosCountQuery(
    codigoDoVendedor,
    'revisao'
  );

  const { data: emRevisao = [] } = useInventariosEmRevisaoQuery(isGerente);
  const { data: semInventario } = useVendedoresSemInventarioQuery(isGerente);

  const aguardandoAcao = inventariosPendentes + inventariosRevisao;
  const isLoading = loadingPendentes || loadingAprovados || loadingRevisao;

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

  const acoesRapidas = [
    {
      to: '/conferencia',
      icon: ClipboardCheck,
      titulo: 'Conferência',
      descricao:
        aguardandoAcao > 0 ? `${aguardandoAcao} aguardando ação` : 'Revisar e aprovar inventários',
      destaque: aguardandoAcao > 0,
    },
    {
      to: '/comparar-inventarios',
      icon: GitCompare,
      titulo: 'Comparar Inventários',
      descricao: 'Diferença entre duas contagens',
      destaque: false,
    },
    {
      to: '/exportar-xml',
      icon: FileCode,
      titulo: 'Exportar XML',
      descricao: 'Gerar XML de um inventário',
      destaque: false,
    },
    {
      to: '/controle-vendedores',
      icon: Users,
      titulo: 'Painel de Vendedores',
      descricao: 'Situação de inventário por vendedor',
      destaque: false,
    },
    {
      to: '/vendedores',
      icon: UserCog,
      titulo: 'Cadastro de Vendedores',
      descricao: 'Gerenciar acessos',
      destaque: false,
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 antialiased">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              {isGerente ? 'Visão geral dos inventários' : 'Seus inventários'}
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

        {/* Alertas */}
        {isGerente && (aguardandoAcao > 0 || (semInventario?.vendedoresSemInventario60Dias ?? 0) > 0) && (
          <div className="space-y-3">
            {aguardandoAcao > 0 && (
              <div className="flex items-center gap-4 p-4 sm:p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Clock size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm sm:text-base">
                    {aguardandoAcao} inventário(s) aguardando ação
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {inventariosPendentes > 0 && `${inventariosPendentes} pendente(s)`}
                    {inventariosPendentes > 0 && inventariosRevisao > 0 && ' • '}
                    {inventariosRevisao > 0 && `${inventariosRevisao} em revisão`}
                  </p>
                </div>
                <Link to="/conferencia">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    Conferir
                  </Button>
                </Link>
              </div>
            )}
            {(semInventario?.vendedoresSemInventario60Dias ?? 0) > 0 && (
              <div className="flex items-center gap-4 p-4 sm:p-5 bg-destructive/10 border border-destructive/30 rounded-2xl shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-destructive text-sm sm:text-base">
                    {semInventario?.vendedoresSemInventario60Dias} vendedor(es) sem inventário
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Nenhum inventário aprovado nos últimos 60 dias.
                  </p>
                </div>
                <Link to="/controle-vendedores">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    Ver painel
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Status de Inventários */}
        <Card className="border border-border/80 shadow-xs rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
              {isGerente ? 'Status de Inventários' : 'Meus Inventários'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 sm:p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Clock size={16} />
                  </div>
                  Pendentes
                </div>
                <p className="text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-300">
                  {inventariosPendentes}
                </p>
              </div>

              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 sm:p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <XCircle size={16} />
                  </div>
                  Em revisão
                </div>
                <p className="text-3xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
                  {inventariosRevisao}
                </p>
              </div>

              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 sm:p-5 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 size={16} />
                  </div>
                  Aprovados
                </div>
                <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                  {inventariosAprovados}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isGerente ? (
          <>
            {emRevisao.length > 0 && (
              <Card className="border border-border/80 shadow-xs rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                    Devolvidos para revisão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-border/70">
                    {emRevisao.map((inv) => (
                      <div
                        key={inv.inventario_id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{inv.nome_vendedor}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {inv.codigo_vendedor} · {format(new Date(inv.data), 'dd/MM/yyyy')}
                          </p>
                        </div>
                        <Link to="/conferencia">
                          <Button variant="ghost" size="sm" className="rounded-xl">
                            Abrir <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border border-border/80 shadow-xs rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                  Ações Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {acoesRapidas.map((acao) => (
                    <Link key={acao.to} to={acao.to} className="group">
                      <div
                        className={`h-full rounded-xl border p-4 flex items-start gap-3 transition-all shadow-2xs hover:shadow-md ${
                          acao.destaque
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : 'border-border/70 bg-card hover:border-primary/50'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <acao.icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{acao.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{acao.descricao}</p>
                        </div>
                        <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border border-border/80 shadow-xs rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                Ações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link to="/inventario" className="group">
                  <div className="h-full rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3 transition-all shadow-2xs hover:shadow-md hover:border-primary/50">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <ClipboardList size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Fazer Inventário</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Registrar a contagem de estoque
                      </p>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
                <Link to="/historico" className="group">
                  <div className="h-full rounded-xl border border-border/70 bg-card p-4 flex items-start gap-3 transition-all shadow-2xs hover:shadow-md hover:border-primary/50">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <ClipboardCheck size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">Histórico</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inventários anteriores e status
                      </p>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
