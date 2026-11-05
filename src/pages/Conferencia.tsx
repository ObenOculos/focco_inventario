import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  bordaStatusInventario,
  IconeStatusInventario,
  StatusInventarioBadge,
} from '@/components/StatusInventarioBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudOff,
  Download,
  GitCompare,
  Loader2,
  Merge,
  MessageSquareText,
  Minus,
  Package,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  TriangleAlert,
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
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  useAncoraQuery,
  useInventariosAnterioresQuery,
  type InventarioAnterior,
} from '@/hooks/useReconciliacaoInventarioQuery';
import {
  useFichasProdutosQuery,
  type FichaProduto as FichaCatalogo,
} from '@/hooks/useCompararInventariosQuery';
import {
  empresasDaEscolha,
  useErpMovimentosQuery,
  useErpRegrasQuery,
  useErpVendedoresQuery,
  TENTATIVAS_ERP,
  type MovimentoErp,
} from '@/hooks/useConsultaErpQuery';
import { selecaoPadrao } from '@/components/RegrasConciliacaoDialog';
import { ehAcessorio, normalizarCodigoErp } from '@/lib/codigoErp';
import {
  calcularEsperado,
  janelaDeReconciliacao,
  janelaValida,
  movimentoDoProduto,
} from '@/lib/reconciliacao';
import { useVendedoresSimpleQuery } from '@/hooks/useAnaliseInventarioQuery';
import { FiltroCategorias } from '@/components/FiltroCategorias';
import { Segmentado } from '@/components/comparativo/Segmentado';
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

/**
 * Referências estáveis para o `?? []` das consultas ao ERP: um literal a cada render
 * faria todo `useMemo` que depende delas recalcular sempre.
 */
const SEM_MOVIMENTO: MovimentoErp[] = [];
const SEM_ANTERIORES: InventarioAnterior[] = [];
const SEM_FICHAS = new Map<string, FichaCatalogo>();

type ItemRevisao = {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
  /**
   * O que este item tinha antes de o vendedor recontá-lo. `null` = não foi recontado.
   *
   * É o que torna a SEGUNDA conferência barata: em vez de reler o inventário inteiro
   * para descobrir o que mudou desde a reprovação, o gerente vê a mudança na própria
   * linha. Antes desta coluna a contagem original era destruída no reenvio — o
   * `salvar_inventario` substitui os itens — e não sobrava evidência em lugar nenhum.
   */
  quantidade_anterior: number | null;
  valor_unitario: number;
  marca: string | null;
  tipo: string | null;
  subtipo: string | null;
  grupo: string | null;
  /**
   * Produto que a contagem NÃO tem, mas que a contagem anterior tinha ou que teve
   * movimento no período. Some da tela se for ignorado — e é justamente a peça que
   * sumiu da mala.
   *
   * Tem campo de quantidade como qualquer linha: o gerente que sabe que a peça está na
   * mala digita (ou aplica o esperado) e o "Salvar Alterações" INSERE o item. O `id`
   * aqui não existe em `itens_inventario` — é o que distingue inserir de atualizar.
   */
  nao_contado: boolean;
};

/**
 * Recorte por situação contra o Esperado. Só existe com a movimentação em tela.
 *
 * Classifica pela quantidade SALVA, nunca pelo rascunho: com o rascunho, aplicar o
 * esperado numa linha do filtro "Divergentes" a faria sumir no meio da revisão — o
 * mesmo salto que a ordenação evita pelo mesmo motivo.
 */
type SituacaoItem = 'todos' | 'divergentes' | 'nao_contados' | 'conferem';

/** Uma linha que a correção em massa levaria ao esperado. */
type CorrecaoEmMassa = { codigo: string; de: number; para: number; valor: number };

