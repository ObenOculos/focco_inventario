import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ClipboardList,
  Download,
  Loader2,
  Merge,
  Minus,
  Package,
  Save,
  Settings,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import * as XLSX from 'xlsx';
import { ConferenciaSkeleton } from '@/components/skeletons/PageSkeleton';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventariosPendentesQuery, InventarioComItens } from '@/hooks/useConferenciaQuery';
import { useVendedoresSimpleQuery } from '@/hooks/useAnaliseInventarioQuery';
import { FiltroCategorias } from '@/components/FiltroCategorias';
import { CabecalhoOrdenavel } from '@/components/CabecalhoOrdenavel';
import { alternarOrdem, type DirecaoOrdem, type Ordenacao } from '@/lib/ordenacao';
import {
  NIVEIS,
  SELECAO_VAZIA,
  casaComSelecao,
  temSelecao,
  type SelecaoCategorias,
} from '@/lib/categoriasProduto';

/**
 * Conferência de Inventários — revisão e aprovação.
 *
 * O fluxo é apenas: o vendedor conta, envia, o gerente revisa a contagem, aprova, e o
 * inventário fica salvo. Não há cálculo de divergência aqui: comparar dois inventários é
 * funcionalidade independente, na página Comparar Inventários.
 */

/**
 * O que a tela precisa saber de `produtos` sobre cada código contado.
 *
 * Era só o valor. Os atributos de categoria entraram na MESMA consulta que já buscava
 * o valor — nenhum request a mais — e é o que permite filtrar a revisão por
 * Marca/Tipo/Subtipo/Grupo em inventários de centenas de itens.
 */
type FichaProduto = {
  valor: number;
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
};

const FICHA_VAZIA: FichaProduto = {
  valor: 0,
  marca: null,
  tipo: null,
  subtipo: null,
  grupo: null,
};

type ItemRevisao = {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
  valor_unitario: number;
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
};

const mensagemErro = (e: unknown, fallback = 'Ocorreu um erro.') =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * A busca varre também a categoria, que agora está escrita na linha — texto visível que
 * a busca não encontra se lê como busca quebrada. Referência estável: um literal no
 * corpo do componente seria um array novo a cada render.
 */
const CAMPOS_DE_BUSCA_ITEM: (keyof ItemRevisao)[] = [
  'codigo_auxiliar',
  'nome_produto',
  'marca',
  'tipo',
  'subtipo',
  'grupo',
];

/** `OBEN · OCULOS SOLAR · FEMININO · ACETATO`, omitindo os níveis vazios. */
const categoriaDoItem = (i: ItemRevisao) =>
  NIVEIS.map(({ chave }) => i[chave])
    .filter(Boolean)
    .join(' · ');

/** Colunas ordenáveis da revisão. "Ações" fica de fora: não há o que comparar. */
type CampoOrdemItem = 'codigo_auxiliar' | 'quantidade_fisica' | 'valor_total';

/**
 * Direção do PRIMEIRO clique de cada coluna.
 *
 * Código começa em A→Z. Quantidade e valor começam no maior: quem ordena por eles numa
 * conferência está atrás do item fora da curva, e abrir nos zeros custa um clique extra
 * toda vez.
 */
const DIRECAO_INICIAL: Record<CampoOrdemItem, DirecaoOrdem> = {
  codigo_auxiliar: 'asc',
  quantidade_fisica: 'desc',
  valor_total: 'desc',
};

