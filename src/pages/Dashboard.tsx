import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  useInventariosAguardandoQuery,
  useInventariosRecentesQuery,
} from '@/hooks/useDashboardQuery';
import { useVendedoresQuery } from '@/hooks/useVendedoresQuery';
import { useInventariosCountQuery } from '@/hooks/useInventariosQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import { ArrowRight, CheckCircle2, GitCompare, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeleton';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * Dashboard do gerente. A rota é restrita a `gerente` e vendedores vão para /inventario,
 * então não existe visão de vendedor aqui.
 *
 * Três blocos, cada um respondendo uma pergunta diferente — nenhum repete o outro:
 *   1. O que preciso fazer  → fila de conferência
 *   2. Como está a equipe   → situação por vendedor, pior primeiro
 *   3. O que aconteceu      → últimos inventários aprovados
 *
 * Não há bloco de atalhos: o menu lateral é fixo e visível, e cartões repetindo os mesmos
 * links só consumiam a área mais valiosa da tela.
 */
const LIMITE_DIAS_ATRASO = 60;

export default function Dashboard() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: fila = [], isLoading: loadingFila } = useInventariosAguardandoQuery(true);
  const { data: vendedores = [], isLoading: loadingVendedores } = useVendedoresQuery();
  const { data: recentes = [] } = useInventariosRecentesQuery(true);
  const { data: aprovados = 0 } = useInventariosCountQuery(null, 'aprovado');

  const pendentes = fila.filter((i) => i.status === 'pendente').length;
  const emRevisao = fila.filter((i) => i.status === 'revisao').length;

  // Ordena pelo maior atraso: quem nunca inventariou primeiro, depois os mais atrasados.
  // A definição de atraso é a mesma exibida na lista (último inventário, qualquer status),
  // para não conviverem dois sentidos de "último inventário" na mesma tela.
  const equipe = useMemo(() => {
    const ativos = vendedores.filter((v) => v.ativo);
    const ordenados = [...ativos].sort(
      (a, b) => (b.dias_sem_inventario ?? 99999) - (a.dias_sem_inventario ?? 99999)
    );
    const atrasados = ativos.filter(
      (v) => v.dias_sem_inventario === null || v.dias_sem_inventario > LIMITE_DIAS_ATRASO
    ).length;
    return { ordenados, atrasados, total: ativos.length };
  }, [vendedores]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
    toast.success('Dados atualizados');
  };

  if (loadingFila || loadingVendedores) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Olá, ${profile?.nome?.split(' ')[0] || 'gerente'}`}
          description={
            <>
              {fila.length === 0
                ? 'Nada aguardando conferência agora.'
                : `${fila.length} inventário${fila.length > 1 ? 's' : ''} aguardando sua conferência.`}
              {equipe.atrasados > 0 &&
                ` ${equipe.atrasados} de ${equipe.total} vendedores sem inventariar há mais de ${LIMITE_DIAS_ATRASO} dias.`}
            </>
          }
          action={
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Atualizando' : 'Atualizar'}
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. O que preciso fazer */}
          <Card className="border border-border/80 shadow-xs rounded-2xl flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle className="text-base font-semibold tracking-tight">
                  Aguardando conferência
                </CardTitle>
                {fila.length > 0 && (
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    {pendentes > 0 && `${pendentes} pendente${pendentes > 1 ? 's' : ''}`}
                    {pendentes > 0 && emRevisao > 0 && ' · '}
                    {emRevisao > 0 && `${emRevisao} em revisão`}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {fila.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8">
                  <CheckCircle2 className="h-9 w-9 text-success mb-2.5" />
                  <p className="font-medium text-sm">Fila vazia</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Todo inventário enviado já foi conferido.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/70 -my-1">
                  {fila.map((inv) => (
                    <Link
                      key={inv.id}
                      to="/conferencia"
                      className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-accent/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{inv.nome_vendedor}</p>
                          <StatusInventarioBadge status={inv.status} className="shrink-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(inv.data_inventario), 'dd/MM/yyyy')} ·{' '}
                          {inv.itens_contados} itens ·{' '}
                          {inv.dias_esperando === 0
                            ? 'hoje'
                            : `há ${inv.dias_esperando} dia${inv.dias_esperando > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. Como está a equipe */}
          <Card className="border border-border/80 shadow-xs rounded-2xl flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Situação por vendedor
                </CardTitle>
                <span
                  className={`text-xs font-medium shrink-0 ${
                    equipe.atrasados > 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {equipe.atrasados > 0
                    ? `${equipe.atrasados} de ${equipe.total} atrasados`
                    : `${equipe.total} em dia`}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {equipe.ordenados.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum vendedor ativo cadastrado.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-border/70 -my-1 flex-1">
                    {equipe.ordenados.map((v) => {
                      const atrasado =
                        v.dias_sem_inventario === null ||
                        v.dias_sem_inventario > LIMITE_DIAS_ATRASO;
                      return (
                        <div
                          key={v.codigo_vendedor}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              atrasado ? 'bg-destructive' : 'bg-success'
                            }`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{v.nome}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {v.ultimo_inventario
                                ? `${format(new Date(v.ultimo_inventario.data), 'dd/MM/yyyy')} · ${v.ultimo_inventario.itens_contados} itens`
                                : 'Nunca inventariou'}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 ${
                              atrasado ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                          >
                            {v.dias_sem_inventario === null
                              ? '—'
                              : `${v.dias_sem_inventario}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <Link to="/vendedores" className="mt-3">
                    <Button variant="ghost" size="sm" className="w-full rounded-xl">
                      Abrir vendedores
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3. O que aconteceu */}
        <Card className="border border-border/80 shadow-xs rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle className="text-base font-semibold tracking-tight">
                Aprovados recentemente
              </CardTitle>
              <span className="text-xs font-medium text-muted-foreground shrink-0">
                {aprovados} no total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum inventário aprovado ainda.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {recentes.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-2xs"
                  >
                    <p className="text-sm font-semibold truncate">{inv.nome_vendedor}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(inv.data_inventario), 'dd/MM/yyyy')} ·{' '}
                      {inv.itens_contados} itens
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Link to="/comparar-inventarios">
              <Button variant="outline" size="sm" className="w-full mt-3.5 rounded-xl">
                <GitCompare className="mr-2 h-4 w-4" />
                Comparar dois inventários
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