/** As três colunas de movimentação, quando o gerente mandou buscar no ERP. */
type Movimentacao = {
  /** Quantidade GRAVADA do mesmo produto na contagem anterior. */
  ancora: number;
  remessa: number;
  venda: number;
  esperado: number;
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

/**
 * O DIA de um `data_inventario`, no fuso de quem está lendo.
 *
 * Existe para haver uma regra só. `iso.slice(0, 10)` devolve o dia em UTC, e a tela
 * exibe tudo com `format` (local): numa contagem gravada às 21h de Brasília os dois
 * discordam em um dia, e esse dia é o limite da janela de movimentos — a diferença sai
 * como uma nota a mais ou a menos, sem nada indicando o porquê.
 */
function diaLocal(iso: string) {
  return format(new Date(iso), 'yyyy-MM-dd');
}

/** `2026-06-11` → `11/06/2026`, sem passar por Date (que interpreta como UTC). */
function dataBrIso(iso: string) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * O período de UM movimento: rótulo e as duas datas na mesma linha.
 *
 * Os dois campos ficam colados ao rótulo de propósito — o período pertence ao
 * movimento que ele delimita, e separá-los em blocos distintos é o que fazia o
 * usuário perder de vista qual data valia para qual lado.
 */
function LinhaPeriodo({
  id,
  rotulo,
  de,
  ate,
  onDe,
  onAte,
}: {
  id: string;
  rotulo: string;
  de: string;
  ate: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-sm font-medium">{rotulo}</span>
      <Input
        id={`${id}-de`}
        type="date"
        aria-label={`${rotulo} — data inicial`}
        value={de}
        onChange={(e) => onDe(e.target.value)}
        className="w-auto"
      />
      <span className="text-muted-foreground">→</span>
      <Input
        id={`${id}-ate`}
        type="date"
        aria-label={`${rotulo} — data final`}
        value={ate}
        onChange={(e) => onAte(e.target.value)}
        className="w-auto"
      />
    </div>
  );
}

/**
 * A célula de Esperado — o número, a divergência e o atalho para aplicá-la.
 *
 * A DIVERGÊNCIA NÃO É UMA QUARTA COLUNA. Ela é a leitura do Esperado contra a
 * contagem que está três células à esquerda; separá-las numa coluna própria obriga o
 * olho a percorrer a linha inteira para juntar o que é uma informação só — e a tabela
 * já tem sete colunas.
 *
 * Cor: `warning` para falta e `info` para sobra, nunca `destructive`. Falta não é erro
 * de sistema, é dado de negócio que pede atenção — e é o mesmo par que o Comparativo
 * usa para os mesmos dois estados.
 */
function CelulaEsperado({
  esperado,
  ancora,
  divergencia,
  podeAplicar,
  onAplicar,
}: {
  esperado: number;
  ancora: number;
  divergencia: number;
  podeAplicar: boolean;
  onAplicar: () => void;
}) {
  const cor =
    divergencia === 0
      ? 'text-muted-foreground'
      : divergencia < 0
        ? 'text-warning-strong'
        : 'text-info-strong';

  const rotulo =
    divergencia === 0
      ? 'confere com a movimentação'
      : divergencia < 0
        ? `faltam ${Math.abs(divergencia)}`
        : `sobram ${divergencia}`;

  const numero = (
    <>
      <span className={divergencia === 0 ? 'font-semibold' : `font-bold ${cor}`}>{esperado}</span>
      <span className="mt-0.5 block text-2xs text-muted-foreground">
        {divergencia === 0 ? `anterior ${ancora}` : rotulo}
      </span>
    </>
  );

  if (!podeAplicar) return numero;

  return (
    <button
      type="button"
      onClick={onAplicar}
      title={`Usar ${esperado} como quantidade contada`}
      className="-mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {numero}
    </button>
  );
}

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
  /**
   * Abre em Pendentes / Revisão: a tela existe para conferir o que ainda falta aprovar.
   * Em "Todos os status" o histórico de aprovados vai crescendo e empurra os pendentes
   * para as últimas páginas — o gerente entrava e tinha de filtrar antes de trabalhar.
   */
  const [statusFilter, setStatusFilter] = useState<string>('pendentes');

  // Revisão dos itens
  const [buscaItem, setBuscaItem] = useState('');
  const [categoriasItem, setCategoriasItem] = useState<SelecaoCategorias>(SELECAO_VAZIA);
  const [situacaoItem, setSituacaoItem] = useState<SituacaoItem>('todos');
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

  /**
   * A consulta ao Ciclone só sai no clique — mesmo padrão do Comparativo e da
   * Consulta ao ERP. Cada ida atravessa VPN e leva segundos; quem decide quando
   * pagar isso é o gerente, e a conferência sem movimentação continua funcionando
   * exatamente como antes.
   */
  const [movimentacaoPedida, setMovimentacaoPedida] = useState(false);

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
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
      setSituacaoItem('todos');
      setEditedValues({});
      // Trocar de inventário desliga a movimentação: as colunas do inventário
      // anterior ao lado da contagem nova seriam números certos na linha errada. O
      // ajuste de período cai junto — uma janela escolhida a dedo para um par de
      // contagens não descreve nada no par seguinte.
      setMovimentacaoPedida(false);
      setIdsAncoraEscolhidos(null);
      setEscolhendoAncora(false);
      setDataMalaVazia('');

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
          quantidade_anterior:
            it.quantidade_anterior === null ? null : Number(it.quantidade_anterior),
          valor_unitario: ficha.valor,
          marca: ficha.marca,
          tipo: ficha.tipo,
          subtipo: ficha.subtipo,
          grupo: ficha.grupo,
          nao_contado: false,
        };
      })
      .sort((a, b) => a.codigo_auxiliar.localeCompare(b.codigo_auxiliar));
  }, [selectedInventario, fichasMap]);

  // ─── Movimentação do período (Remessa · Venda · Esperado) ──

  const dataInventario = selectedInventario ? diaLocal(selectedInventario.data_inventario) : null;

  /**
   * O corte vai pelo TIMESTAMP inteiro, não pelo dia.
   *
   * `data_inventario` tem hora, e comparar com um `'2026-07-15'` faria o Postgres
   * completar com meia-noite — a recontagem feita de manhã, no mesmo dia da que está
   * sendo conferida à tarde, não apareceria na lista. É justamente a contagem que mais
   * merece ser oferecida como âncora.
   */
  const consultaAnteriores = useInventariosAnterioresQuery(
    selectedInventario?.codigo_vendedor ?? null,
    selectedInventario?.data_inventario ?? null,
    movimentacaoPedida
  );
  const anteriores = consultaAnteriores.data ?? SEM_ANTERIORES;

  /**
   * A lista de contagens anteriores é PAGINADA, 4 por vez em duas colunas.
   *
   * Representante antigo tem dezenas de contagens, e a lista aberta inteira esticava o
   * painel "Base do esperado" — e com ele o "Período dos movimentos" ao lado, que tem a
   * mesma altura — até empurrar a tabela para fora da tela.
   */
  const { paginatedData: anterioresPaginados, ...paginacaoAnteriores } = usePagination({
    data: anteriores,
    itemsPerPage: 4,
  });

  /**
   * Quais contagens anteriores compõem a âncora.
   *
   * `null` = o gerente não escolheu, e vale o padrão: a contagem imediatamente
   * anterior. Um array — inclusive vazio — é escolha explícita e vence o padrão, senão
   * desmarcar tudo voltaria sozinho para a sugestão e a caixa pareceria quebrada.
   */
  const [idsAncoraEscolhidos, setIdsAncoraEscolhidos] = useState<string[] | null>(null);
  const [escolhendoAncora, setEscolhendoAncora] = useState(false);

  const idsAncora = useMemo(
    () => idsAncoraEscolhidos ?? (anteriores[0] ? [anteriores[0].id] : []),
    [idsAncoraEscolhidos, anteriores]
  );

  const alternarAncora = (id: string) =>
    setIdsAncoraEscolhidos((atual) => {
      const base = atual ?? idsAncora;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  const consultaAncora = useAncoraQuery(anteriores, idsAncora, movimentacaoPedida);
  const ancora = consultaAncora.data ?? null;

  /**
   * SEM CONTAGEM ANTERIOR a âncora vira uma DATA: o dia em que a mala estava vazia.
   *
   * É o mesmo modo "primeiro inventário" do Comparativo, e não é um cálculo à parte —
   * é a fórmula com a âncora zerada: `esperado = 0 + remessa − venda`. Vale para o
   * representante novo, cuja mala nasceu do zero, e é o único jeito de ler a
   * movimentação de quem ainda não tem histórico no app.
   *
   * A data é PREMISSA DIGITADA, não dado do sistema — por isso nasce vazia e a tela
   * espera. Preenchê-la com um palpite (a data do inventário, o começo do mês) daria a
   * um chute a mesma cara de um número apurado.
   */
  const [dataMalaVazia, setDataMalaVazia] = useState('');
  const usandoMalaVazia = idsAncora.length === 0;

  /**
   * O DIA de onde a janela parte, venha ele de contagem ou de premissa.
   *
   * Um nome só para os dois porque é o mesmo papel — daqui para baixo nada precisa
   * saber em que modo está. `dataMalaVazia` já é `aaaa-mm-dd` e NÃO passa por
   * `diaLocal`: `new Date('2026-06-11')` é meia-noite UTC, que em Brasília cai no dia
   * 10 e roubaria um dia da janela.
   */
  const diaAncora = usandoMalaVazia
    ? dataMalaVazia || null
    : ancora
      ? diaLocal(ancora.dataMaisRecente)
      : null;

  /**
   * Escolheu a mala vazia num representante que JÁ TEM contagem anterior.
   *
   * É o uso errado mais provável e o mais caro: a mala não nasceu vazia naquele dia,
   * então tudo que entrou antes aparece como SOBRA — com a mesma cara de uma sobra
   * legítima. Custa nada detectar, a lista de anteriores já está carregada.
   */
  const malaVaziaComHistorico = usandoMalaVazia && anteriores.length > 0;

  /**
   * Contagens do mesmo vendedor na data da âncora que ficaram DE FORA.
   *
   * Fragmentar é modo de trabalho válido aqui, e reconciliar um fragmento contra os
   * movimentos do período inteiro produz divergência falsa com cara de legítima. Antes
   * isso era só um aviso; agora o aviso aponta para o conserto, porque as irmãs estão
   * na lista logo acima esperando serem marcadas.
   */
  const irmasDeFora = useMemo(() => {
    if (!ancora || usandoMalaVazia) return [];
    const dia = diaLocal(ancora.dataMaisRecente);
    return anteriores.filter(
      (a) => !idsAncora.includes(a.id) && diaLocal(a.data_inventario) === dia
    );
  }, [ancora, usandoMalaVazia, anteriores, idsAncora]);

  /**
   * A janela SUGERIDA vai do dia SEGUINTE à âncora até a data desta contagem. A regra e
   * o porquê do `+1` moram em `janelaDeReconciliacao` — é o que impede a mesma nota de
   * entrar nesta janela e na anterior.
   */
  const janelaSugerida = useMemo(
    () => (diaAncora && dataInventario ? janelaDeReconciliacao(diaAncora, dataInventario) : null),
    [diaAncora, dataInventario]
  );

  /**
   * UMA JANELA POR MOVIMENTO, e não uma só para os dois.
   *
   * É o mesmo desenho do Comparativo, e aqui ele é a razão de a coisa existir: quem
   * estende o fim da janela para alcançar a nota de remessa emitida depois do envio
   * físico estaria, com uma janela única, descontando também as VENDAS daqueles dias —
   * vendas que aconteceram depois da contagem e que não têm nada a ver com ela. O
   * conserto de um lado viraria erro do outro, e no mesmo número.
   *
   * Quando as duas janelas coincidem — que é o padrão — as chaves de cache ficam
   * idênticas e o react-query faz uma requisição só.
   *
   * Os quatro campos ficam SEMPRE À VISTA. Estiveram atrás de um "Ajustar datas", e
   * escondê-los custava as duas coisas que eles existem para dar: ninguém descobria
   * que os períodos podiam ser diferentes, e o período realmente usado na consulta não
   * estava escrito em lugar nenhum enquanto o toggle estava desligado.
   */
  const [remessaDe, setRemessaDe] = useState('');
  const [remessaAte, setRemessaAte] = useState('');
  const [vendaDe, setVendaDe] = useState('');
  const [vendaAte, setVendaAte] = useState('');

  // Trocar de inventário (ou carregar a âncora) repõe o período sugerido. Manter as
  // datas antigas num par novo produziria uma janela que não corresponde a nada.
  useEffect(() => {
    setRemessaDe(janelaSugerida?.de ?? '');
    setRemessaAte(janelaSugerida?.ate ?? '');
    setVendaDe(janelaSugerida?.de ?? '');
    setVendaAte(janelaSugerida?.ate ?? '');
  }, [janelaSugerida]);

  const janelaRemessa = { de: remessaDe, ate: remessaAte };
  const janelaVenda = { de: vendaDe, ate: vendaAte };

  /**
   * As DUAS janelas precisam ser válidas para a busca sair. Deixar passar a metade boa
   * renderia um esperado calculado com um dos lados zerado — e nada na tela diria isso.
   */
  const janelasValidas = janelaValida(janelaRemessa) && janelaValida(janelaVenda);

  const periodoNoPadrao =
    !!janelaSugerida &&
    janelaRemessa.de === janelaSugerida.de &&
    janelaRemessa.ate === janelaSugerida.ate &&
    janelaVenda.de === janelaSugerida.de &&
    janelaVenda.ate === janelaSugerida.ate;

  const voltarAoPadrao = () => {
    setRemessaDe(janelaSugerida?.de ?? '');
    setRemessaAte(janelaSugerida?.ate ?? '');
    setVendaDe(janelaSugerida?.de ?? '');
    setVendaAte(janelaSugerida?.ate ?? '');
  };

  const codigoVendedorErp = selectedInventario ? Number(selectedInventario.codigo_vendedor) : NaN;

  // A lista do Ciclone confere que o código do vendedor do app existe mesmo lá. Se
  // divergir, o sintoma seria movimento zero em tudo — indistinguível de "não houve
  // movimento", que é o resultado mais caro de ler errado nesta tela.
  const { data: vendedoresErp = [] } = useErpVendedoresQuery(movimentacaoPedida);
  const codigoExisteNoErp =
    vendedoresErp.length === 0 || vendedoresErp.some((v) => v.codigo === codigoVendedorErp);

  const consultaRegras = useErpRegrasQuery(movimentacaoPedida);

  /**
   * As regras viajam SEMPRE, e são as do gateway sem retoque — os mesmos padrões que o
   * Comparativo usa por `selecaoPadrao`. Esta tela não oferece o modal de regras de
   * propósito: conferência é leitura de uma contagem, não afinação de parâmetro. Quem
   * precisar mexer nas regras faz a análise no Comparativo, onde elas existem.
   */
  const regrasParaEnvio = useMemo(() => {
    if (!consultaRegras.data) return null;
    const p = selecaoPadrao(consultaRegras.data);
    return {
      empresas: empresasDaEscolha('ambas'),
      // 'emissao' é o mesmo padrão do Comparativo: a emissão do PEDIDO costuma
      // ficar mais perto do envio físico do que a data de movimento da nota, que
      // é justamente a que atrasa.
      base_data: 'emissao' as const,
      tipos_venda: p.tiposVenda,
      tipos_remessa: p.tiposRemessa,
      operacoes: p.operacoes,
    };
  }, [consultaRegras.data]);

  const montarParams = (j: { de: string; ate: string }) =>
    movimentacaoPedida && janelaValida(j) && Number.isFinite(codigoVendedorErp) && regrasParaEnvio
      ? { vendedor: codigoVendedorErp, de: j.de, ate: j.ate, ...regrasParaEnvio }
      : null;

  // Memoizados para terem identidade estável: sem isso o efeito da primeira busca
  // rodaria a cada render, e a chave de cache do react-query mudaria junto.
  const paramsRemessa = useMemo(
    () => montarParams(janelaRemessa),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movimentacaoPedida, janelaRemessa.de, janelaRemessa.ate, codigoVendedorErp, regrasParaEnvio]
  );
  const paramsVenda = useMemo(
    () => montarParams(janelaVenda),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movimentacaoPedida, janelaVenda.de, janelaVenda.ate, codigoVendedorErp, regrasParaEnvio]
  );

  /**
   * A consulta ao ERP só sai quando o gerente manda — e mexer numa data NÃO manda.
   *
   * Sem este passo, digitar uma data renderia uma ida ao Ciclone por caractere: o
   * `<input type="date">` dispara `onChange` em cada pedaço do dia/mês/ano, e cada ida
   * atravessa VPN. É o mesmo botão de atualizar que o Comparativo tem.
   */
  const [paramsAplicados, setParamsAplicados] = useState<{
    remessa: typeof paramsRemessa;
    venda: typeof paramsVenda;
  } | null>(null);

  const buscarMovimentos = () => setParamsAplicados({ remessa: paramsRemessa, venda: paramsVenda });

  // Fechar o painel limpa na hora, sem passar pelo botão.
  useEffect(() => {
    if (!movimentacaoPedida) setParamsAplicados(null);
  }, [movimentacaoPedida]);

  /**
   * A PRIMEIRA busca é automática: o clique em "Buscar movimentação" já foi o pedido,
   * e exigir um segundo clique num botão que só aparece depois dele seria pedir duas
   * vezes a mesma coisa. Da segunda em diante, mexer nas datas exige o "Atualizar".
   */
  useEffect(() => {
    if (!movimentacaoPedida || (!paramsRemessa && !paramsVenda)) return;
    setParamsAplicados((atual) => atual ?? { remessa: paramsRemessa, venda: paramsVenda });
  }, [movimentacaoPedida, paramsRemessa, paramsVenda]);

  const consultaRemessas = useErpMovimentosQuery(paramsAplicados?.remessa ?? null);
  const consultaVendas = useErpMovimentosQuery(paramsAplicados?.venda ?? null);

  /** Datas mexidas depois da última busca — o que está na tabela é de antes. */
  const buscaDesatualizada =
    paramsAplicados !== null &&
    JSON.stringify({ r: paramsRemessa, v: paramsVenda }) !==
      JSON.stringify({ r: paramsAplicados.remessa, v: paramsAplicados.venda });

  /** Cada mapa vem da SUA janela — é por isso que não dá para ler os dois do mesmo. */
  const remessaPorChave = useMemo(
    () => new Map((consultaRemessas.data ?? SEM_MOVIMENTO).map((m) => [m.key, m] as const)),
    [consultaRemessas.data]
  );
  const vendaPorChave = useMemo(
    () => new Map((consultaVendas.data ?? SEM_MOVIMENTO).map((m) => [m.key, m] as const)),
    [consultaVendas.data]
  );

  /** A movimentação está de fato em cima da tela — e não só pedida. */
  const temMovimentacao =
    movimentacaoPedida && !!diaAncora && consultaRemessas.isSuccess && consultaVendas.isSuccess;

  const carregandoMovimentacao =
    movimentacaoPedida &&
    (consultaAnteriores.isLoading ||
      consultaAncora.isLoading ||
      consultaRegras.isLoading ||
      consultaRemessas.isLoading ||
      consultaVendas.isLoading);

  const erroMovimentacao = consultaRegras.error ?? consultaRemessas.error ?? consultaVendas.error;
  /**
   * Tentativa em curso. Sem isso, uma falha transitória vira até dois minutos de
   * spinner mudo e o gerente conclui que travou — justamente quando o transporte
   * estava se recuperando sozinho.
   */
  const tentativaAtual = Math.max(consultaRemessas.failureCount, consultaVendas.failureCount) + 1;

  /**
   * `remessa`, `venda` e `esperado` de um produto contado.
   *
   * Acessório não entra no inventário físico e o gateway já o exclui dos movimentos:
   * calcular esperado para ele produziria uma divergência do tamanho da contagem
   * inteira. Devolve `null`, e a linha mostra "—" nas três colunas.
   */
  const movimentacaoDe = useCallback(
    (codigoAuxiliar: string): Movimentacao | null => {
      if (!temMovimentacao) return null;
      if (ehAcessorio(codigoAuxiliar)) return null;
      const chave = normalizarCodigoErp(codigoAuxiliar);
      const { remessa, venda } = movimentoDoProduto(chave, remessaPorChave, vendaPorChave);
      // Sem contagem anterior a âncora é zero — a mesma fórmula, sem caso à parte.
      const base = ancora?.quantidadePorChave.get(chave) ?? 0;
      return { ancora: base, remessa, venda, esperado: calcularEsperado(base, remessa, venda) };
    },
    [temMovimentacao, ancora, remessaPorChave, vendaPorChave]
  );

  /**
   * Produto que a contagem não tem, mas que a contagem anterior tinha ou que
   * movimentou no período.
   *
   * Esperado > 0 aqui significa peça que deveria estar na mala e ninguém contou — o
   * caso mais caro da conferência, e o que some da tela se a tabela listar apenas o
   * que foi contado. Entram como linha de leitura, com preço e categoria do catálogo
   * que a consulta de fichas já traz.
   */
  const chavesNaoContadas = useMemo(() => {
    if (!temMovimentacao) return [];
    const contadas = new Set(itensRevisao.map((i) => normalizarCodigoErp(i.codigo_auxiliar)));
    return (
      [
        ...new Set([
          ...(ancora?.quantidadePorChave.keys() ?? []),
          ...remessaPorChave.keys(),
          ...vendaPorChave.keys(),
        ]),
      ]
        .filter((k) => !contadas.has(k) && !ehAcessorio(k))
        /**
         * Fora a linha que não diz NADA nesta configuração: sem saldo na contagem
         * anterior e sem movimento efetivo. Ela aparece quando as duas janelas são
         * diferentes — a consulta da remessa devolve as vendas daquele período junto, e
         * uma chave que só existe por causa delas entraria aqui com esperado zero. É o
         * mesmo descarte que o Comparativo faz nas linhas só-movimento.
         */
        .filter((k) => {
          const { remessa, venda } = movimentoDoProduto(k, remessaPorChave, vendaPorChave);
          return (ancora?.quantidadePorChave.get(k) ?? 0) !== 0 || remessa !== 0 || venda !== 0;
        })
        .sort()
    );
  }, [temMovimentacao, ancora, remessaPorChave, vendaPorChave, itensRevisao]);

  /**
   * Preço e categoria dessas linhas vêm de uma segunda ida ao catálogo: `fichasMap` só
   * conhece o que foi CONTADO. Sem isso, a peça que sumiu da mala apareceria valendo
   * R$ 0,00 e agrupada em "Sem categoria" — invisível justamente no recorte em que o
   * gerente iria procurá-la. O mapa é indexado pela chave NORMALIZADA, a mesma do
   * gateway.
   */
  // Códigos CRUS: é por eles que `produtos` é consultado. `chavesNaoContadas` já vem
  // ordenado, então a chave de cache não muda só porque os mapas mudaram de ordem.
  const codigosNaoContados = useMemo(
    () =>
      chavesNaoContadas.map(
        (k) =>
          ancora?.codigoPorChave.get(k) ??
          remessaPorChave.get(k)?.codigo_auxiliar ??
          vendaPorChave.get(k)?.codigo_auxiliar ??
          k
      ),
    [chavesNaoContadas, ancora, remessaPorChave, vendaPorChave]
  );
  const consultaFichasNaoContadas = useFichasProdutosQuery(codigosNaoContados);
  const fichasNaoContadas = consultaFichasNaoContadas.data ?? SEM_FICHAS;

  const naoContados: ItemRevisao[] = useMemo(() => {
    if (!temMovimentacao) return [];

    return chavesNaoContadas
      .map((k) => {
        const mov = remessaPorChave.get(k) ?? vendaPorChave.get(k);
        const codigo = ancora?.codigoPorChave.get(k) ?? mov?.codigo_auxiliar ?? k;
        const ficha = fichasNaoContadas.get(k) ?? FICHA_VAZIA;
        return {
          // Não existe em `itens_inventario`: o id é só a chave do React, e o prefixo
          // impede colisão com um id real caso um dia os dois convivam.
          id: `nao-contado:${k}`,
          codigo_auxiliar: codigo,
          nome_produto: mov?.nome || codigo,
          quantidade_fisica: 0,
          quantidade_anterior: null,
          valor_unitario: ficha.valor,
          marca: ficha.marca,
          tipo: ficha.tipo,
          subtipo: ficha.subtipo,
          grupo: ficha.grupo,
          nao_contado: true,
        };
      })
      .sort((a, b) => a.codigo_auxiliar.localeCompare(b.codigo_auxiliar, 'pt-BR'));
  }, [
    temMovimentacao,
    ancora,
    chavesNaoContadas,
    remessaPorChave,
    vendaPorChave,
    fichasNaoContadas,
  ]);

  /**
   * A tabela lista os contados mais, quando há movimentação, os não contados. Fora
   * daqui `itensRevisao` continua sendo a contagem e nada além dela: é dele que saem
   * o resumo, o Excel e a aprovação, e nenhum desses pode variar porque o gerente
   * clicou em "Buscar movimentação".
   */
  const itensDaTabela = useMemo(
    () => (naoContados.length > 0 ? [...itensRevisao, ...naoContados] : itensRevisao),
    [itensRevisao, naoContados]
  );

  /**
   * Quantas linhas divergem do esperado, sobre a contagem INTEIRA.
   *
   * Ignora busca e recorte de propósito: é o número que responde "vale a pena olhar
   * esta conferência?", e ele não pode encolher porque havia um filtro de tela ligado.
   * Lê `editedValues` para cair para zero à medida que o gerente corrige.
   */
  const resumoDivergencia = useMemo(() => {
    if (!temMovimentacao) return null;
    let divergentes = 0;
    for (const i of itensRevisao) {
      const mov = movimentacaoDe(i.codigo_auxiliar);
      if (!mov) continue;
      const qtd = editedValues[i.codigo_auxiliar] ?? i.quantidade_fisica;
      if (qtd !== mov.esperado) divergentes += 1;
    }
    return { divergentes, naoContados: naoContados.length };
  }, [temMovimentacao, itensRevisao, movimentacaoDe, editedValues, naoContados.length]);

  /**
   * O recorte por categoria vale para a TABELA, e não para os cards de resumo.
   *
   * É o oposto do que o Comparativo faz, de propósito. Lá os cards são análise — "quanto
   * está faltando na OBEN" é uma pergunta legítima. Aqui eles são a identidade do
   * inventário que está prestes a ser APROVADO: um "Valor total" que encolhe porque
   * havia um filtro de tela ligado é exatamente o número que não pode variar conforme a
   * visualização.
   */
  /** Situação de uma linha pela quantidade SALVA — ver `SituacaoItem`. */
  const situacaoDe = useCallback(
    (i: ItemRevisao): Exclude<SituacaoItem, 'todos'> | null => {
      if (i.nao_contado) return 'nao_contados';
      const mov = movimentacaoDe(i.codigo_auxiliar);
      // Acessório (sem movimentação) não diverge nem confere: só aparece em "Todos".
      if (!mov) return null;
      return i.quantidade_fisica === mov.esperado ? 'conferem' : 'divergentes';
    },
    [movimentacaoDe]
  );

  /**
   * A situação só filtra com a movimentação em tela. Sem ela o estado continua guardado
   * mas não age — senão fechar o painel deixaria a tabela vazia num filtro invisível.
   */
  const situacaoAtiva: SituacaoItem = temMovimentacao ? situacaoItem : 'todos';

  /** Linhas no recorte de CATEGORIA — a base das contagens do seletor de situação. */
  const itensNaCategoria = useMemo(
    () =>
      temSelecao(categoriasItem)
        ? itensDaTabela.filter((i) => casaComSelecao(i, categoriasItem))
        : itensDaTabela,
    [itensDaTabela, categoriasItem]
  );

  /**
   * Os números do seletor respeitam o recorte de categoria: quem filtrou OBEN quer saber
   * quantos divergentes há na OBEN, e um "Divergentes (449)" que abre 12 linhas
   * pareceria filtro quebrado.
   */
  const contagemSituacao = useMemo(() => {
    const c = { todos: itensNaCategoria.length, divergentes: 0, nao_contados: 0, conferem: 0 };
    if (!temMovimentacao) return c;
    for (const i of itensNaCategoria) {
      const s = situacaoDe(i);
      if (s) c[s] += 1;
    }
    return c;
  }, [itensNaCategoria, temMovimentacao, situacaoDe]);

  const itensNoRecorte = useMemo(
    () =>
      situacaoAtiva === 'todos'
        ? itensNaCategoria
        : itensNaCategoria.filter((i) => situacaoDe(i) === situacaoAtiva),
    [itensNaCategoria, situacaoAtiva, situacaoDe]
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
      (acc, i) => acc + (editedValues[i.codigo_auxiliar] ?? i.quantidade_fisica) * i.valor_unitario,
      0
    );
    return { produtos: itensRevisao.length, unidades, valor };
  }, [itensRevisao, editedValues]);

  const totalEdicoes = Object.keys(editedValues).length;
  const hasEdits = totalEdicoes > 0;
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

  /**
   * Joga o Esperado no campo de quantidade — sem gravar.
   *
   * Vira edição pendente como qualquer digitação: continua passando pelo "Salvar
   * Alterações", e some se o gerente trocar de inventário. A versão em massa existe
   * (`correcoesEmMassa`), mas passa por confirmação com o impacto à vista: ajustar tudo
   * apaga, junto com o descompasso de nota, as contagens que divergem por perda real.
   */
  const aplicarEsperado = (codigoAuxiliar: string, esperado: number) => {
    // Esperado negativo é sinal de janela ou regra errada, não de estoque negativo:
    // gravar isso deixaria a mala devendo peça. O piso em zero é o mesmo que o campo
    // de quantidade já aceita.
    setEditedValues((prev) => ({ ...prev, [codigoAuxiliar]: Math.max(0, esperado) }));
  };

  /**
   * O que as duas correções em massa fariam no recorte VISÍVEL (busca + categoria +
   * situação), deixando de fora o que o gerente já editou à mão.
   *
   * Restrito ao recorte para dar para corrigir por marca, conferindo antes. O alvo é o
   * esperado com piso em zero, pelo mesmo motivo de `aplicarEsperado`. Não contado com
   * alvo zero fica de fora: adicionar a peça com zero não muda nada.
   */
  const correcoesEmMassa = useMemo(() => {
    const naoContados: CorrecaoEmMassa[] = [];
    const divergentes: CorrecaoEmMassa[] = [];
    if (!temMovimentacao) return { nao_contados: naoContados, divergentes };
    for (const i of paginacaoItens.filteredData) {
      if (editedValues[i.codigo_auxiliar] !== undefined) continue;
      const mov = movimentacaoDe(i.codigo_auxiliar);
      if (!mov) continue;
      const para = Math.max(0, mov.esperado);
      const c = {
        codigo: i.codigo_auxiliar,
        de: i.quantidade_fisica,
        para,
        valor: i.valor_unitario,
      };
      if (i.nao_contado) {
        if (para > 0) naoContados.push(c);
      } else if (i.quantidade_fisica !== para) {
        divergentes.push(c);
      }
    }
    return { nao_contados: naoContados, divergentes };
  }, [temMovimentacao, paginacaoItens.filteredData, editedValues, movimentacaoDe]);

  /** Qual correção em massa está aguardando confirmação. */
  const [correcaoPendente, setCorrecaoPendente] = useState<keyof typeof correcoesEmMassa | null>(
    null
  );

  /** Impacto da correção pendente — é o que o diálogo mostra antes de aplicar. */
  const impactoCorrecao = useMemo(() => {
    if (!correcaoPendente) return null;
    const lista = correcoesEmMassa[correcaoPendente];
    let entram = 0;
    let saem = 0;
    let valor = 0;
    for (const c of lista) {
      const d = c.para - c.de;
      if (d > 0) entram += d;
      else saem -= d;
      valor += d * c.valor;
    }
    return { produtos: lista.length, entram, saem, valor };
  }, [correcaoPendente, correcoesEmMassa]);

  const aplicarCorrecaoEmMassa = () => {
    if (!correcaoPendente) return;
    const lista = correcoesEmMassa[correcaoPendente];
    setEditedValues((prev) => {
      const novo = { ...prev };
      for (const c of lista) novo[c.codigo] = c.para;
      return novo;
    });
    toast.info(
      `${lista.length} produto${lista.length === 1 ? '' : 's'} ${
        correcaoPendente === 'nao_contados' ? 'preenchido' : 'ajustado'
      }${lista.length === 1 ? '' : 's'} pelo esperado.`,
      { description: 'Nada foi gravado ainda — revise e clique em "Salvar Alterações".' }
    );
    setCorrecaoPendente(null);
  };

  /** Descarta o rascunho de UMA linha — é como se desfaz um não contado preenchido. */
  const descartarEdicao = (codigoAuxiliar: string) =>
    setEditedValues((prev) => {
      const { [codigoAuxiliar]: _descartado, ...resto } = prev;
      return resto;
    });

  const handleSaveEdits = async () => {
    if (!selectedInventario || !hasEdits) return;

    // Edição de item que já existe vira UPDATE; de não contado vira INSERT. Não contado
    // deixado em zero é descartado: inserir a linha com zero não acrescenta nada.
    const existentes = new Map(
      selectedInventario.itens_inventario.map((i) => [i.codigo_auxiliar, i])
    );
    const naoContadosPorCodigo = new Map(naoContados.map((i) => [i.codigo_auxiliar, i]));
    const edicoes = Object.entries(editedValues);
    const paraAtualizar = edicoes.filter(([codigo]) => existentes.has(codigo));
    const paraInserir = edicoes
      .filter(([codigo, qtd]) => !existentes.has(codigo) && qtd > 0)
      .map(([codigo, qtd]) => ({ item: naoContadosPorCodigo.get(codigo), qtd }))
      .filter((x): x is { item: ItemRevisao; qtd: number } => !!x.item);

    setSaving(true);
    try {
      const updates = paraAtualizar.map(([codigo, quantidade]) =>
        supabase
          .from('itens_inventario')
          .update({ quantidade_fisica: quantidade })
          .eq('id', existentes.get(codigo)!.id)
      );
      const results = await Promise.all(updates);
      results.forEach((res) => {
        if (res.error) throw res.error;
      });

      let inseridos: InventarioComItens['itens_inventario'] = [];
      if (paraInserir.length > 0) {
        const { data, error } = await supabase
          .from('itens_inventario')
          .insert(
            paraInserir.map(({ item, qtd }) => ({
              inventario_id: selectedInventario.id,
              codigo_auxiliar: item.codigo_auxiliar,
              nome_produto: item.nome_produto,
              quantidade_fisica: qtd,
            }))
          )
          .select();
        if (error) throw error;
        inseridos = data ?? [];

        // A ficha do catálogo já veio na consulta dos não contados; sem copiá-la para
        // `fichasMap` o item recém-adicionado apareceria valendo R$ 0,00.
        setFichasMap((prev) => {
          const novo = { ...prev };
          for (const { item } of paraInserir) {
            novo[item.codigo_auxiliar] = {
              valor: item.valor_unitario,
              marca: item.marca,
              tipo: item.tipo,
              subtipo: item.subtipo,
              grupo: item.grupo,
            };
          }
          return novo;
        });
      }

      setSelectedInventario((prev) =>
        prev
          ? {
              ...prev,
              itens_inventario: [
                ...prev.itens_inventario.map((i) =>
                  editedValues[i.codigo_auxiliar] !== undefined
                    ? { ...i, quantidade_fisica: editedValues[i.codigo_auxiliar] }
                    : i
                ),
                ...inseridos,
              ],
            }
          : null
      );
      setEditedValues({});
      // O inventário em cache ainda tem a lista antiga: reabrir sem isso esconderia o
      // que acabou de ser adicionado.
      if (inseridos.length > 0)
        queryClient.invalidateQueries({ queryKey: ['inventariosPendentes'] });
      toast.success(
        inseridos.length > 0
          ? `Alterações salvas — ${inseridos.length} produto${inseridos.length === 1 ? '' : 's'} adicionado${inseridos.length === 1 ? '' : 's'} ao inventário.`
          : 'Alterações salvas com sucesso!'
      );
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
              itens_inventario: prev.itens_inventario.filter((i) => i.id !== deletingItem.itemId),
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
      const { error } = await supabase.from('inventarios').delete().eq('id', selectedInventario.id);
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
        'Contagem Anterior': item.quantidade_anterior ?? '',
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
                              {
                                new Set(inv.itens_inventario.map((i) => i.codigo_auxiliar)).size
                              }{' '}
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
          /* A forma da tela já é conhecida — cabeçalho e tabela —, então skeleton. */
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <TableSkeleton columns={4} rows={8} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* CABEÇALHO DO INVENTÁRIO: quem, quando, em que estado, quanto — e as ações
                que valem para o inventário INTEIRO. Exportar, movimentação e Ações do
                Gerente moravam no cartão da tabela, ao lado do contador de itens, e
                pareciam agir sobre o recorte. */}
            <Card>
              <CardContent className="space-y-5 pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={voltarParaLista}
                      aria-label="Voltar para a lista"
                      className="shrink-0"
                    >
                      <ArrowLeft className="size-4" />
                    </Button>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold tracking-tight">
                          {selectedInventario.profiles?.nome || selectedInventario.codigo_vendedor}
                        </h2>
                        <StatusInventarioBadge status={selectedInventario.status} />
                      </div>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="font-mono text-xs">
                          {selectedInventario.codigo_vendedor}
                        </span>
                        <span className="flex items-center gap-1.5 tabular-nums">
                          <Calendar className="size-3.5" />
                          {format(new Date(selectedInventario.data_inventario), 'dd/MM/yyyy')}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
                    {/* A movimentação é OPT-IN: cada consulta atravessa VPN até o
                        Ciclone e leva segundos. Sem clicar, a conferência é exatamente
                        a de antes — e não faz chamada nenhuma. */}
                    {isGerente && !movimentacaoPedida && (
                      <Button
                        variant="outline"
                        onClick={() => setMovimentacaoPedida(true)}
                        className="flex-1 sm:flex-none"
                      >
                        <GitCompare className="size-4" />
                        Buscar movimentação
                      </Button>
                    )}
                    {isGerente && movimentacaoPedida && (
                      <Button
                        variant="ghost"
                        onClick={() => setMovimentacaoPedida(false)}
                        className="flex-1 sm:flex-none"
                      >
                        <X className="size-4" />
                        Ocultar movimentação
                      </Button>
                    )}
                    {isGerente && (
                      <Button
                        variant="outline"
                        onClick={() => setShowManagerActions(true)}
                        className="flex-1 sm:flex-none"
                      >
                        <Settings className="size-4" />
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
                      <Download className="size-4" />
                    </Button>
                  </div>
                </div>

                {selectedInventario.observacoes?.trim() && (
                  <Alert variant="info">
                    <MessageSquareText className="size-4" />
                    <AlertTitle>Observações do vendedor</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap break-words">
                      {selectedInventario.observacoes}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Totais do inventário INTEIRO — ver o comentário de `resumo`: não seguem
                    o recorte da tabela. O valor ocupa a linha toda no celular porque
                    "R$ 12.345,67" em text-2xl não cabe em meia tela de 360px. */}
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-muted/40 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Produtos
                    </dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums">{resumo.produtos}</dd>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Unidades contadas
                    </dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums">{resumo.unidades}</dd>
                  </div>
                  <div className="col-span-2 rounded-xl bg-muted/40 p-4 sm:col-span-1">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Valor total
                    </dt>
                    <dd className="mt-1 text-2xl font-bold tabular-nums">
                      {resumo.valor.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </dd>
                  </div>
                </dl>

                {/* MOVIMENTAÇÃO mora no cabeçalho do inventário, e não entre o filtro e a
                    tabela: base e período CONFIGURAM a comparação — são premissa do
                    Esperado, não recorte da tabela. Intercalados com o filtro, empurravam a
                    tabela para baixo a cada aviso e misturavam "o que comparar" com "o que
                    mostrar". Avisos primeiro, os dois painéis lado a lado, o resultado por
                    último. */}
                {movimentacaoPedida && (
                  <section className="space-y-3 border-t border-border/80 pt-5">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <GitCompare className="size-4 text-muted-foreground" />
                      Movimentação no Ciclone
                    </h3>
                    {/* A mala vazia num representante COM histórico é o uso errado mais
                        provável e o mais caro: tudo que entrou antes da data aparece como
                        sobra, com a mesma cara de uma sobra legítima. */}
                    {malaVaziaComHistorico && !!dataMalaVazia && (
                      <Alert variant="warning">
                        <TriangleAlert className="size-4" />
                        <AlertDescription>
                          Este vendedor tem {anteriores.length} contagem
                          {anteriores.length === 1 ? '' : 's'} anterior
                          {anteriores.length === 1 ? '' : 'es'} a esta data, e nenhuma está marcada.
                          Tudo que entrou na mala antes de {dataBrIso(dataMalaVazia)} vai aparecer
                          como sobra.
                        </AlertDescription>
                      </Alert>
                    )}

                    {!codigoExisteNoErp && (
                      <Alert variant="warning">
                        <TriangleAlert className="size-4" />
                        <AlertDescription>
                          O código {selectedInventario?.codigo_vendedor} não aparece no cadastro de
                          vendedores do Ciclone. Movimento zero em tudo aqui seria cadastro
                          divergente, não ausência de movimento.
                        </AlertDescription>
                      </Alert>
                    )}

                    {erroMovimentacao && (
                      <Alert variant="destructive">
                        <CloudOff className="size-4" />
                        <AlertDescription>
                          {erroMovimentacao.message ||
                            'O Ciclone não respondeu. Tente novamente em instantes.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* `only-child`: enquanto as contagens anteriores carregam só o Período
                        aparece, e meia largura vazia ao lado pareceria um painel faltando. */}
                    {/* Sem `items-start`: o grid estica as células, e os dois painéis lado a
                        lado ficam sempre da mesma altura, mesmo com a lista de contagens
                        aberta num e o aviso de datas alteradas no outro. */}
                    <div className="grid gap-3 xl:grid-cols-2 xl:[&>:only-child]:col-span-2">
                      {/* A ÂNCORA É ESCOLHIDA, e pode ser mais de uma contagem.
                        Fragmentar a contagem é modo de trabalho válido aqui: o vendedor
                        manda a mala em dois ou três inventários. Com um fragmento só de
                        âncora, o esperado compara um pedaço da mala com os movimentos do
                        período inteiro e acusa divergência em tudo que estava no outro. */}
                      {!consultaAnteriores.isLoading && (
                        <div className="space-y-2 rounded-xl border border-border/80 bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Base do esperado
                            </p>
                            <div className="flex items-center gap-1">
                              {idsAncoraEscolhidos !== null && anteriores.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setIdsAncoraEscolhidos(null)}
                                >
                                  <RotateCcw className="size-3.5" />
                                  Voltar ao padrão
                                </Button>
                              )}
                              {anteriores.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEscolhendoAncora((v) => !v)}
                                >
                                  <ClipboardList className="size-3.5" />
                                  {escolhendoAncora ? 'Fechar' : 'Escolher contagens'}
                                </Button>
                              )}
                            </div>
                          </div>

                          {escolhendoAncora && anteriores.length > 0 ? (
                            <div className="space-y-2">
                              {/* HIERARQUIA: o dia é o que o gerente procura, então é o único
                                  dado em destaque. Hora e tamanho são letra miúda de apoio, e
                                  o status sai do badge para a BORDA + ícone — um badge por
                                  cartão competia com a data pela atenção. O cartão inteiro é
                                  o alternador (sem checkbox), e a seleção fica com o FUNDO e
                                  a cor da data, para não disputar a borda com o status. */}
                              <ul className="grid gap-1.5 sm:grid-cols-2">
                                {anterioresPaginados.map((a) => {
                                  const marcada = idsAncora.includes(a.id);
                                  const data = new Date(a.data_inventario);
                                  return (
                                    <li key={a.id}>
                                      <button
                                        type="button"
                                        aria-pressed={marcada}
                                        onClick={() => alternarAncora(a.id)}
                                        className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${bordaStatusInventario(
                                          a.status
                                        )} ${marcada ? 'bg-primary/10' : 'bg-card hover:bg-muted/40'}`}
                                      >
                                        <span className="min-w-0 flex-1">
                                          <span className="flex items-baseline gap-1.5">
                                            <span
                                              className={`text-sm font-semibold tabular-nums ${
                                                marcada ? 'text-primary' : ''
                                              }`}
                                            >
                                              {format(data, 'dd/MM/yyyy')}
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                              {format(data, 'HH:mm')}
                                            </span>
                                          </span>
                                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                            <Package className="size-3 shrink-0" />
                                            {a.itens} {a.itens === 1 ? 'produto' : 'produtos'}
                                          </span>
                                        </span>
                                        <IconeStatusInventario
                                          status={a.status}
                                          className="mt-0.5 shrink-0"
                                        />
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>

                              {paginacaoAnteriores.totalPages > 1 && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {paginacaoAnteriores.startIndex + 1}–
                                    {Math.min(
                                      paginacaoAnteriores.endIndex,
                                      paginacaoAnteriores.totalItems
                                    )}{' '}
                                    de {paginacaoAnteriores.totalItems} contagens
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="iconSm"
                                      aria-label="Contagens mais recentes"
                                      disabled={paginacaoAnteriores.currentPage === 1}
                                      onClick={() =>
                                        paginacaoAnteriores.onPageChange(
                                          paginacaoAnteriores.currentPage - 1
                                        )
                                      }
                                    >
                                      <ChevronLeft className="size-4" />
                                    </Button>
                                    <span className="min-w-12 text-center text-xs font-medium tabular-nums">
                                      {paginacaoAnteriores.currentPage} /{' '}
                                      {paginacaoAnteriores.totalPages}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="iconSm"
                                      aria-label="Contagens mais antigas"
                                      disabled={
                                        paginacaoAnteriores.currentPage ===
                                        paginacaoAnteriores.totalPages
                                      }
                                      onClick={() =>
                                        paginacaoAnteriores.onPageChange(
                                          paginacaoAnteriores.currentPage + 1
                                        )
                                      }
                                    >
                                      <ChevronRight className="size-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            !usandoMalaVazia && (
                              <p className="text-xs text-muted-foreground tabular-nums">
                                Contagem de{' '}
                                {anteriores
                                  .filter((a) => idsAncora.includes(a.id))
                                  .map((a) => format(new Date(a.data_inventario), 'dd/MM/yyyy'))
                                  .join(' + ')}
                                {idsAncora.length > 1 && ' — somadas'}
                              </p>
                            )
                          )}

                          {/* SEM CONTAGEM ANTERIOR, a base é uma data digitada.
                            O esperado vira `0 + remessa − venda` — a mesma fórmula com o
                            primeiro termo zerado, e é assim que a movimentação continua
                            legível para o representante que ainda não tem histórico. */}
                          {usandoMalaVazia && (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <label
                                  htmlFor="conf-mala-vazia"
                                  className="w-20 shrink-0 text-sm font-medium"
                                >
                                  Mala vazia em
                                </label>
                                <Input
                                  id="conf-mala-vazia"
                                  type="date"
                                  value={dataMalaVazia}
                                  max={dataInventario ?? undefined}
                                  onChange={(e) => setDataMalaVazia(e.target.value)}
                                  className="w-auto"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {anteriores.length === 0
                                  ? 'Este vendedor não tem contagem anterior a esta data. Informe o dia em que a mala estava vazia e o esperado vira só remessa − venda.'
                                  : 'Nenhuma contagem marcada — o esperado parte do zero nesta data.'}
                              </p>
                            </div>
                          )}

                          {/* O aviso aponta para o conserto: as irmãs estão na lista logo
                            acima, esperando serem marcadas. Antes ele só constatava o
                            problema e deixava o gerente sem o que fazer a respeito. */}
                          {irmasDeFora.length > 0 && (
                            <p className="flex items-start gap-1.5 text-xs font-medium text-warning-strong">
                              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                              <span>
                                Há {irmasDeFora.length} outra
                                {irmasDeFora.length === 1 ? '' : 's'} contagem
                                {irmasDeFora.length === 1 ? '' : 's'} na mesma data e fora da
                                âncora. Se a contagem foi fragmentada, marque{' '}
                                {irmasDeFora.length === 1 ? 'a' : 'as'} também.
                              </span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* O PERÍODO É EDITÁVEL, e é o que resolve a nota emitida depois
                        do envio físico: alcançá-la exige estender o fim da janela de
                        REMESSA — e só dela, senão as vendas daqueles dias entram junto
                        e o conserto de um lado vira erro do outro. */}
                      {/* O painel vale para os DOIS modos de base. Ele exigia `ancora`, que
                        é nulo quando a base é uma data de mala vazia — e aí os campos de
                        período simplesmente não existiam, justamente no caso em que o
                        esperado depende só deles. */}
                      {janelaSugerida && (
                        <div className="space-y-2 rounded-xl border border-border/80 bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Período dos movimentos
                            </p>
                            {!periodoNoPadrao && (
                              <Button variant="ghost" size="sm" onClick={voltarAoPadrao}>
                                <RotateCcw className="size-3.5" />
                                Voltar ao padrão
                              </Button>
                            )}
                          </div>

                          {/* DUAS LINHAS, uma por movimento, sempre visíveis. É o ponto do
                            desenho: para alcançar a nota de remessa emitida depois do
                            envio físico é preciso esticar o fim da janela de REMESSA — e
                            só dela, senão as vendas daqueles dias entram junto e o
                            conserto de um lado vira erro do outro, no mesmo número. */}
                          <div className="space-y-2">
                            <LinhaPeriodo
                              id="conf-remessa"
                              rotulo="Remessa"
                              de={remessaDe}
                              ate={remessaAte}
                              onDe={setRemessaDe}
                              onAte={setRemessaAte}
                            />
                            <LinhaPeriodo
                              id="conf-venda"
                              rotulo="Venda"
                              de={vendaDe}
                              ate={vendaAte}
                              onDe={setVendaDe}
                              onAte={setVendaAte}
                            />
                          </div>

                          <p className="text-xs text-muted-foreground tabular-nums">
                            Padrão: {dataBrIso(janelaSugerida.de)} a {dataBrIso(janelaSugerida.ate)}{' '}
                            — do dia seguinte à base, para a nota daquele dia não contar duas vezes.
                          </p>

                          {(buscaDesatualizada || !janelasValidas) && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={buscarMovimentos}
                                disabled={carregandoMovimentacao || !janelasValidas}
                              >
                                <GitCompare className="size-3.5" />
                                Atualizar
                              </Button>
                              {!janelasValidas ? (
                                <span className="text-xs font-medium text-warning-strong">
                                  A data inicial precisa ser anterior à final.
                                </span>
                              ) : (
                                !carregandoMovimentacao && (
                                  <span className="flex items-center gap-1.5 text-xs font-medium text-warning-strong">
                                    <TriangleAlert className="size-3.5 shrink-0" />
                                    Datas alteradas — clique em atualizar para consultar o ERP.
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {carregandoMovimentacao ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Consultando o Ciclone…
                        {tentativaAtual > 1 && ` tentativa ${tentativaAtual} de ${TENTATIVAS_ERP}`}
                      </p>
                    ) : (
                      temMovimentacao && (
                        /* A janela e a âncora ficam VISÍVEIS: são a premissa das três
                           colunas, e sem elas o Esperado é um número sem origem. */
                        <div className="space-y-1.5">
                          {resumoDivergencia && (
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant={
                                  resumoDivergencia.divergentes === 0 ? 'success' : 'warning'
                                }
                                className="tabular-nums"
                              >
                                {resumoDivergencia.divergentes === 0
                                  ? 'Nenhum produto divergente'
                                  : `${resumoDivergencia.divergentes} produto${
                                      resumoDivergencia.divergentes === 1 ? '' : 's'
                                    } divergente${resumoDivergencia.divergentes === 1 ? '' : 's'}`}
                              </Badge>
                              {resumoDivergencia.naoContados > 0 && (
                                <Badge variant="info" className="tabular-nums">
                                  {resumoDivergencia.naoContados} não contado
                                  {resumoDivergencia.naoContados === 1 ? '' : 's'}
                                </Badge>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {/* A BASE precisa estar escrita, e dizendo o que é. No modo
                                mala vazia ela não é uma contagem e sim uma premissa
                                digitada — chamá-la de "contagem de 01/06" faria a linha
                                afirmar que houve contagem naquele dia. */}
                            Esperado = {usandoMalaVazia ? 'mala vazia em' : 'contagem de'}{' '}
                            <span className="font-medium text-foreground">
                              {dataBrIso(diaAncora!)}
                              {idsAncora.length > 1 && ` (${idsAncora.length} contagens)`}
                            </span>{' '}
                            + remessas de{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {dataBrIso(janelaRemessa.de)} a {dataBrIso(janelaRemessa.ate)}
                            </span>{' '}
                            − vendas de{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {dataBrIso(janelaVenda.de)} a {dataBrIso(janelaVenda.ate)}
                            </span>{' '}
                            · por emissão do pedido
                          </p>
                        </div>
                      )
                    )}
                  </section>
                )}
              </CardContent>
            </Card>

            <Card>
              {/* O cartão da tabela só RECORTA: busca, categorias e situação. Tudo que vale
                  para o inventário inteiro está no cabeçalho acima. */}
              <CardHeader className="gap-3 space-y-0 pb-4">
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
                    linhas={itensDaTabela}
                    selecao={categoriasItem}
                    onSelecao={setCategoriasItem}
                  />

                  {/* Situação contra o Esperado — só existe com a movimentação em tela.
                      Os números acompanham o recorte de categoria ao lado. */}
                  {temMovimentacao && (
                    <div className="overflow-x-auto">
                      <Segmentado<SituacaoItem>
                        nome="Situação do produto"
                        valor={situacaoItem}
                        onValor={setSituacaoItem}
                        opcoes={[
                          { valor: 'todos', rotulo: `Todos (${contagemSituacao.todos})` },
                          {
                            valor: 'divergentes',
                            rotulo: `Divergentes (${contagemSituacao.divergentes})`,
                          },
                          {
                            valor: 'nao_contados',
                            rotulo: `Não contados (${contagemSituacao.nao_contados})`,
                          },
                          { valor: 'conferem', rotulo: `Conferem (${contagemSituacao.conferem})` },
                        ]}
                      />
                    </div>
                  )}

                  {/* Quantos itens a tabela está listando. Sem isso, um recorte por
                      categoria encolheria a tabela sem nenhum número dizendo o quanto —
                      e a paginação some quando sobra uma página só. Fica no fim da barra
                      porque é a RESPOSTA do recorte. */}
                  <div className="flex items-center justify-between gap-2 px-1 lg:ml-auto">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {paginacaoItens.totalItems < itensDaTabela.length
                        ? `${paginacaoItens.totalItems} de ${itensDaTabela.length} itens`
                        : `${itensDaTabela.length} ${itensDaTabela.length === 1 ? 'item' : 'itens'}`}
                    </span>
                    {(buscaItem !== '' ||
                      temSelecao(categoriasItem) ||
                      situacaoAtiva !== 'todos') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBuscaItem('');
                          setCategoriasItem(SELECAO_VAZIA);
                          setSituacaoItem('todos');
                        }}
                      >
                        <X className="size-4" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>

                {/* Correção em massa. Fica fora da barra de recorte porque é ação, não
                    filtro — e age só sobre o que o recorte está mostrando. */}
                {isPendingOrRevisao &&
                  temMovimentacao &&
                  (correcoesEmMassa.nao_contados.length > 0 ||
                    correcoesEmMassa.divergentes.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-info/30 bg-info-subtle px-3 py-2">
                      <p className="flex-1 text-sm text-info-strong">
                        Corrigir pelo esperado
                        {situacaoAtiva !== 'todos' || buscaItem !== '' || temSelecao(categoriasItem)
                          ? ' — só o que o filtro está mostrando'
                          : ''}
                      </p>
                      {correcoesEmMassa.nao_contados.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCorrecaoPendente('nao_contados')}
                        >
                          <Package className="size-3.5" />
                          Adicionar não contados ({correcoesEmMassa.nao_contados.length})
                        </Button>
                      )}
                      {correcoesEmMassa.divergentes.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCorrecaoPendente('divergentes')}
                        >
                          <CheckCircle className="size-3.5" />
                          Ajustar divergentes ({correcoesEmMassa.divergentes.length})
                        </Button>
                      )}
                    </div>
                  )}
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
                        {/* As três colunas de movimentação ficam entre a contagem e o
                            valor: é ali que se lê "contei 4, a papelada diz 6". Não são
                            ordenáveis — a ordem da tabela sai de `itensOrdenados`, que
                            trabalha sobre a contagem, e estas vêm de outro lugar. */}
                        {temMovimentacao && (
                          <>
                            <TableHead className="text-center font-semibold">Remessa</TableHead>
                            <TableHead className="text-center font-semibold">Venda</TableHead>
                            <TableHead className="text-center font-semibold">Esperado</TableHead>
                          </>
                        )}
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
                          const mov = movimentacaoDe(item.codigo_auxiliar);
                          // Contado − esperado, na mesma direção do Comparativo:
                          // negativo é falta, positivo é sobra.
                          const divergencia = mov ? qtd - mov.esperado : 0;
                          return (
                            <TableRow
                              key={item.id}
                              className={item.nao_contado ? 'bg-muted/30' : undefined}
                            >
                              <TableCell className="font-medium">
                                <span className="font-mono text-sm">{item.codigo_auxiliar}</span>
                                {item.nao_contado && (
                                  <Badge variant="warning" className="ml-2 align-middle">
                                    não contado
                                  </Badge>
                                )}
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
                                {/* Não contado também tem campo: preenchido e salvo, vira
                                    item novo do inventário (ver `handleSaveEdits`). */}
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
                                  <span
                                    className={
                                      item.nao_contado
                                        ? 'font-semibold text-muted-foreground tabular-nums'
                                        : 'font-semibold tabular-nums'
                                    }
                                  >
                                    {qtd}
                                  </span>
                                )}
                                {/* Só quando houve recontagem E o número mudou: repetir
                                    "antes 4 → 4" em cada linha esconderia, no meio do
                                    ruído, as poucas que de fato mudaram. */}
                                {item.quantidade_anterior !== null &&
                                  item.quantidade_anterior !== item.quantidade_fisica && (
                                    <span className="mt-1 block text-2xs text-muted-foreground tabular-nums">
                                      recontado · antes {item.quantidade_anterior}
                                    </span>
                                  )}
                                {item.nao_contado && qtd > 0 && (
                                  <span className="mt-1 block text-2xs font-medium text-info-strong">
                                    será adicionado ao salvar
                                  </span>
                                )}
                              </TableCell>
                              {temMovimentacao && (
                                <>
                                  <TableCell className="text-center tabular-nums">
                                    {!mov ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : mov.remessa === 0 ? (
                                      <span className="text-muted-foreground">0</span>
                                    ) : (
                                      <span className="font-semibold">{mov.remessa}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center tabular-nums">
                                    {!mov ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : mov.venda === 0 ? (
                                      <span className="text-muted-foreground">0</span>
                                    ) : (
                                      <span className="font-semibold">{mov.venda}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center tabular-nums">
                                    {!mov ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : (
                                      <CelulaEsperado
                                        esperado={mov.esperado}
                                        ancora={mov.ancora}
                                        divergencia={divergencia}
                                        podeAplicar={!!isPendingOrRevisao && divergencia !== 0}
                                        onAplicar={() =>
                                          aplicarEsperado(item.codigo_auxiliar, mov.esperado)
                                        }
                                      />
                                    )}
                                  </TableCell>
                                </>
                              )}
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
                                  {item.nao_contado ? (
                                    editedValues[item.codigo_auxiliar] !== undefined && (
                                      <Button
                                        variant="ghost"
                                        size="iconSm"
                                        aria-label={`Desfazer o preenchimento de ${item.codigo_auxiliar}`}
                                        onClick={() => descartarEdicao(item.codigo_auxiliar)}
                                      >
                                        <RotateCcw size={16} />
                                      </Button>
                                    )
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      aria-label={`Remover ${item.codigo_auxiliar} do inventário`}
                                      onClick={() =>
                                        setDeletingItem({
                                          codigo_auxiliar: item.codigo_auxiliar,
                                          itemId: item.id,
                                        })
                                      }
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={3 + (temMovimentacao ? 3 : 0) + (isPendingOrRevisao ? 1 : 0)}
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Com correção em massa, desfazer linha a linha deixou de ser opção. */}
                <span className="text-sm text-muted-foreground tabular-nums">
                  {totalEdicoes}{' '}
                  {totalEdicoes === 1 ? 'alteração pendente' : 'alterações pendentes'}
                </span>
                <Button variant="ghost" onClick={() => setEditedValues({})} disabled={saving}>
                  <X size={16} className="mr-2" />
                  Descartar
                </Button>
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
                    O inventário volta para <strong>pendente</strong> e o vendedor poderá editá-lo
                    novamente.
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
              As quantidades dos {selecionados.length} inventários serão somadas no inventário de
              destino. Os demais serão <strong>excluídos</strong>.
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
              O destino mantém sua data e seu status. Os inventários absorvidos ficam registrados
              nas observações do gerente.
            </p>
          </div>

          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs">
            Serão excluídos{' '}
            <strong>{Math.max(selecionados.length - (destinoId ? 1 : 0), 0)} inventário(s)</strong>.
            Esta ação não pode ser desfeita.
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

      <AlertDialog
        open={correcaoPendente !== null}
        onOpenChange={(aberto) => !aberto && setCorrecaoPendente(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {correcaoPendente === 'nao_contados'
                ? 'Adicionar os não contados?'
                : 'Ajustar os divergentes ao esperado?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {impactoCorrecao && (
                  <p className="tabular-nums">
                    <span className="font-semibold text-foreground">
                      {impactoCorrecao.produtos} produto{impactoCorrecao.produtos === 1 ? '' : 's'}
                    </span>
                    {impactoCorrecao.entram > 0 && <> · +{impactoCorrecao.entram} un.</>}
                    {impactoCorrecao.saem > 0 && <> · −{impactoCorrecao.saem} un.</>}
                    {impactoCorrecao.valor !== 0 && (
                      <>
                        {' · '}
                        {impactoCorrecao.valor > 0 ? '+' : '−'}
                        {Math.abs(impactoCorrecao.valor).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </>
                    )}
                  </p>
                )}
                <p>
                  {correcaoPendente === 'nao_contados'
                    ? 'Cada produto entra no inventário com a quantidade esperada.'
                    : 'A quantidade contada de cada produto é trocada pela esperada. Isso apaga também as faltas e sobras reais — perda, peça trocada, erro de nota.'}{' '}
                  Nada é gravado até você clicar em "Salvar Alterações", e dá para descartar.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarCorrecaoEmMassa}>
              {correcaoPendente === 'nao_contados' ? 'Adicionar' : 'Ajustar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o item{' '}
              <span className="font-bold">{deletingItem?.codigo_auxiliar}</span> do inventário? Esta
              ação não pode ser desfeita.
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
              Essa ação não pode ser desfeita. Isso excluirá permanentemente o inventário e todos os
              seus itens.
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