export default function Conferencia() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';
  const queryClient = useQueryClient();

  const [selectedInventario, setSelectedInventario] = useState<InventarioComItens | null>(null);
  const [fichasMap, setFichasMap] = useState<Record<string, FichaProduto>>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Filtros da lista
  const [buscaVendedor, setBuscaVendedor] = useState('');
  const [selectedVendedor, setSelectedVendedor] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Revisão dos itens
  const [buscaItem, setBuscaItem] = useState('');
  const [categoriasItem, setCategoriasItem] = useState<SelecaoCategorias>(SELECAO_VAZIA);
  /** Ordem da tabela de revisão. Abre por código, que era a ordem fixa de antes. */
  const [ordemItens, setOrdemItens] = useState<Ordenacao<CampoOrdemItem>>({
    campo: 'codigo_auxiliar',
    direcao: 'asc',
  });
  const [editedValues, setEditedValues] = useState<Record<string, number>>({});
  const [deletingItem, setDeletingItem] = useState<{
    codigo_auxiliar: string;
    itemId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Ações do gerente
  const [observacoes, setObservacoes] = useState('');
  const [showManagerActions, setShowManagerActions] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReverterDialog, setShowReverterDialog] = useState(false);
  const [reverting, setReverting] = useState(false);

  // Junção de inventários fragmentados
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [showJuntarDialog, setShowJuntarDialog] = useState(false);
  const [destinoId, setDestinoId] = useState<string>('');
  const [juntando, setJuntando] = useState(false);

  const { data: vendedores = [], isLoading: isLoadingVendedores } =
    useVendedoresSimpleQuery(isGerente);
  const {
    data: inventarios = [],
    isLoading: loading,
    isFetching,
    refetch: refetchInventarios,
  } = useInventariosPendentesQuery(statusFilter, selectedVendedor);

  useEffect(() => {
    setSelectedInventario(null);
    setSelecionados([]);
  }, [selectedVendedor, statusFilter]);

  // ─── Lista ────────────────────────────────────────────────

  const listaComBusca = useMemo(() => {
    return inventarios.map((inv) => ({
      ...inv,
      nome_vendedor: inv.profiles?.nome || inv.codigo_vendedor,
    }));
  }, [inventarios]);

  const { paginatedData: inventariosPaginados, ...paginacaoLista } = usePagination({
    data: listaComBusca,
    searchTerm: buscaVendedor,
    searchFields: ['nome_vendedor', 'codigo_vendedor'],
    itemsPerPage: 12,
  });

  const invSelecionados = useMemo(
    () => inventarios.filter((i) => selecionados.includes(i.id)),
    [inventarios, selecionados]
  );

  // Juntar só faz sentido dentro do mesmo vendedor, e a RPC recusa o contrário
  const vendedorDosSelecionados = useMemo(() => {
    const codigos = new Set(invSelecionados.map((i) => i.codigo_vendedor));
    return codigos.size === 1 ? [...codigos][0] : null;
  }, [invSelecionados]);

  const podeJuntar = selecionados.length >= 2 && vendedorDosSelecionados !== null;

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ─── Detalhe ──────────────────────────────────────────────

  const handleSelectInventario = useCallback(
    async (inventario: InventarioComItens) => {
      if (selectedInventario?.id === inventario.id) return;

      setIsDetailLoading(true);
      setSelectedInventario(inventario);
      setObservacoes('');
      setBuscaItem('');
      // O inventário seguinte pode não ter nenhum POWER: manter o recorte abriria a
      // revisão numa tabela vazia, com o seletor apontando para uma marca ausente.
      setCategoriasItem(SELECAO_VAZIA);
      setEditedValues({});

      // Valor e categoria do catálogo: o valor para exibir o total por item, a categoria
      // para o filtro da revisão. Em lotes por causa do limite de 1000 linhas por request.
      const codigos = Array.from(
        new Set(inventario.itens_inventario.map((i) => i.codigo_auxiliar))
      );
      const novoMap: Record<string, FichaProduto> = {};
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, valor_produto, marca, tipo, subtipo, grupo')
          .in('codigo_auxiliar', lote);
        data?.forEach((p) => {
          novoMap[p.codigo_auxiliar] = {
            valor: Number(p.valor_produto) || 0,
            marca: p.marca,
            tipo: p.tipo,
            subtipo: p.subtipo,
            grupo: p.grupo,
          };
        });
      }
      setFichasMap(novoMap);
      setIsDetailLoading(false);
    },
    [selectedInventario]
  );

  const itensRevisao: ItemRevisao[] = useMemo(() => {
    if (!selectedInventario) return [];
    return selectedInventario.itens_inventario
      .map((it) => {
        const ficha = fichasMap[it.codigo_auxiliar] ?? FICHA_VAZIA;
        return {
          id: it.id,
          codigo_auxiliar: it.codigo_auxiliar,
          nome_produto: it.nome_produto || it.codigo_auxiliar,
          quantidade_fisica: Number(it.quantidade_fisica) || 0,
          valor_unitario: ficha.valor,
          marca: ficha.marca,
          tipo: ficha.tipo,
          subtipo: ficha.subtipo,
          grupo: ficha.grupo,
        };
      })
      .sort((a, b) => a.codigo_auxiliar.localeCompare(b.codigo_auxiliar));
  }, [selectedInventario, fichasMap]);

  /**
   * O recorte por categoria vale para a TABELA, e não para os cards de resumo.
   *
   * É o oposto do que o Comparativo faz, de propósito. Lá os cards são análise — "quanto
   * está faltando na OBEN" é uma pergunta legítima. Aqui eles são a identidade do
   * inventário que está prestes a ser APROVADO: um "Valor total" que encolhe porque
   * havia um filtro de tela ligado é exatamente o número que não pode variar conforme a
   * visualização.
   */
  const itensNoRecorte = useMemo(
    () =>
      temSelecao(categoriasItem)
        ? itensRevisao.filter((i) => casaComSelecao(i, categoriasItem))
        : itensRevisao,
    [itensRevisao, categoriasItem]
  );

  /**
   * A ordem da tabela usa o valor SALVO, nunca o rascunho de `editedValues`.
   *
   * Ordenar pelo valor exibido parece mais coerente e quebra a edição: `handleEditValue`
   * dispara a cada tecla, então trocar 500 por 5 reordenaria a tabela no meio da
   * digitação — o campo saltaria para longe e perderia o foco depois do primeiro
   * caractere. Enquanto há edição pendente a ordem fica parada de propósito; ao salvar,
   * o inventário é recarregado e as duas voltam a coincidir.
   */
  const itensOrdenados = useMemo(() => {
    const { campo, direcao } = ordemItens;
    const sinal = direcao === 'asc' ? 1 : -1;
    return [...itensNoRecorte].sort((a, b) => {
      let comparacao = 0;
      switch (campo) {
        case 'codigo_auxiliar':
          comparacao = a.codigo_auxiliar.localeCompare(b.codigo_auxiliar, 'pt-BR');
          break;
        case 'quantidade_fisica':
          comparacao = a.quantidade_fisica - b.quantidade_fisica;
          break;
        case 'valor_total':
          comparacao =
            a.quantidade_fisica * a.valor_unitario - b.quantidade_fisica * b.valor_unitario;
          break;
      }
      // Desempate estável pelo código: sem ele, itens de mesma quantidade trocam de lugar
      // entre renders e a tabela "pisca" ao editar qualquer outra linha.
      if (comparacao === 0) return a.codigo_auxiliar.localeCompare(b.codigo_auxiliar, 'pt-BR');
      return sinal * comparacao;
    });
  }, [itensNoRecorte, ordemItens]);

  const ordenarItens = (campo: CampoOrdemItem) =>
    setOrdemItens((atual) => alternarOrdem(atual, campo, DIRECAO_INICIAL[campo]));

  const { paginatedData: itensPaginados, ...paginacaoItens } = usePagination({
    data: itensOrdenados,
    searchTerm: buscaItem,
    searchFields: CAMPOS_DE_BUSCA_ITEM,
    itemsPerPage: 10,
  });

  const resumo = useMemo(() => {
    const unidades = itensRevisao.reduce(
      (acc, i) => acc + (editedValues[i.codigo_auxiliar] ?? i.quantidade_fisica),
      0
    );
    const valor = itensRevisao.reduce(
      (acc, i) =>
        acc + (editedValues[i.codigo_auxiliar] ?? i.quantidade_fisica) * i.valor_unitario,
      0
    );
    return { produtos: itensRevisao.length, unidades, valor };
  }, [itensRevisao, editedValues]);

  const hasEdits = Object.keys(editedValues).length > 0;
  const isPendingOrRevisao =
    selectedInventario && ['pendente', 'revisao'].includes(selectedInventario.status);

  const voltarParaLista = () => {
    setSelectedInventario(null);
    setBuscaItem('');
    setObservacoes('');
    setEditedValues({});
  };

  const invalidarTudo = () => {
    queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
    queryClient.invalidateQueries({ queryKey: ['inventarios'] });
    queryClient.invalidateQueries({ queryKey: ['inventarios-xml'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // ─── Ações ────────────────────────────────────────────────

  const handleManagerAction = async (action: 'aprovar' | 'revisao') => {
    if (!selectedInventario) return;
    if (!isGerente) {
      toast.error('Acesso negado. Apenas gerentes podem aprovar ou revisar inventários.');
      return;
    }
    if (action === 'revisao' && !observacoes.trim()) {
      toast.error('Informe o motivo da não aprovação para enviar para revisão.');
      return;
    }

    setSaving(true);
    try {
      if (action === 'aprovar') {
        const { data, error } = await supabase.functions.invoke('aprovar-e-ajustar-inventario', {
          body: { inventario_id: selectedInventario.id },
        });
        if (error) throw error;
        toast.success(data?.message || 'Inventário aprovado!');
      } else {
        const { error } = await supabase
          .from('inventarios')
          .update({ status: 'revisao', observacoes_gerente: observacoes })
          .eq('id', selectedInventario.id);
        if (error) throw error;
        toast.info('Inventário enviado para revisão.');
      }

      invalidarTudo();
      setSelectedInventario(null);
      refetchInventarios();
    } catch (error) {
      console.error(`Erro ao ${action} inventário:`, error);
      toast.error(`Erro ao ${action} inventário`, {
        description: mensagemErro(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReverterAprovacao = async () => {
    if (!selectedInventario) return;
    setReverting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reverter-aprovacao-inventario', {
        body: { inventario_id: selectedInventario.id },
      });
      if (error) {
        // error.message do supabase-js só diz "non-2xx status code"; a mensagem real
        // vem no corpo JSON da resposta da edge function.
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        let msg = error.message;
        try {
          if (typeof ctx?.json === 'function') {
            const j = await ctx.json();
            if (j?.error) msg = j.error;
          }
        } catch {
          /* mantém a mensagem original */
        }
        throw new Error(msg);
      }
      toast.success(data?.message || 'Aprovação revertida.');
      invalidarTudo();
      setShowReverterDialog(false);
      setSelectedInventario(null);
      refetchInventarios();
    } catch (e) {
      toast.error('Não foi possível reverter', { description: mensagemErro(e) });
    } finally {
      setReverting(false);
    }
  };

  const handleEditValue = (codigoAuxiliar: string, value: string) => {
    if (value === '' || value === '-') {
      setEditedValues((prev) => ({ ...prev, [codigoAuxiliar]: 0 }));
      return;
    }
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setEditedValues((prev) => ({ ...prev, [codigoAuxiliar]: numValue }));
    }
  };

  const handleSaveEdits = async () => {
    if (!selectedInventario || !hasEdits) return;

    setSaving(true);
    try {
      const updates = Object.entries(editedValues).map(([codigo, quantidade]) => {
        const item = selectedInventario.itens_inventario.find(
          (i) => i.codigo_auxiliar === codigo
        );
        return supabase
          .from('itens_inventario')
          .update({ quantidade_fisica: quantidade })
          .eq('id', item!.id);
      });
      const results = await Promise.all(updates);
      results.forEach((res) => {
        if (res.error) throw res.error;
      });

      setSelectedInventario((prev) =>
        prev
          ? {
              ...prev,
              itens_inventario: prev.itens_inventario.map((i) =>
                editedValues[i.codigo_auxiliar] !== undefined
                  ? { ...i, quantidade_fisica: editedValues[i.codigo_auxiliar] }
                  : i
              ),
            }
          : null
      );
      setEditedValues({});
      toast.success('Alterações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingItem || !selectedInventario) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('itens_inventario')
        .delete()
        .eq('id', deletingItem.itemId);
      if (error) throw error;

      setSelectedInventario((prev) =>
        prev
          ? {
              ...prev,
              itens_inventario: prev.itens_inventario.filter(
                (i) => i.id !== deletingItem.itemId
              ),
            }
          : null
      );
      toast.success(`Item ${deletingItem.codigo_auxiliar} removido do inventário.`);
      setDeletingItem(null);
    } catch (error) {
      console.error('Erro ao deletar item:', error);
      toast.error('Erro ao remover item', { description: mensagemErro(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInventario = async () => {
    if (!selectedInventario || !isGerente) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('inventarios')
        .delete()
        .eq('id', selectedInventario.id);
      if (error) throw error;
      toast.success('Inventário excluído com sucesso.');
      setSelectedInventario(null);
      invalidarTudo();
    } catch (err) {
      console.error('Erro ao excluir inventário:', err);
      toast.error('Erro ao excluir inventário', { description: mensagemErro(err) });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleJuntar = async () => {
    if (!destinoId || selecionados.length < 2) return;
    setJuntando(true);
    try {
      const origens = selecionados.filter((id) => id !== destinoId);
      const { data, error } = await supabase.rpc('juntar_inventarios', {
        p_inventario_destino: destinoId,
        p_inventarios_origem: origens,
      });
      if (error) throw error;

      const r = Array.isArray(data) ? data[0] : data;
      toast.success('Inventários juntados', {
        description: r
          ? `${r.total_produtos} produtos · ${Number(r.total_unidades)} unidades · ${r.absorvidos} inventário(s) absorvido(s).`
          : undefined,
      });
      setShowJuntarDialog(false);
      setSelecionados([]);
      setDestinoId('');
      invalidarTudo();
      refetchInventarios();
    } catch (e) {
      console.error('Erro ao juntar inventários:', e);
      toast.error('Não foi possível juntar', { description: mensagemErro(e) });
    } finally {
      setJuntando(false);
    }
  };

  const handleExportExcel = () => {
    if (!selectedInventario || itensRevisao.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }

    const exportData = itensRevisao.map((item) => {
      const qtd = editedValues[item.codigo_auxiliar] ?? item.quantidade_fisica;
      return {
        'Código Auxiliar': item.codigo_auxiliar,
        'Nome Produto': item.nome_produto,
        // Categoria em colunas separadas, e não numa string só: é assim que serve para
        // a tabela dinâmica de quem abre a planilha.
        Marca: item.marca ?? '',
        Tipo: item.tipo ?? '',
        Subtipo: item.subtipo ?? '',
        Grupo: item.grupo ?? '',
        Quantidade: qtd,
        'Valor Unitário': item.valor_unitario,
        'Valor Total': qtd * item.valor_unitario,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');

    const vendorName = selectedInventario.profiles?.nome || selectedInventario.codigo_vendedor;
    const dateStr = format(new Date(selectedInventario.data_inventario), 'dd-MM-yyyy');
    const fileName = `inventario_${vendorName}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Arquivo ${fileName} baixado com sucesso.`);
  };

  // ─── Render ───────────────────────────────────────────────

  const isInitialLoading = loading || (isGerente && isLoadingVendedores);

  if (isInitialLoading) {
    return (
      <AppLayout>
        <ConferenciaSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conferência de Inventários"
          description="Revise a contagem enviada pelo vendedor e aprove o inventário"
          isFetching={isFetching && !loading}
        />

        {!selectedInventario ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex flex-col lg:flex-row gap-3">
                  <SearchFilter
                    value={buscaVendedor}
                    onChange={setBuscaVendedor}
                    placeholder="Buscar por vendedor ou código..."
                    className="max-w-none lg:max-w-sm"
                  />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full lg:w-52 h-11 rounded-xl">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os status</SelectItem>
                      <SelectItem value="pendentes">Pendentes / Revisão</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="revisao">Revisão</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                    </SelectContent>
                  </Select>
                  {isGerente && (
                    <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                      <SelectTrigger className="w-full lg:w-72 h-11 rounded-xl">
                        <SelectValue placeholder="Filtrar por vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os vendedores</SelectItem>
                        {vendedores.map((v) => (
                          <SelectItem key={v.codigo_vendedor} value={v.codigo_vendedor}>
                            {v.nome} ({v.codigo_vendedor})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selecionados.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/80 bg-muted/40 p-3">
                    <span className="text-sm font-medium">
                      {selecionados.length} inventário(s) selecionado(s)
                    </span>
                    {selecionados.length >= 2 && vendedorDosSelecionados === null && (
                      <span className="text-xs text-destructive">
                        Só é possível juntar inventários do mesmo vendedor.
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelecionados([])}>
                        Limpar seleção
                      </Button>
                      <Button
                        size="sm"
                        disabled={!podeJuntar}
                        onClick={() => {
                          const maisAntigo = [...invSelecionados].sort((a, b) =>
                            a.data_inventario.localeCompare(b.data_inventario)
                          )[0];
                          setDestinoId(maisAntigo?.id || '');
                          setShowJuntarDialog(true);
                        }}
                      >
                        <Merge className="mr-2 h-4 w-4" />
                        Juntar inventários
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList size={20} />
              Inventários
              <Badge variant="secondary">{paginacaoLista.totalItems}</Badge>
            </h2>

            {paginacaoLista.totalItems === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle size={48} className="mx-auto mb-4 text-success" />
                  <h2 className="text-xl font-bold mb-2">Nenhum inventário encontrado</h2>
                  <p className="text-muted-foreground">
                    Ajuste os filtros ou aguarde novos inventários.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {inventariosPaginados.map((inv) => {
                    const marcado = selecionados.includes(inv.id);
                    return (
                      <Card
                        key={inv.id}
                        className={`border transition-all rounded-2xl shadow-2xs hover:shadow-md cursor-pointer group ${
                          marcado
                            ? 'border-primary ring-1 ring-primary'
                            : 'border-border/80 hover:border-primary/50'
                        }`}
                        onClick={() => handleSelectInventario(inv)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              {isGerente && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="pt-0.5 shrink-0"
                                >
                                  <Checkbox
                                    checked={marcado}
                                    onCheckedChange={() => toggleSelecionado(inv.id)}
                                    aria-label="Selecionar para juntar"
                                  />
                                </div>
                              )}
                              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                                <User size={16} className="shrink-0" />
                                <span className="truncate">{inv.nome_vendedor}</span>
                              </CardTitle>
                            </div>
                            <StatusInventarioBadge status={inv.status} className="shrink-0" />
                          </div>
                          <p className="font-mono text-xs text-muted-foreground pt-1">
                            {inv.codigo_vendedor}
                          </p>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Package size={14} />
                              {new Set(inv.itens_inventario.map((i) => i.codigo_auxiliar)).size}{' '}
                              produtos ·{' '}
                              {inv.itens_inventario.reduce(
                                (sum, item) => sum + Number(item.quantidade_fisica),
                                0
                              )}{' '}
                              un.
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Calendar size={14} />{' '}
                              {format(new Date(inv.data_inventario), 'dd/MM/yy')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground pt-1 font-medium">
                            Enviado{' '}
                            {formatDistanceToNow(new Date(inv.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                {paginacaoLista.totalPages > 1 && <Pagination {...paginacaoLista} />}
              </>
            )}
          </div>
        ) : isDetailLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin text-primary" /> Carregando detalhes...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl shadow-2xs"
                onClick={voltarParaLista}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para lista
              </Button>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium">
                  <User size={14} />{' '}
                  {selectedInventario.profiles?.nome || selectedInventario.codigo_vendedor}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Calendar size={14} />{' '}
                  {format(new Date(selectedInventario.data_inventario), 'dd/MM/yyyy')}
                </span>
                <StatusInventarioBadge status={selectedInventario.status} />
              </div>
            </div>

            {selectedInventario.observacoes?.trim() && (
              <Card className="border border-border/80 border-l-4 border-l-primary rounded-2xl shadow-2xs">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Observações do Vendedor
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {selectedInventario.observacoes}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Produtos
                  </p>
                  <p className="text-2xl font-bold">{resumo.produtos}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Unidades contadas
                  </p>
                  <p className="text-2xl font-bold">{resumo.unidades}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Valor total
                  </p>
                  <p className="text-2xl font-bold">
                    {resumo.valor.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              {/* Busca à esquerda, ações à direita. O título "Itens contados" saiu: a tabela
                  logo abaixo, com colunas Produto/Quantidade/Valor, já diz o que é.
                  "Ações do Gerente" deixou de ter uma faixa só para si e passou a conviver
                  com o export — ambas em altura padrão, alinhadas entre si e com a busca. */}
              <CardHeader className="gap-3 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Quantos itens a tabela está listando. Sem isso, um recorte por
                      categoria encolheria a tabela sem nenhum número dizendo o quanto —
                      e a paginação some quando sobra uma página só. */}
                  <Badge variant="outline" className="w-fit text-xs font-normal tabular-nums">
                    {paginacaoItens.totalItems < itensRevisao.length
                      ? `${paginacaoItens.totalItems} de ${itensRevisao.length} itens`
                      : `${itensRevisao.length} ${itensRevisao.length === 1 ? 'item' : 'itens'}`}
                  </Badge>
                  <div className="flex gap-2 sm:justify-end">
                    {isGerente && (
                      <Button onClick={() => setShowManagerActions(true)} variant="outline">
                        <Settings className="h-4 w-4" />
                        Ações do Gerente
                      </Button>
                    )}
                    {/* Exporta o inventário INTEIRO, não o recorte: o arquivo se chama
                        `inventario_<vendedor>_<data>` e um filtro de tela não pode fazer
                        um arquivo com esse nome conter metade das peças. */}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleExportExcel}
                      disabled={itensRevisao.length === 0}
                      aria-label="Exportar para Excel"
                      className="shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Mesma barra de recorte do Comparativo: busca à esquerda, categorias à
                    direita da divisória. Inventário de 400 itens não se confere rolando. */}
                <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-2 lg:flex-row lg:flex-wrap lg:items-center">
                  <SearchFilter
                    value={buscaItem}
                    onChange={setBuscaItem}
                    placeholder="Buscar produto..."
                    className="max-w-none sm:w-64"
                  />

                  <FiltroCategorias
                    linhas={itensRevisao}
                    selecao={categoriasItem}
                    onSelecao={setCategoriasItem}
                  />

                  {(buscaItem !== '' || temSelecao(categoriasItem)) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBuscaItem('');
                        setCategoriasItem(SELECAO_VAZIA);
                      }}
                      className="lg:ml-auto"
                    >
                      <X className="size-4" />
                      Limpar filtros
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <CabecalhoOrdenavel
                          rotulo="Produto"
                          campo="codigo_auxiliar"
                          ordenacao={ordemItens}
                          onOrdenar={ordenarItens}
                          className="w-[45%]"
                        />
                        <CabecalhoOrdenavel
                          rotulo="Quantidade"
                          campo="quantidade_fisica"
                          ordenacao={ordemItens}
                          onOrdenar={ordenarItens}
                          alinhamento="center"
                        />
                        <CabecalhoOrdenavel
                          rotulo="Valor (R$)"
                          campo="valor_total"
                          ordenacao={ordemItens}
                          onOrdenar={ordenarItens}
                          alinhamento="center"
                        />
                        {isPendingOrRevisao && (
                          <TableHead className="text-center w-[60px]">Ações</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensPaginados.length > 0 ? (
                        itensPaginados.map((item) => {
                          const qtd = editedValues[item.codigo_auxiliar] ?? item.quantidade_fisica;
                          const total = qtd * item.valor_unitario;
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                <span className="font-mono text-sm">{item.codigo_auxiliar}</span>
                                {item.nome_produto !== item.codigo_auxiliar && (
                                  <span className="block text-xs text-muted-foreground truncate">
                                    {item.nome_produto}
                                  </span>
                                )}
                                {/* A categoria por baixo do nome: é por ela que o recorte
                                    acima filtra, e sem vê-la não dá para conferir se o
                                    filtro pegou o que devia. */}
                                {categoriaDoItem(item) && (
                                  <span className="mt-0.5 block truncate text-2xs text-muted-foreground/80">
                                    {categoriaDoItem(item)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {isPendingOrRevisao ? (
                                  <Input
                                    type="text"
                                    value={qtd}
                                    onChange={(e) =>
                                      handleEditValue(item.codigo_auxiliar, e.target.value)
                                    }
                                    className="w-20 h-8 text-center font-bold border border-input rounded-lg mx-auto shadow-2xs"
                                  />
                                ) : (
                                  <span className="font-semibold">{qtd}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {item.valor_unitario === 0 ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span className="font-semibold">
                                    {total.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </span>
                                )}
                              </TableCell>
                              {isPendingOrRevisao && (
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() =>
                                      setDeletingItem({
                                        codigo_auxiliar: item.codigo_auxiliar,
                                        itemId: item.id,
                                      })
                                    }
                                  >
                                    <Trash2 size={16} />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={isPendingOrRevisao ? 4 : 3}
                            className="h-24 text-center"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Minus className="h-8 w-8 text-muted-foreground/50" />
                              <p className="text-sm text-muted-foreground">
                                Nenhum item encontrado
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {paginacaoItens.totalPages > 1 && (
                  <div className="pt-4">
                    <Pagination {...paginacaoItens} />
                  </div>
                )}
              </CardContent>
            </Card>

            {hasEdits && isPendingOrRevisao && (
              <div className="flex justify-end">
                <Button onClick={handleSaveEdits} disabled={saving}>
                  <Save size={16} className="mr-2" />
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            )}

            <Dialog open={showManagerActions} onOpenChange={setShowManagerActions}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ações do Gerente</DialogTitle>
                  <DialogDescription>
                    Aprovar registra o inventário como oficial. É possível reverter depois.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowManagerActions(false);
                      setShowDeleteDialog(true);
                    }}
                    disabled={isDeleting || saving}
                    size="sm"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                  {isPendingOrRevisao && (
                    <>
                      <Button
                        onClick={() => {
                          setShowManagerActions(false);
                          handleManagerAction('revisao');
                        }}
                        disabled={saving}
                        variant="outline"
                        size="sm"
                      >
                        <XCircle size={16} className="mr-2" />
                        Não Aprovar
                      </Button>
                      <Button
                        onClick={() => {
                          setShowManagerActions(false);
                          handleManagerAction('aprovar');
                        }}
                        disabled={saving}
                        size="sm"
                        variant="success"
                      >
                        <CheckCircle size={16} className="mr-2" />
                        {saving ? 'Processando...' : 'Aprovar'}
                      </Button>
                    </>
                  )}
                  {selectedInventario?.status === 'aprovado' && (
                    <Button
                      onClick={() => {
                        setShowManagerActions(false);
                        setShowReverterDialog(true);
                      }}
                      disabled={reverting}
                      size="sm"
                      variant="outline"
                    >
                      <ArrowLeft size={16} className="mr-2" />
                      Reverter Aprovação
                    </Button>
                  )}
                </div>
                {isPendingOrRevisao && (
                  <div className="space-y-2">
                    <label htmlFor="observacoes-gerente" className="text-sm font-medium">
                      Observações para o Vendedor (obrigatório para não aprovação)
                    </label>
                    <Textarea
                      id="observacoes-gerente"
                      name="observacoes"
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Se não aprovar, explique o motivo aqui..."
                    />
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <AlertDialog open={showReverterDialog} onOpenChange={setShowReverterDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reverter aprovação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O inventário volta para <strong>pendente</strong> e o vendedor poderá
                    editá-lo novamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={reverting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReverterAprovacao} disabled={reverting}>
                    {reverting ? 'Revertendo...' : 'Reverter'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Juntar inventários */}
      <Dialog open={showJuntarDialog} onOpenChange={setShowJuntarDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Juntar inventários</DialogTitle>
            <DialogDescription>
              As quantidades dos {selecionados.length} inventários serão somadas no inventário
              de destino. Os demais serão <strong>excluídos</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Inventário de destino</p>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o destino" />
              </SelectTrigger>
              <SelectContent>
                {[...invSelecionados]
                  .sort((a, b) => a.data_inventario.localeCompare(b.data_inventario))
                  .map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {format(new Date(inv.data_inventario), 'dd/MM/yyyy HH:mm')} ·{' '}
                      {new Set(inv.itens_inventario.map((i) => i.codigo_auxiliar)).size} produtos ·{' '}
                      {inv.status}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O destino mantém sua data e seu status. Os inventários absorvidos ficam
              registrados nas observações do gerente.
            </p>
          </div>

          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
            Serão excluídos{' '}
            <strong>{Math.max(selecionados.length - (destinoId ? 1 : 0), 0)} inventário(s)</strong>
            . Esta ação não pode ser desfeita.
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowJuntarDialog(false)}
              disabled={juntando}
            >
              Cancelar
            </Button>
            <Button onClick={handleJuntar} disabled={juntando || !destinoId}>
              {juntando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Juntando...
                </>
              ) : (
                <>
                  <Merge className="mr-2 h-4 w-4" /> Juntar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o item{' '}
              <span className="font-bold">{deletingItem?.codigo_auxiliar}</span> do inventário?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive hover:bg-destructive/90"
            >
              {saving ? 'Removendo...' : 'Remover Item'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o inventário e
              todos os seus itens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInventario}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir Inventário'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
