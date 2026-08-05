import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Users,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  AlertTriangle,
  Clock,
  CheckCircle,
  CalendarX,
  FileDown,
  ArrowUpDown,
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import { StatsCardsSkeleton } from '@/components/skeletons/CardSkeleton';
import { useVendedoresQuery, useInvalidateVendedores, Vendedor } from '@/hooks/useVendedoresQuery';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import * as XLSX from 'xlsx';

type SortField = 'nome' | 'itens_contados' | 'dias_sem_inventario';
type SortDirection = 'asc' | 'desc';
type StatusFiltro = 'todos' | 'ativos' | 'inativos';

/** Acima disso o inventário do vendedor deixa de ser considerado recente. */
const DIAS_INVENTARIO_RECENTE = 30;
/** Limite do aviso de atraso, alinhado ao `LIMITE_DIAS_ATRASO` do Dashboard. */
const DIAS_ALERTA = 60;

export default function Vendedores() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos');
  const [sortField, setSortField] = useState<SortField>('nome');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Vendedor | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    codigo_vendedor: '',
    telefone: '',
  });

  const { data: vendedores = [], isLoading, isFetching } = useVendedoresQuery();
  const invalidateVendedores = useInvalidateVendedores();

  const vendedoresFiltrados = useMemo(() => {
    const termo = searchTerm.toLowerCase();

    const resultado = vendedores.filter((v) => {
      if (statusFiltro === 'ativos' && !v.ativo) return false;
      if (statusFiltro === 'inativos' && v.ativo) return false;
      if (!termo) return true;
      return (
        v.nome.toLowerCase().includes(termo) ||
        v.email.toLowerCase().includes(termo) ||
        (v.codigo_vendedor ?? '').toLowerCase().includes(termo)
      );
    });

    resultado.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'nome':
          comparison = a.nome.localeCompare(b.nome);
          break;
        case 'itens_contados':
          comparison =
            (a.ultimo_inventario?.itens_contados ?? -1) -
            (b.ultimo_inventario?.itens_contados ?? -1);
          break;
        case 'dias_sem_inventario':
          comparison = (a.dias_sem_inventario ?? 999999) - (b.dias_sem_inventario ?? 999999);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return resultado;
  }, [vendedores, searchTerm, statusFiltro, sortField, sortDirection]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: vendedoresPaginados,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({ data: vendedoresFiltrados });

  /**
   * Panorama da equipe — descreve a base inteira, não o recorte da busca.
   *
   * Os três estados de inventário consideram só vendedores ATIVOS e são mutuamente
   * exclusivos, de modo que `emDia + atrasados + nunca = ativos`. Antes, "sem inventário
   * recente" continha "nunca inventariaram", e dois cartões lado a lado contavam as mesmas
   * pessoas sem dizer isso.
   */
  const metricas = useMemo(() => {
    const ativos = vendedores.filter((v) => v.ativo);
    return {
      total: vendedores.length,
      ativos: ativos.length,
      emDia: ativos.filter(
        (v) => v.dias_sem_inventario !== null && v.dias_sem_inventario <= DIAS_INVENTARIO_RECENTE
      ).length,
      atrasados: ativos.filter(
        (v) => v.dias_sem_inventario !== null && v.dias_sem_inventario > DIAS_INVENTARIO_RECENTE
      ).length,
      nunca: ativos.filter((v) => v.ultimo_inventario === null).length,
      // Só entre ativos: código faltando em vendedor desativado não é ação pendente.
      semCodigo: ativos.filter((v) => !v.codigo_vendedor).length,
      alerta: ativos.filter(
        (v) => v.dias_sem_inventario === null || v.dias_sem_inventario > DIAS_ALERTA
      ).length,
    };
  }, [vendedores]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleExport = () => {
    const dataToExport = vendedoresFiltrados.map((v) => ({
      Vendedor: v.nome,
      Código: v.codigo_vendedor || 'Sem código',
      Email: v.email,
      Telefone: v.telefone || '-',
      Status: v.ativo ? 'Ativo' : 'Inativo',
      'Último Inventário': v.ultimo_inventario
        ? new Date(v.ultimo_inventario.data).toLocaleDateString('pt-BR')
        : 'Nunca',
      'Status Inventário': v.ultimo_inventario?.status || '-',
      'Itens Contados': v.ultimo_inventario?.itens_contados ?? '-',
      'Dias sem Inventário': v.dias_sem_inventario ?? 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendedores');
    XLSX.writeFile(workbook, 'vendedores.xlsx');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (editingVendedor) {
        const { error } = await supabase
          .from('profiles')
          .update({
            nome: formData.nome,
            codigo_vendedor: formData.codigo_vendedor || null,
            telefone: formData.telefone,
          })
          .eq('id', editingVendedor.id);

        if (error) throw error;
        toast.success('Vendedor atualizado!');
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          toast.error('Sessão expirada');
          return;
        }

        const response = await fetch(
          `https://evsneoercdzzwxmhuxid.supabase.co/functions/v1/criar-vendedor`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao criar vendedor');
        toast.success('Vendedor criado! Um email foi enviado para definir a senha.');
      }

      invalidateVendedores();
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar vendedor');
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (vendedor: Vendedor) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: !vendedor.ativo })
      .eq('id', vendedor.id);

    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(vendedor.ativo ? 'Vendedor desativado' : 'Vendedor ativado');
      invalidateVendedores();
    }
  };

  const openEdit = (vendedor: Vendedor) => {
    setEditingVendedor(vendedor);
    setFormData({
      email: vendedor.email,
      nome: vendedor.nome,
      codigo_vendedor: vendedor.codigo_vendedor || '',
      telefone: vendedor.telefone || '',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingVendedor(null);
    setFormData({ email: '', nome: '', codigo_vendedor: '', telefone: '' });
  };

  /** Código do vendedor, ou o aviso de que ele falta — a ausência precisa ser visível. */
  const codigoLabel = (vendedor: Vendedor) =>
    vendedor.codigo_vendedor ? (
      <Badge variant="neutral" className="font-mono">
        {vendedor.codigo_vendedor}
      </Badge>
    ) : (
      <Badge variant="destructive" className="whitespace-nowrap">
        Sem código
      </Badge>
    );

  /**
   * Data do último inventário com o atraso em segundo plano. A cor escala com a gravidade:
   * silencioso até 30 dias, âmbar depois, vermelho acima do limite do alerta.
   */
  const ultimoInventarioLabel = (vendedor: Vendedor) => {
    if (!vendedor.ultimo_inventario) {
      return <span className="text-sm text-muted-foreground">Nunca</span>;
    }
    const dias = vendedor.dias_sem_inventario;
    const atrasado = dias !== null && dias > DIAS_INVENTARIO_RECENTE;
    return (
      <>
        <span className="text-sm font-medium tabular-nums">
          {new Date(vendedor.ultimo_inventario.data).toLocaleDateString('pt-BR')}
        </span>
        {atrasado && (
          <span
            className={`block text-xs font-semibold ${
              dias! > DIAS_ALERTA ? 'text-destructive-strong' : 'text-warning-strong'
            }`}
          >
            há {dias} dias
          </span>
        )}
      </>
    );
  };

  const acoes = (vendedor: Vendedor) => (
    <div className="flex items-center gap-2 justify-end">
      <Button
        variant="outline"
        size="icon"
        className="rounded-xl h-9 w-9 shadow-2xs"
        onClick={() => openEdit(vendedor)}
        aria-label={`Editar ${vendedor.nome}`}
      >
        <Pencil size={16} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={`rounded-xl h-9 w-9 shadow-2xs ${vendedor.ativo ? 'text-destructive hover:bg-destructive/10' : 'text-success-strong hover:bg-success-subtle'}`}
        onClick={() => toggleAtivo(vendedor)}
        aria-label={vendedor.ativo ? `Desativar ${vendedor.nome}` : `Ativar ${vendedor.nome}`}
      >
        {vendedor.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
      </Button>
    </div>
  );

  if (profile?.role !== 'gerente') {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>Acesso restrito a gerentes.</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const cartoes = [
    {
      valor: metricas.ativos,
      label: 'Vendedores ativos',
      nota: metricas.total > metricas.ativos ? `de ${metricas.total} cadastrados` : undefined,
      Icon: Users,
      cor: 'bg-primary/10 text-primary',
    },
    {
      valor: metricas.emDia,
      label: 'Inventário em dia',
      nota: `até ${DIAS_INVENTARIO_RECENTE} dias`,
      Icon: CheckCircle,
      cor: 'bg-success-subtle text-success-strong',
    },
    {
      valor: metricas.atrasados,
      label: 'Inventário atrasado',
      nota: `mais de ${DIAS_INVENTARIO_RECENTE} dias`,
      Icon: Clock,
      cor: 'bg-warning-subtle text-warning-strong',
    },
    {
      valor: metricas.nunca,
      label: 'Nunca inventariaram',
      nota: 'sem nenhuma contagem',
      Icon: CalendarX,
      cor: 'bg-destructive-subtle text-destructive-strong',
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Vendedores"
          description="Cadastro dos representantes e situação de inventário de cada um."
          isFetching={isFetching && !isLoading}
          action={
            <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="h-11 rounded-xl shadow-xs font-semibold shrink-0">
                <Plus className="mr-2" size={16} />
                Novo Vendedor
              </Button>
            </DialogTrigger>
            <DialogContent className="border border-border/80 rounded-2xl shadow-lg sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div>
                  <Label
                    htmlFor="vendedor-email"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
                  >
                    Email
                  </Label>
                  <Input
                    id="vendedor-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    disabled={!!editingVendedor}
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label
                    htmlFor="vendedor-nome"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
                  >
                    Nome
                  </Label>
                  <Input
                    id="vendedor-nome"
                    name="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <Label
                    htmlFor="vendedor-codigo"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
                  >
                    Código do Vendedor
                  </Label>
                  {/* Campo livre também na criação. Antes era um select alimentado pelos
                      codigo_vendedor distintos da tabela pedidos; com pedidos vazia, a lista
                      vinha sempre sem opções e não havia como cadastrar o código. */}
                  <Input
                    id="vendedor-codigo"
                    name="codigo_vendedor"
                    value={formData.codigo_vendedor}
                    onChange={(e) => setFormData({ ...formData, codigo_vendedor: e.target.value })}
                    className="h-11 rounded-xl border-input font-mono shadow-2xs"
                    placeholder="Ex: 11"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    É por ele que os inventários são vinculados. Sem código, o vendedor não
                    aparece em nenhum inventário.
                  </p>
                </div>
                <div>
                  <Label
                    htmlFor="vendedor-telefone"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block"
                  >
                    Telefone
                  </Label>
                  <Input
                    id="vendedor-telefone"
                    name="telefone"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={salvando}
                  className="w-full h-11 rounded-xl font-semibold shadow-xs transition-all mt-4"
                >
                  {salvando
                    ? 'Salvando...'
                    : editingVendedor
                      ? 'Salvar Alterações'
                      : 'Cadastrar Vendedor'}
                </Button>
              </form>
            </DialogContent>
            </Dialog>
          }
        />

        {/* Panorama: os três estados de inventário somam o total de ativos */}
        {isLoading ? (
          <StatsCardsSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {cartoes.map(({ valor, label, nota, Icon, cor }) => (
              <Card key={label} className="border border-border/80 rounded-2xl shadow-xs">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cor}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold tracking-tight tabular-nums leading-none">
                        {valor}
                      </p>
                      <p className="text-sm font-medium mt-1.5 truncate">{label}</p>
                      {nota && (
                        <p className="text-xs text-muted-foreground truncate">{nota}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Avisos lado a lado: empilhados, empurravam a tabela para fora da primeira dobra */}
        {!isLoading && (metricas.semCodigo > 0 || metricas.alerta > 0) && (
          <div className="grid gap-3 lg:grid-cols-2">
            {metricas.semCodigo > 0 && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription className="font-medium">
                  <strong>{metricas.semCodigo}</strong> vendedor(es) ativo(s) sem código. Sem ele
                  não há como vincular inventários — edite o cadastro para corrigir.
                </AlertDescription>
              </Alert>
            )}
            {metricas.alerta > 0 && (
              <Alert variant="warning">
                <Clock />
                <AlertDescription className="font-medium">
                  <strong>{metricas.alerta}</strong> vendedor(es) sem inventário há mais de{' '}
                  {DIAS_ALERTA} dias.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Lista */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-base font-semibold tracking-tight">
              <span className="flex items-center gap-2 shrink-0">
                <Users size={18} className="text-primary" />
                {isLoading
                  ? 'Vendedores'
                  : `${totalItems} ${totalItems === 1 ? 'vendedor' : 'vendedores'}`}
                {!isLoading && totalItems !== metricas.total && (
                  <span className="text-xs font-normal text-muted-foreground">
                    de {metricas.total}
                  </span>
                )}
              </span>
              <div className="flex flex-col sm:flex-row gap-2 lg:justify-end">
                <div className="sm:w-64">
                  <SearchFilter
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Buscar por nome, email ou código..."
                  />
                </div>
                <div className="flex gap-2">
                  <Select
                    value={statusFiltro}
                    onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}
                  >
                    <SelectTrigger className="h-11 rounded-xl w-full sm:w-36 shadow-2xs font-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="inativos">Inativos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleExport}
                    variant="outline"
                    size={isMobile ? 'icon' : 'default'}
                    className={`h-11 rounded-xl shadow-2xs shrink-0 ${!isMobile ? 'flex items-center gap-2 px-4' : ''}`}
                  >
                    <FileDown size={16} />
                    {!isMobile && 'Exportar'}
                    {isMobile && <span className="sr-only">Exportar</span>}
                  </Button>
                </div>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {isLoading ? (
              <TableSkeleton columns={6} rows={6} />
            ) : totalItems === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Users size={44} className="mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium">
                  {searchTerm || statusFiltro !== 'todos'
                    ? 'Nenhum vendedor encontrado para o filtro.'
                    : 'Nenhum vendedor cadastrado.'}
                </p>
                {(searchTerm || statusFiltro !== 'todos') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 rounded-xl"
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFiltro('todos');
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : isMobile ? (
              /* Cartões no mobile: a tabela de 6 colunas não cabe sem rolagem horizontal. */
              <div className="grid gap-3">
                {vendedoresPaginados.map((vendedor) => (
                  <div
                    key={vendedor.id}
                    className={`border border-border/80 rounded-2xl p-4 space-y-3 ${!vendedor.ativo ? 'bg-muted/30' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`font-semibold text-base truncate tracking-tight ${!vendedor.ativo ? 'text-muted-foreground' : ''}`}
                          >
                            {vendedor.nome}
                          </h3>
                          {!vendedor.ativo && (
                            <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground font-semibold rounded-md uppercase tracking-wider shrink-0">
                              Inativo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {vendedor.email}
                        </p>
                      </div>
                      {acoes(vendedor)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {codigoLabel(vendedor)}
                      {vendedor.telefone && (
                        <span className="text-xs text-muted-foreground">{vendedor.telefone}</span>
                      )}
                    </div>

                    <div className="flex items-end justify-between gap-3 pt-3 border-t border-border/60">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                          Último inventário
                        </p>
                        {ultimoInventarioLabel(vendedor)}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {vendedor.ultimo_inventario && (
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                            {vendedor.ultimo_inventario.itens_contados} itens
                          </span>
                        )}
                        <StatusInventarioBadge status={vendedor.ultimo_inventario?.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <TableHead
                        className="cursor-pointer hover:text-foreground font-semibold transition-colors"
                        onClick={() => handleSort('nome')}
                      >
                        <span className="flex items-center gap-1.5">
                          Vendedor
                          <ArrowUpDown size={13} />
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold w-[7.5rem]">Código</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground font-semibold transition-colors w-[11rem]"
                        onClick={() => handleSort('dias_sem_inventario')}
                      >
                        <span className="flex items-center gap-1.5">
                          Último inventário
                          <ArrowUpDown size={13} />
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold w-[7.5rem]">Situação</TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-foreground font-semibold text-right transition-colors w-[7.5rem]"
                        onClick={() => handleSort('itens_contados')}
                      >
                        <span className="flex items-center justify-end gap-1.5">
                          Itens
                          <ArrowUpDown size={13} />
                        </span>
                      </TableHead>
                      <TableHead className="text-right font-semibold w-[7.5rem]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendedoresPaginados.map((vendedor) => (
                      <TableRow
                        key={vendedor.id}
                        /* Inativo recebe fundo esmaecido em vez de `opacity`: o texto continua
                           legível e a linha ainda lê como secundária. */
                        className={`transition-colors ${vendedor.ativo ? 'hover:bg-muted/30' : 'bg-muted/30 hover:bg-muted/50'}`}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <p
                              className={`font-semibold text-sm ${vendedor.ativo ? 'text-foreground' : 'text-muted-foreground'}`}
                            >
                              {vendedor.nome}
                            </p>
                            {!vendedor.ativo && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-muted-foreground/15 text-muted-foreground font-semibold rounded uppercase tracking-wider shrink-0">
                                Inativo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{vendedor.email}</p>
                        </TableCell>
                        <TableCell>{codigoLabel(vendedor)}</TableCell>
                        <TableCell>{ultimoInventarioLabel(vendedor)}</TableCell>
                        <TableCell>
                          <StatusInventarioBadge status={vendedor.ultimo_inventario?.status} />
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm tabular-nums">
                          {vendedor.ultimo_inventario ? (
                            vendedor.ultimo_inventario.itens_contados
                          ) : (
                            <span className="text-muted-foreground font-normal">—</span>
                          )}
                        </TableCell>
                        <TableCell>{acoes(vendedor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalItems > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={totalItems}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={onPageChange}
                onItemsPerPageChange={onItemsPerPageChange}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
