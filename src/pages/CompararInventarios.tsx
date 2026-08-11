import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchFilter } from '@/components/SearchFilter';
import { Pagination } from '@/components/Pagination';
import { Checkbox } from '@/components/ui/checkbox';
import { usePagination } from '@/hooks/usePagination';
import { useFiltroAno } from '@/hooks/useFiltroAno';
import {
  empresasDaEscolha,
  useErpMovimentosQuery,
  useErpRegrasQuery,
  useErpVendedoresQuery,
  TENTATIVAS_ERP,
  type EscolhaEmpresa,
  type MovimentoErp,
} from '@/hooks/useConsultaErpQuery';
import {
  RegrasConciliacaoDialog,
  ehPadrao,
  selecaoPadrao,
  type SelecaoRegras,
} from '@/components/RegrasConciliacaoDialog';
import { ehAcessorio, normalizarCodigoErp } from '@/lib/codigoErp';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CloudOff,
  Download,
  GitCompare,
  Minus,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { exportarComparativoExcel } from '@/lib/exportarComparativoExcel';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  useComparacaoQuery,
  useFichasProdutosQuery,
  useInventariosOpcoesQuery,
  type FichaProduto,
  type InventarioOpcao,
  type LinhaExibida,
} from '@/hooks/useCompararInventariosQuery';
import { PainelGestor, type SubmodoGestor } from '@/components/comparativo/PainelGestor';

const SEM_MOVIMENTO: MovimentoErp[] = [];
/** Referência estável, pelo mesmo motivo de `SEM_MOVIMENTO`. */
const SEM_FICHAS = new Map<string, FichaProduto>();

/** Etapa da seleção. String porque é o formato de valor de aba do Radix Tabs. */
type Etapa = '1' | '2' | '3';

/** `2026-07-14` → `14/07/2026`, sem passar por Date (que interpreta como UTC). */
function dataBr(iso: string | null) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Nome de vendedor virando pedaço de nome de arquivo.
 *
 * Acento e espaço saem porque o arquivo é baixado, anexado em e-mail e aberto em
 * outra máquina — `José da Silva` vira `Jose-da-Silva`. A caixa é preservada: o nome
 * é para ser lido, e é assim que a ferramenta local já nomeia os inventários
 * (`inventario_Michel_16-03-2026.xlsx`).
 */
function nomeParaArquivo(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Uma linha de movimento: o toggle e o período que ele usa, juntos.
 *
 * Os dois ficam na mesma linha de propósito — o período pertence ao movimento que
 * modifica, e separá-los em blocos distintos foi o que deixou o layout confuso.
 */
function LinhaMovimento({
  id,
  rotulo,
  ligado,
  onToggle,
  desabilitado,
  ajustando,
  de,
  ate,
  onDe,
  onAte,
}: {
  id: string;
  rotulo: string;
  ligado: boolean;
  onToggle: (v: boolean) => void;
  desabilitado: boolean;
  ajustando: boolean;
  de: string;
  ate: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex w-48 cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={ligado}
          onCheckedChange={(v) => onToggle(v === true)}
          disabled={desabilitado}
        />
        {rotulo}
      </label>

      {ligado &&
        (ajustando ? (
          <div className="flex items-center gap-2">
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
        ) : (
          <span className="text-xs tabular-nums text-muted-foreground">
            {dataBr(de)} <span className="px-0.5">→</span> {dataBr(ate)}
          </span>
        ))}
    </div>
  );
}

/**
 * Comparar Inventários — consulta independente.
 *
 * Não participa do fluxo de aprovação nem grava nada: o usuário escolhe dois inventários e
 * vê a diferença entre as contagens. Diferença = B − A.
 *
 * Layout em dois blocos: **seleção** (uma linha só no desktop) e **resultado** (um cartão,
 * com o resumo em faixa e a tabela). A versão anterior empilhava até seis blocos na vertical
 * — filtro de vendedor sozinho numa linha `max-w-md`, A e B numa segunda, quatro cartões de
 * KPI soltos, um cartão só para a nota de "sem valor", o aviso de contagens disjuntas e a
 * tabela — desperdiçando a largura e empurrando o dado para fora da primeira dobra.
 *
 * Os dois parágrafos explicativos permanentes saíram: "a diferença é B − A" foi para o
 * cabeçalho da coluna, onde é lida no momento em que importa, e o alerta sobre comparar
 * vendedores diferentes virou aviso **condicional** — silencioso quando A e B são do mesmo
 * vendedor, que é o caso normal.
 */
export default function CompararInventarios() {
  // String porque é o que o Tabs do Radix usa como valor de aba. Começa na 1, no
  // início do fluxo: o escopo é o que filtra as listas de A e B da etapa 2.
  const [etapaAtiva, setEtapaAtiva] = useState<Etapa>('1');
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos');
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');

  /**
   * Primeiro inventário do representante: não existe contagem anterior para ser o A.
   *
   * O lado A vira uma **data** — o dia em que a mala estava vazia — e o esperado passa a
   * ser `0 + remessa − venda`. É a mesma fórmula da tela com o primeiro termo zerado, e é
   * por isso que este modo não tem cálculo próprio: só troca de onde vem o `q1` e a data
   * de início da janela.
   *
   * Vale para representante NOVO, cuja mala nasceu do zero. Para quem já rodava antes, a
   * janela não teria início honesto e todo o estoque anterior apareceria como sobra — daí
   * o aviso de `temInventarioAnterior`.
   */
  const [primeiroInventario, setPrimeiroInventario] = useState(false);
  const [dataMalaVazia, setDataMalaVazia] = useState('');
  const [busca, setBusca] = useState('');
  // Abre em "Todos os produtos": o recorte é escolha de quem lê, e os cards agora dão
  // o atalho para cada um deles.
  const [filtroLinha, setFiltroLinha] = useState<string>('todos');

  /**
   * A tabela mostrava a derivação inteira (Qtd A, remessa, venda, esperado, Qtd B)
   * com o mesmo peso da resposta — dez colunas para quem só quer saber quanto
   * faltou e quanto isso custa. O modo resumido é o padrão porque é o que a
   * maioria das leituras precisa; o detalhado existe para auditar o cálculo.
   *
   * `gestor` não é uma terceira densidade de tabela: troca a pergunta. Resumido e
   * detalhado respondem "qual produto divergiu"; gestor responde "qual parte do
   * estoque divergiu e quanto custa", agregando por categoria antes de mostrar
   * qualquer produto. Por isso ele substitui a tabela em vez de reconfigurá-la.
   */
  const [modoTabela, setModoTabela] = useState<'resumido' | 'detalhado' | 'gestor'>(
    'resumido'
  );
  /**
   * O gestor entra pelo Sintético: é a visão que responde "onde olhar" sem exigir
   * um clique por camada. O Analítico continua a um toque, para comparar categorias
   * irmãs lado a lado.
   */
  const [submodoGestor, setSubmodoGestor] = useState<SubmodoGestor>('sintetico');
  /** Categorias já escolhidas no drill-down, na ordem Marca → Tipo → Subtipo → Grupo. */
  const [caminhoGestor, setCaminhoGestor] = useState<string[]>([]);

  // Movimentos do ERP são OPCIONAIS. Com os dois desmarcados a tela se comporta
  // exatamente como antes — e não faz chamada nenhuma ao Ciclone.
  const [considerarRemessas, setConsiderarRemessas] = useState(false);
  const [considerarVendas, setConsiderarVendas] = useState(false);

  // Uma janela por movimento, e ajustável. Dois motivos, ambos concretos:
  //
  //  - Remessa e venda não acontecem na mesma janela: a data em que o ERP registra
  //    a remessa não é a em que a mercadoria entra na mala, e a venda costuma ser
  //    faturada depois da entrega.
  //  - `data_inventario` tem hora, mas a consulta ao ERP é por data. Uma venda das
  //    10h do dia em que A foi contado às 15h já está refletida em Qtd A e ainda
  //    assim cairia no período — descontada duas vezes.
  const [ajustarPeriodo, setAjustarPeriodo] = useState(false);
  const [remessaDe, setRemessaDe] = useState('');
  const [remessaAte, setRemessaAte] = useState('');
  const [vendaDe, setVendaDe] = useState('');
  const [vendaAte, setVendaAte] = useState('');
  const [empresa, setEmpresa] = useState<EscolhaEmpresa>('ambas');
  // 'emissao' é o padrão da tela. O `comparativo.py` usa 'movimento', então ao
  // conferir um relatório contra o outro é preciso igualar os dois lados — junto
  // do tipo de venda 13, que a tela também desmarca (ver RegrasConciliacaoDialog).
  const [baseData, setBaseData] = useState<'movimento' | 'emissao'>('emissao');

  // `null` = não mexeu no modal, e vale o padrão da tela (`selecaoPadrao`). Só
  // vira objeto quando o usuário altera algo. Note que `null` NÃO significa mais
  // "não enviar nada": ver `regrasEfetivas`.
  const [regrasSelecao, setRegrasSelecao] = useState<SelecaoRegras | null>(null);
  const [regrasAbertas, setRegrasAbertas] = useState(false);

  const { data: opcoes = [], isLoading: carregandoOpcoes } = useInventariosOpcoesQuery();
  const {
    data: linhas = [],
    isLoading: carregandoComparacao,
    isFetching,
    error,
  } = useComparacaoQuery(primeiroInventario ? null : idA || null, idB || null);

  // O ano é o primeiro recorte: vendedor e as listas de A/B trabalham dentro dele.
  // A regra (padrão no ano corrente, com recuo para o mais recente com dados) mora em
  // `useFiltroAno`, compartilhada com a tela de Exportar XML.
  const {
    anos,
    ano: anoEfetivo,
    setAno,
    itensDoAno: opcoesDoAno,
  } = useFiltroAno(opcoes);

  const vendedores = useMemo(() => {
    const map = new Map<string, string>();
    opcoesDoAno.forEach((o) => {
      if (!map.has(o.codigo_vendedor)) map.set(o.codigo_vendedor, o.nome_vendedor);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [opcoesDoAno]);

  const opcoesFiltradas = useMemo(() => {
    if (vendedorFiltro === 'todos') return opcoesDoAno;
    return opcoesDoAno.filter((o) => o.codigo_vendedor === vendedorFiltro);
  }, [opcoesDoAno, vendedorFiltro]);

  const invA = opcoes.find((o) => o.id === idA) || null;
  const invB = opcoes.find((o) => o.id === idB) || null;

  const rotulo = (inv: InventarioOpcao) =>
    `${format(new Date(inv.data_inventario), 'dd/MM/yyyy HH:mm')} · ${inv.nome_vendedor}`;

  const trocarLados = () => {
    setIdA(idB);
    setIdB(idA);
  };

  /**
   * Entrar no modo primeiro inventário descarta o A escolhido: não há lado A, e deixar o
   * id guardado faria a consulta continuar mandando um inventário que a tela não mostra.
   */
  const trocarModo = (primeiro: boolean) => {
    setPrimeiroInventario(primeiro);
    if (!primeiro) return;
    setIdA('');
    // Filtros que dependem do lado A somem da lista; deixar um deles selecionado
    // esvaziaria a tabela sem explicação.
    if (filtroLinha === 'so_em_a' || filtroLinha === 'so_em_b') setFiltroLinha('todos');
  };

  // Trocar de vendedor invalida a seleção: os inventários escolhidos podem não estar mais
  // na lista filtrada.
  const trocarVendedor = (codigo: string) => {
    setVendedorFiltro(codigo);
    setIdA('');
    setIdB('');
  };

  /**
   * Trocar de ano zera vendedor e seleção — pelo mesmo motivo, um nível acima: o vendedor
   * escolhido pode não ter inventário no ano novo, e A/B com certeza não estão mais na
   * lista. Comparar através da fronteira do ano continua possível: basta escolher
   * "Todos os anos".
   */
  const trocarAno = (ano: string) => {
    setAno(ano);
    setVendedorFiltro('todos');
    setIdA('');
    setIdB('');
  };

  // ── Reconciliação com movimentos do ERP (opcional) ──────────────────────────
  const reconciliar = considerarRemessas || considerarVendas;
  // Sem lado A não há dois vendedores para conferir: o único é o de B.
  const mesmoVendedor = primeiroInventario
    ? !!invB
    : !!invA && !!invB && invA.codigo_vendedor === invB.codigo_vendedor;

  const dataIso = (inv: InventarioOpcao | null) =>
    inv ? format(new Date(inv.data_inventario), 'yyyy-MM-dd') : null;
  const dataA = dataIso(invA);
  const dataB = dataIso(invB);

  /**
   * Início da janela de movimentos. No fluxo normal é a data do inventário A; no primeiro
   * inventário é a data informada da mala vazia. Um nome só para os dois porque é o mesmo
   * papel — daqui para baixo nada precisa saber em que modo está.
   */
  const dataBase = primeiroInventario ? dataMalaVazia || null : dataA;

  // Trocar A ou B repõe o período sugerido. Sobrescrever é decisão pontual sobre
  // um par de inventários — carregar as datas antigas para um par novo produziria
  // uma janela que não corresponde a nada.
  useEffect(() => {
    setRemessaDe(dataBase ?? '');
    setRemessaAte(dataB ?? '');
    setVendaDe(dataBase ?? '');
    setVendaAte(dataB ?? '');
  }, [dataBase, dataB]);

  const janelaRemessa = ajustarPeriodo
    ? { de: remessaDe, ate: remessaAte }
    : { de: dataBase, ate: dataB };
  const janelaVenda = ajustarPeriodo
    ? { de: vendaDe, ate: vendaAte }
    : { de: dataBase, ate: dataB };

  /** O início precisa ser anterior ao fim; janela desligada não precisa ser válida. */
  const janelaOk = (j: { de: string | null; ate: string | null }) =>
    !!j.de && !!j.ate && j.de <= j.ate;
  const ordemCorreta =
    (!considerarRemessas || janelaOk(janelaRemessa)) &&
    (!considerarVendas || janelaOk(janelaVenda));

  /**
   * Sinal de que A ou B pode ser uma contagem PARCIAL.
   *
   * Fragmentar é modo de trabalho válido neste projeto, mas reconciliar um
   * fragmento contra os movimentos do período inteiro produz uma divergência
   * falsa — e que parece legítima. Dois indícios detectáveis com o que a tela já
   * carregou: as duas contagens na mesma data, ou existir outra contagem do
   * mesmo vendedor na mesma data de A ou de B.
   *
   * É aviso, não bloqueio: a heurística não distingue o fragmento da contagem
   * única feita naquele dia, e bloquear impediria o caso legítimo.
   */
  const sinalFragmento = useMemo(() => {
    if (!invB) return null;
    const irmaos = (inv: InventarioOpcao, data: string | null) =>
      opcoes.some(
        (o) =>
          o.id !== inv.id &&
          o.codigo_vendedor === inv.codigo_vendedor &&
          dataIso(o) === data
      );
    // No primeiro inventário não há duas contagens para caírem na mesma data, mas a
    // contagem única do dia pode continuar sendo um fragmento — esse indício vale igual.
    if (primeiroInventario) return irmaos(invB, dataB) ? ('irmaos-no-dia' as const) : null;
    if (!invA) return null;
    if (dataA === dataB) return 'mesma-data' as const;
    if (irmaos(invA, dataA) || irmaos(invB, dataB)) return 'irmaos-no-dia' as const;
    return null;
  }, [invA, invB, dataA, dataB, opcoes, primeiroInventario]);

  /**
   * Marcou "primeiro inventário" num representante que já tem contagem anterior.
   *
   * É o uso errado mais provável, e o mais caro: a mala não nasceu vazia na data
   * informada, então tudo que entrou antes dela aparece como SOBRA — com a mesma cara de
   * uma sobra legítima. Custa nada detectar: a lista de inventários já está carregada.
   */
  const temInventarioAnterior = useMemo(() => {
    if (!primeiroInventario || !invB) return false;
    return opcoes.some(
      (o) =>
        o.id !== invB.id &&
        o.codigo_vendedor === invB.codigo_vendedor &&
        o.data_inventario < invB.data_inventario
    );
  }, [primeiroInventario, invB, opcoes]);

  // A lista do Ciclone serve para conferir que o código do vendedor do app existe
  // mesmo lá. Os cadastros foram feitos com a mesma numeração, mas isso é uma
  // convenção humana — se um dia divergir, o sintoma seria movimento zero em tudo,
  // que é indistinguível de "não houve movimento".
  const { data: vendedoresErp = [] } = useErpVendedoresQuery(reconciliar);
  // No primeiro inventário o vendedor sai de B, o único lado que existe.
  const invDoVendedor = primeiroInventario ? invB : invA;
  const codigoVendedor = invDoVendedor ? Number(invDoVendedor.codigo_vendedor) : NaN;
  const codigoExisteNoErp =
    vendedoresErp.length === 0 || vendedoresErp.some((v) => v.codigo === codigoVendedor);

  const podeReconciliar =
    reconciliar && mesmoVendedor && ordemCorreta && Number.isFinite(codigoVendedor);

  // Duas consultas, uma por janela. Quando as datas coincidem — que é o padrão —
  // as chaves de cache ficam idênticas e o react-query faz uma requisição só.
  const consultaRegras = useErpRegrasQuery(reconciliar && mesmoVendedor);
  const regrasNoPadrao = ehPadrao(regrasSelecao, consultaRegras.data);

  const empresasEscolhidas = empresasDaEscolha(empresa);

  /**
   * As regras que valem nesta consulta: o que o usuário escolheu ou, enquanto ele
   * não abriu o modal, o padrão da TELA.
   *
   * Elas viajam SEMPRE, e não só quando o usuário mexe. O padrão da tela não é o
   * do gateway — ela desmarca o tipo de venda 13 — e omitir a seleção faria o
   * servidor aplicar a regra dele, com o modal exibindo uma coisa e a tabela
   * somando outra.
   */
  const regrasEfetivas =
    regrasSelecao ?? (consultaRegras.data ? selecaoPadrao(consultaRegras.data) : null);

  const regrasParaEnvio = regrasEfetivas && {
    base_data: baseData,
    tipos_venda: regrasEfetivas.tiposVenda,
    tipos_remessa: regrasEfetivas.tiposRemessa,
    operacoes: regrasEfetivas.operacoes,
  };

  const paramsRemessas =
    podeReconciliar && considerarRemessas && janelaOk(janelaRemessa) && regrasParaEnvio
      ? {
          vendedor: codigoVendedor,
          de: janelaRemessa.de!,
          ate: janelaRemessa.ate!,
          empresas: empresasEscolhidas,
          ...regrasParaEnvio,
        }
      : null;
  const paramsVendas =
    podeReconciliar && considerarVendas && janelaOk(janelaVenda) && regrasParaEnvio
      ? {
          vendedor: codigoVendedor,
          de: janelaVenda.de!,
          ate: janelaVenda.ate!,
          empresas: empresasEscolhidas,
          ...regrasParaEnvio,
        }
      : null;

  /**
   * A consulta ao ERP só sai no clique.
   *
   * Antes ela disparava a cada parâmetro alterado, o que gera idas que ninguém
   * pediu — trocar a empresa logo após marcar um toggle rendia duas consultas, e
   * digitar uma data rendia uma por caractere. Cada ida atravessa VPN e leva
   * segundos; quem decide quando pagar isso é o usuário. É também o mesmo padrão
   * da tela de Consulta ao ERP, que sempre teve botão.
   */
  const [paramsAplicados, setParamsAplicados] = useState<{
    remessas: typeof paramsRemessas;
    vendas: typeof paramsVendas;
  } | null>(null);

  const buscarMovimentos = () =>
    setParamsAplicados({ remessas: paramsRemessas, vendas: paramsVendas });

  // Desligar os toggles não é consulta: limpa na hora, sem passar pelo botão.
  useEffect(() => {
    if (!reconciliar) setParamsAplicados(null);
  }, [reconciliar]);

  /**
   * No primeiro inventário o ERP deixa de ser opcional.
   *
   * Sem movimento, `esperado = 0` e a contagem inteira vira sobra de 100% — um resultado
   * que parece catastrófico e não significa nada. Os dois lados entram ligados, e a
   * Etapa 3 os trava enquanto o modo estiver ativo.
   */
  useEffect(() => {
    if (primeiroInventario) {
      setConsiderarRemessas(true);
      setConsiderarVendas(true);
    }
  }, [primeiroInventario]);

  const consultaRemessas = useErpMovimentosQuery(paramsAplicados?.remessas ?? null);
  const consultaVendas = useErpMovimentosQuery(paramsAplicados?.vendas ?? null);

  /** Parâmetros mexidos depois da última busca — o resultado exibido é de antes. */
  const buscaDesatualizada =
    paramsAplicados !== null &&
    JSON.stringify({ r: paramsRemessas, v: paramsVendas }) !==
      JSON.stringify({ r: paramsAplicados.remessas, v: paramsAplicados.vendas });

  // SEM_MOVIMENTO tem referência estável: `?? []` criaria um array novo a cada
  // render e faria o useMemo de `linhasExibidas` recalcular sempre.
  const movRemessas = consultaRemessas.data ?? SEM_MOVIMENTO;
  const movVendas = consultaVendas.data ?? SEM_MOVIMENTO;
  const carregandoMovimentos = consultaRemessas.isLoading || consultaVendas.isLoading;
  const erroMovimentos = consultaRemessas.error ?? consultaVendas.error;
  /**
   * Tentativa em curso. Sem exibir isso, uma falha transitória vira até dois
   * minutos de spinner mudo — o usuário conclui que travou e recarrega a página,
   * justamente quando o sistema estava se recuperando sozinho.
   */
  const tentativaAtual =
    Math.max(consultaRemessas.failureCount, consultaVendas.failureCount) + 1;

  // Cada mapa vem da SUA janela: remessas do período de remessa, vendas do de
  // venda. É por isso que não dá para ler os dois do mesmo resultado.
  const remessaPorChave = useMemo(
    () => new Map(considerarRemessas ? movRemessas.map((m) => [m.key, m] as const) : []),
    [movRemessas, considerarRemessas]
  );
  const vendaPorChave = useMemo(
    () => new Map(considerarVendas ? movVendas.map((m) => [m.key, m] as const) : []),
    [movVendas, considerarVendas]
  );

  /**
   * Códigos com movimento no ERP que ninguém contou — nem em A, nem em B.
   *
   * Fica fora de `linhasExibidas` porque é ele que dispara a busca de preço: a
   * RPC da comparação só devolve valor de produto contado, e sem preço essas
   * linhas valeriam R$ 0,00 na tela inteira. Códigos CRUS de propósito — é por
   * eles que `produtos` é consultado.
   */
  const codigosSoMovimento = useMemo(() => {
    if (!podeReconciliar || !paramsAplicados) return [];
    const contadas = new Set(
      linhas
        .filter((l) => !ehAcessorio(l.codigo_auxiliar))
        .map((l) => normalizarCodigoErp(l.codigo_auxiliar))
    );
    return [...new Set([...remessaPorChave.keys(), ...vendaPorChave.keys()])]
      .filter((k) => !contadas.has(k))
      .map(
        (k) =>
          remessaPorChave.get(k)?.codigo_auxiliar ??
          vendaPorChave.get(k)?.codigo_auxiliar ??
          k
      )
      // Ordenado para a chave de cache não mudar só porque os mapas mudaram de
      // ordem — sem isso o react-query refaz a consulta a cada render novo.
      .sort();
  }, [linhas, remessaPorChave, vendaPorChave, podeReconciliar, paramsAplicados]);

  const consultaFichas = useFichasProdutosQuery(codigosSoMovimento);
  const fichasSoMovimento = consultaFichas.data ?? SEM_FICHAS;
  /**
   * O preço dessas linhas chega numa segunda ida ao banco. Enquanto ela não
   * volta, Falta e Sobra sairiam menores do que são — e são os números que
   * decidem. Melhor segurar o resultado do que mostrá-lo pela metade.
   */
  const carregandoValores = consultaFichas.isLoading;

  /**
   * Linhas finais da tela. Sem reconciliação, devolve o que a RPC já calculou.
   * Com reconciliação, `esperado = A + remessa − venda` e a diferença passa a ser
   * medida contra o esperado — a fórmula degrada sozinha para `B − A` quando os
   * dois toggles estão desligados, então não há dois caminhos de código.
   */
  const linhasExibidas = useMemo<LinhaExibida[]>(() => {
    const base = linhas.map((l) => ({
      ...l,
      remessa: 0,
      venda: 0,
      esperado: l.quantidade_a,
      so_movimento: false,
    }));

    if (!podeReconciliar || !paramsAplicados) return base;
    if (remessaPorChave.size === 0 && vendaPorChave.size === 0) return base;

    const usadas = new Set<string>();

    const reconciliadas = base
      // Acessórios não entram no inventário físico e o ERP já os exclui; mantê-los
      // aqui produziria divergência igual à contagem inteira.
      .filter((l) => !ehAcessorio(l.codigo_auxiliar))
      .map((l) => {
        const chave = normalizarCodigoErp(l.codigo_auxiliar);
        usadas.add(chave);
        const remessa = remessaPorChave.get(chave)?.remessa ?? 0;
        const venda = vendaPorChave.get(chave)?.venda ?? 0;
        const esperado = l.quantidade_a + remessa - venda;
        return { ...l, remessa, venda, esperado, diferenca: l.quantidade_b - esperado };
      });

    // Produto que teve movimento mas não foi contado em nenhum dos dois lados.
    // Some da tela se ignorado — e é justamente um caso que merece atenção.
    const chavesDeMovimento = new Set([...remessaPorChave.keys(), ...vendaPorChave.keys()]);
    const soMovimento: LinhaExibida[] = [...chavesDeMovimento]
      .filter((k) => !usadas.has(k))
      .map((k) => {
        const r = remessaPorChave.get(k);
        const v = vendaPorChave.get(k);
        const remessa = r?.remessa ?? 0;
        const venda = v?.venda ?? 0;
        const esperado = remessa - venda;
        // Preço e categoria vêm do catálogo, não da RPC — a RPC só conhece produto
        // contado. Ausente = 0 e nulos, que a tela já mostra como "sem valor" e
        // agrupa como "Sem categoria" em vez de fingir R$ 0,00 numa categoria real.
        const ficha = fichasSoMovimento.get(k);
        return {
          codigo_auxiliar: r?.codigo_auxiliar ?? v?.codigo_auxiliar ?? k,
          nome_produto: r?.nome ?? v?.nome ?? k,
          valor_unitario: ficha?.valor ?? 0,
          quantidade_a: 0,
          quantidade_b: 0,
          presente_em_a: false,
          presente_em_b: false,
          marca: ficha?.marca ?? null,
          tipo: ficha?.tipo ?? null,
          subtipo: ficha?.subtipo ?? null,
          grupo: ficha?.grupo ?? null,
          remessa,
          venda,
          esperado,
          diferenca: -esperado,
          so_movimento: true,
        };
      })
      /**
       * Só sai a linha que não movimentou NADA nesta configuração — acontece
       * quando um dos toggles está desligado e a chave veio da outra ponta.
       *
       * O filtro anterior era `esperado !== 0`, e descartava também o produto que
       * entrou e saiu na mesma medida (remessa 2, venda 2). A divergência dele é
       * zero, mas ele circulou: omitir apaga o rastro do movimento do relatório e
       * ainda encolhe o denominador da acuracidade. Era essa a diferença que
       * deixava o comparativo do app com menos linhas que o da ferramenta local.
       */
      .filter((l) => l.remessa !== 0 || l.venda !== 0);

    return [...reconciliadas, ...soMovimento];
  }, [
    linhas,
    remessaPorChave,
    vendaPorChave,
    fichasSoMovimento,
    podeReconciliar,
    paramsAplicados,
  ]);

  const resumo = useMemo(() => {
    const linhas = linhasExibidas;
    const emAmbos = linhas.filter((l) => l.presente_em_a && l.presente_em_b).length;
    const iguais = linhas.filter((l) => l.diferenca === 0).length;
    const semValor = linhas.filter((l) => l.valor_unitario === 0).length;

    /**
     * Falta e sobra somadas SEPARADAMENTE.
     *
     * O card antigo mostrava a soma líquida, e nela os dois lados se anulam: um
     * vendedor com R$ 5.000 faltando e R$ 5.000 sobrando aparecia como R$ 0 — que
     * se lê como "está tudo certo" quando são dois problemas grandes, de causas
     * diferentes (falta costuma ser perda; sobra, remessa não baixada).
     */
    let faltaValor = 0;
    let sobraValor = 0;
    let faltaItens = 0;
    let sobraItens = 0;
    /**
     * A divergência em UNIDADES, ao lado da divergência em reais.
     *
     * Não é redundância: produto sem preço cadastrado entra com valor 0 e some
     * inteiro dos totais em R$ — são 1 em cada 439 nos dados reais, e some
     * justamente quando o cadastro está incompleto, que é quando mais se precisa
     * enxergar. A quantidade não depende do catálogo.
     */
    let faltaQtd = 0;
    let sobraQtd = 0;
    for (const l of linhas) {
      const v = l.diferenca * l.valor_unitario;
      if (l.diferenca < 0) {
        faltaValor += v;
        faltaItens++;
        faltaQtd += l.diferenca;
      } else if (l.diferenca > 0) {
        sobraValor += v;
        sobraItens++;
        sobraQtd += l.diferenca;
      }
    }
    const soMovimento = linhas.filter((l) => l.so_movimento).length;
    const soEmA = linhas.filter((l) => l.presente_em_a && !l.presente_em_b).length;
    const soEmB = linhas.filter((l) => !l.presente_em_a && l.presente_em_b).length;

    /**
     * A métrica de CONCENTRAÇÃO saiu daqui (era "Concentrada/Espalhada": quanto do
     * impacto financeiro estava nos 5 maiores).
     *
     * Não por estar errada — por ser a única da faixa que entregava interpretação em
     * vez de número, e exigir conhecer o corte arbitrário de 50% para ser lida. A
     * tabela já responde a mesma pergunta: a ordenação padrão é por impacto, então
     * primeira linha enorme com o resto pequeno É concentração, visível sem heurística
     * nenhuma. Se voltar a fazer falta, o lugar dela é uma frase abaixo da faixa, não
     * um quinto card competindo por atenção.
     */
    return {
      total: linhas.length,
      emAmbos,
      iguais,
      faltaValor,
      sobraValor,
      saldo: faltaValor + sobraValor,
      faltaItens,
      sobraItens,
      /** Unidades faltando (negativo) e sobrando (positivo), e o líquido. */
      faltaQtd,
      sobraQtd,
      saldoQtd: faltaQtd + sobraQtd,
      soMovimento,
      soEmA,
      soEmB,
      // Denominador junto de propósito: uma acuracidade sem ele já exibiu ~100%
      // sobre zero linhas neste projeto por meses.
      acuracidade: linhas.length > 0 ? iguais / linhas.length : null,
      semValor,
    };
  }, [linhasExibidas]);

  const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  /** Quantidade sem casas fixas: `quantidade_fisica` é numeric e admite fração. */
  const unid = (v: number) =>
    Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  /** `−12` · `+9` · `0` — para a composição do saldo, onde o sinal é a informação. */
  const unidSinal = (v: number) => (v === 0 ? '0' : `${v < 0 ? '−' : '+'}${unid(v)}`);

  const linhasFiltradas = useMemo(() => {
    /**
     * Maior impacto primeiro. Antes vinha na ordem da RPC (alfabética por código),
     * o que obriga a varrer a tabela inteira para achar o que importa.
     *
     * O desempate por quantidade não é detalhe: produto sem valor cadastrado tem
     * `dif_valor` zero e afundaria para o fim mesmo faltando dezenas de unidades.
     */
    const porImpacto = (a: LinhaExibida, b: LinhaExibida) => {
      const va = Math.abs(a.diferenca * a.valor_unitario);
      const vb = Math.abs(b.diferenca * b.valor_unitario);
      if (vb !== va) return vb - va;
      return Math.abs(b.diferenca) - Math.abs(a.diferenca);
    };
    const linhas = [...linhasExibidas].sort(porImpacto);
    switch (filtroLinha) {
      case 'com_diferenca':
        return linhas.filter((l) => l.diferenca !== 0);
      case 'iguais':
        return linhas.filter((l) => l.diferenca === 0);
      // Falta e sobra separadas: são problemas de causas diferentes — falta costuma ser
      // perda, sobra costuma ser remessa não baixada — e "Com diferença" as embaralha.
      case 'falta':
        return linhas.filter((l) => l.diferenca < 0);
      case 'sobra':
        return linhas.filter((l) => l.diferenca > 0);
      // Movimento no ERP sem contagem nenhuma. Tinha etiqueta na tabela e nenhum jeito
      // de isolar — e é a linha que mais pede atenção.
      case 'so_movimento':
        return linhas.filter((l) => l.so_movimento);
      // Produto sem preço: conta nas unidades e vale zero em R$. O rodapé dizia quantos
      // eram sem dizer quais.
      case 'sem_valor':
        return linhas.filter((l) => l.valor_unitario === 0);
      case 'so_em_a':
        return linhas.filter((l) => l.presente_em_a && !l.presente_em_b);
      case 'so_em_b':
        return linhas.filter((l) => !l.presente_em_a && l.presente_em_b);
      default:
        return linhas;
    }
  }, [linhasExibidas, filtroLinha]);

  const { paginatedData, ...paginacao } = usePagination({
    data: linhasFiltradas,
    searchTerm: busca,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
    itemsPerPage: 20,
  });

  /**
   * O modo gestor consome `filteredData` — o resultado da busca ANTES do corte de
   * página. Reaproveitar a mesma regra mantém os dois modos concordando sobre o que
   * está na tela; a paginação, ao contrário, não se aplica a ele: agregação por
   * categoria sobre 20 de 400 linhas produziria totais errados sem parecer errado.
   */
  const linhasParaGestor = paginacao.filteredData;

  const exportarExcel = async () => {
    if (linhasFiltradas.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeA = primeiroInventario
      ? 'mala-vazia'
      : invA
        ? format(new Date(invA.data_inventario), 'dd-MM-yyyy')
        : 'A';
    const nomeB = invB ? format(new Date(invB.data_inventario), 'dd-MM-yyyy') : 'B';
    // O vendedor vem de B no primeiro inventário e de A no fluxo normal — o mesmo
    // `invDoVendedor` que alimenta a consulta ao ERP, para o arquivo não afirmar um
    // vendedor diferente do que foi consultado.
    const nomeVendedor = invDoVendedor ? nomeParaArquivo(invDoVendedor.nome_vendedor) : '';
    try {
      await exportarComparativoExcel({
        // Exporta o que está na tela, com a mesma ordenação por impacto.
        linhas: linhasFiltradas.map((l) => ({
          codigo_auxiliar: l.codigo_auxiliar,
          nome_produto: l.nome_produto,
          valor_unitario: l.valor_unitario,
          quantidade_a: l.quantidade_a,
          remessa: l.remessa,
          venda: l.venda,
          esperado: l.esperado,
          quantidade_b: l.quantidade_b,
          diferenca: l.diferenca,
        })),
        rotuloA: primeiroInventario
          ? dataBr(dataBase)
          : invA
            ? format(new Date(invA.data_inventario), 'dd/MM/yyyy')
            : '?',
        rotuloB: invB ? format(new Date(invB.data_inventario), 'dd/MM/yyyy') : '?',
        // A banda A precisa dizer que não houve contagem naquele dia — a planilha sai da
        // tela e é lida meses depois, sem ninguém para explicar a linha de base.
        tituloBandaA: primeiroInventario
          ? `Mala vazia em ${dataBr(dataBase)} — sem contagem inicial`
          : undefined,
        comMovimentos: podeReconciliar,
        comRemessas: considerarRemessas,
        comVendas: considerarVendas,
        // As janelas de fato usadas, não as datas dos inventários: com "Ajustar
        // períodos" elas divergem, e é o que a banda precisa declarar.
        janelaRemessa:
          janelaRemessa.de && janelaRemessa.ate
            ? { de: janelaRemessa.de, ate: janelaRemessa.ate }
            : null,
        janelaVenda:
          janelaVenda.de && janelaVenda.ate
            ? { de: janelaVenda.de, ate: janelaVenda.ate }
            : null,
        nomeArquivo: nomeVendedor
          ? `comparativo_${nomeVendedor}_${nomeA}_vs_${nomeB}.xlsx`
          : `comparativo_${nomeA}_vs_${nomeB}.xlsx`,
      });
      toast.success('Planilha baixada.');
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível gerar a planilha.');
    }
  };


  const mesmoInventario = !primeiroInventario && !!idA && idA === idB;
  const prontoParaComparar = primeiroInventario
    ? !!idB && !!dataBase
    : !!idA && !!idB && !mesmoInventario;

  /**
   * No primeiro inventário o resultado só existe DEPOIS da consulta ao ERP.
   *
   * Sem movimento, `esperado = 0` e a tela mostraria a contagem inteira como sobra de
   * 100% — um resultado alarmante e sem significado nenhum. No fluxo normal isso não
   * acontece, porque `B − A` já é uma resposta válida sem o Ciclone; aqui não é. Segurar
   * o resultado é mais honesto do que exibi-lo e pedir para o usuário desconsiderar.
   */
  const aguardandoErp = primeiroInventario && (!paramsAplicados || !podeReconciliar);
  const vendedoresDiferentes =
    !primeiroInventario && !!invA && !!invB && invA.codigo_vendedor !== invB.codigo_vendedor;

  const detalhado = modoTabela === 'detalhado';
  const modoGestor = modoTabela === 'gestor';

  // Resumido: Produto, Dif. qtd, Dif. em R$, Situação.
  // Detalhado: soma Valor unit., Qtd A e Qtd B — mais as colunas de movimento
  // quando ligadas.
  const totalColunas =
    4 +
    (detalhado ? 3 + (podeReconciliar ? 1 + (considerarRemessas ? 1 : 0) + (considerarVendas ? 1 : 0) : 0) : 0);

  /** Cor da divergência: positiva informativa, negativa em atenção. Escala divergente. */
  const corDif = (v: number) =>
    v > 0 ? 'text-info-strong' : v < 0 ? 'text-warning-strong' : 'text-muted-foreground';

  /**
   * A faixa responde uma pergunta só: "a contagem está confiável, e se não está,
   * quanto e onde?". Os cards anteriores — Produtos, Só no A, Só no B — descreviam
   * o inventário em vez de apoiar decisão, e os dois do meio continuam acessíveis
   * pelo filtro logo abaixo. A contagem total virou o denominador da acuracidade.
   */
  const pct = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1 });

  /**
   * Os tiles com `filtro` são clicáveis e aplicam aquele recorte na tabela.
   *
   * A faixa respondia "quanto e onde", e o "onde" morria ali: para ver os produtos por
   * trás do número era preciso adivinhar qual opção do seletor correspondia ao card. Um
   * `filtro` por tile fecha esse laço, e o tile ativo passa a espelhar o seletor.
   *
   * `Saldo` fica de fora de propósito: é o líquido de falta e sobra, e não existe
   * subconjunto de linhas que signifique "saldo" — marcá-lo com um filtro qualquer seria
   * inventar uma correspondência.
   */
  const tiles = [
    {
      rotulo: 'Acuracidade',
      valor: resumo.acuracidade === null ? '—' : pct(resumo.acuracidade),
      nota: `${resumo.iguais} de ${resumo.total} produtos sem diferença`,
      filtro: 'iguais',
    },
    {
      rotulo: 'Falta',
      valor: resumo.faltaValor === 0 ? '—' : moeda(resumo.faltaValor),
      // A nota passou a carregar a QUANTIDADE: o valor em R$ ignora produto sem preço
      // cadastrado, e era o único lugar da faixa onde a unidade sumia.
      nota:
        resumo.faltaItens === 0
          ? 'nada faltando'
          : `${unid(resumo.faltaQtd)} un. em ${resumo.faltaItens} produto${resumo.faltaItens > 1 ? 's' : ''}`,
      cor: resumo.faltaValor < 0 ? 'text-warning-strong' : undefined,
      filtro: 'falta',
    },
    {
      rotulo: 'Sobra',
      valor: resumo.sobraValor === 0 ? '—' : `+${moeda(resumo.sobraValor)}`,
      nota:
        resumo.sobraItens === 0
          ? 'nada sobrando'
          : `${unid(resumo.sobraQtd)} un. em ${resumo.sobraItens} produto${resumo.sobraItens > 1 ? 's' : ''}`,
      cor: resumo.sobraValor > 0 ? 'text-info-strong' : undefined,
      filtro: 'sobra',
    },
    /**
     * O líquido responde "qual o impacto financeiro final", que é diferente de
     * "que problemas existem".
     *
     * Ele só pode aparecer ACOMPANHADO de Falta e Sobra: sozinho, esconderia os
     * dois lados — R$ 5.000 faltando com R$ 5.000 sobrando daria zero e se leria
     * como "tudo certo". Ao lado das parcelas, a compensação fica visível, e por
     * isso a nota mostra a conta em vez de só o resultado.
     */
    {
      rotulo: 'Saldo',
      valor:
        resumo.faltaValor === 0 && resumo.sobraValor === 0
          ? '—'
          : `${resumo.saldo > 0 ? '+' : ''}${moeda(resumo.saldo)}`,
      /**
       * A nota mostra a composição em UNIDADES, não em reais.
       *
       * A intenção original — deixar a compensação visível, para R$ 5.000 faltando
       * com R$ 5.000 sobrando não se lerem como "tudo certo" — continua de pé: ela
       * só mudou de unidade. E ganha o que faltava: a conta em reais já está inteira
       * nos dois cards ao lado (Falta e Sobra mostram exatamente essas parcelas),
       * enquanto o líquido em quantidade não existia em lugar nenhum.
       */
      nota:
        resumo.faltaValor === 0 && resumo.sobraValor === 0 && resumo.saldoQtd === 0
          ? 'sem divergência'
          : `${unidSinal(resumo.faltaQtd)} ${unidSinal(resumo.sobraQtd)} = ${unidSinal(resumo.saldoQtd)} un.`,
      cor:
        resumo.saldo < 0
          ? 'text-warning-strong'
          : resumo.saldo > 0
            ? 'text-info-strong'
            : undefined,
      // O saldo é a soma sobre as linhas que divergem — é exatamente esse o recorte.
      filtro: 'com_diferenca',
    },
  ];

  const nomeVendedorEfetivo =
    vendedorFiltro === 'todos'
      ? 'Todos os vendedores'
      : vendedores.find(([c]) => c === vendedorFiltro)?.[1] || vendedorFiltro;
  const resumoEscopo = `${anoEfetivo === 'todos' ? 'Todos os anos' : anoEfetivo} · ${nomeVendedorEfetivo}`;

  const resumoInventarios = primeiroInventario
    ? invB
      ? `1º inventário · ${dataBase ? dataBr(dataBase) : 'definir mala vazia'} → ${format(new Date(invB.data_inventario), 'dd/MM')}`
      : 'Escolher a contagem'
    : invA && invB
      ? `${format(new Date(invA.data_inventario), 'dd/MM')} → ${format(new Date(invB.data_inventario), 'dd/MM')}`
      : invA
        ? 'Definir inventário B'
        : invB
          ? 'Definir inventário A'
          : 'Selecione A e B';

  const resumoErp = !reconciliar
    ? 'Desativado'
    : considerarRemessas && considerarVendas
      ? 'Remessas + Vendas'
      : considerarRemessas
        ? 'Só Remessas'
        : 'Só Vendas';

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Comparar Inventários"
          description="Escolha dois inventários e veja a diferença entre as contagens"
          isFetching={isFetching && !carregandoComparacao}
        />

        {/* ── Bloco 1 · Seleção em etapas ─────────────────────────────────────────
            Usa as primitivas Tabs do projeto (Radix) em vez de <button> soltos: elas
            trazem role="tab"/aria-selected e navegação por setas do teclado, e o
            estado ativo vem por `data-[state=active]` em vez de ternário de
            className. As três etapas não têm ordem obrigatória — o usuário pode ir
            direto à que quiser, e cada aba resume o que já está configurado nela
            para o estado não sumir quando o painel fecha. */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <Tabs
              value={etapaAtiva}
              onValueChange={(v) => setEtapaAtiva(v as Etapa)}
              className="space-y-4"
            >
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-1.5">
                <TabsTrigger
                  value="1"
                  className="group flex flex-col items-start justify-start rounded-lg px-3 py-2 text-left text-xs font-normal transition-all data-[state=active]:font-semibold data-[state=active]:shadow-sm"
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/20 text-2xs font-bold text-muted-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                      1
                    </span>
                    <span className="truncate font-medium">Escopo de Busca</span>
                    {/* Marca escopo REDUZIDO: um ano e um vendedor específicos.
                        "Todos" é o estado inicial, não uma escolha — por isso não
                        acende. Não entra aqui se o escopo acha ou não inventário: o
                        contador e o aviso logo abaixo já dizem isso, e um check que
                        apaga depois de o usuário ter escolhido os dois se lê como
                        erro. */}
                    {anoEfetivo !== 'todos' && vendedorFiltro !== 'todos' && (
                      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-strong">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 w-full truncate pl-5 text-2xs font-normal text-muted-foreground">
                    {resumoEscopo}
                  </span>
                </TabsTrigger>

                <TabsTrigger
                  value="2"
                  className="group flex flex-col items-start justify-start rounded-lg px-3 py-2 text-left text-xs font-normal transition-all data-[state=active]:font-semibold data-[state=active]:shadow-sm"
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/20 text-2xs font-bold text-muted-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                      2
                    </span>
                    <span className="truncate font-medium">Inventários</span>
                    {prontoParaComparar && (
                      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-strong">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 w-full truncate pl-5 text-2xs font-normal text-muted-foreground">
                    {resumoInventarios}
                  </span>
                </TabsTrigger>

                <TabsTrigger
                  value="3"
                  className="group flex flex-col items-start justify-start rounded-lg px-3 py-2 text-left text-xs font-normal transition-all data-[state=active]:font-semibold data-[state=active]:shadow-sm"
                >
                  <div className="flex w-full items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/20 text-2xs font-bold text-muted-foreground group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                      3
                    </span>
                    <span className="truncate font-medium">
                      {primeiroInventario ? 'ERP (Obrigatório)' : 'ERP (Opcional)'}
                    </span>
                    {reconciliar && (
                      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-info-subtle text-info-strong">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 w-full truncate pl-5 text-2xs font-normal text-muted-foreground">
                    {resumoErp}
                  </span>
                </TabsTrigger>
              </TabsList>

              <div className="border-t border-border/60" />

              {/* Painel Etapa 1: Escopo de Busca */}
              <TabsContent value="1" className="mt-0 space-y-4 pt-1">
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Filtre a lista de inventários por ano e representante comercial
                  </p>
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {opcoesFiltradas.length} inventário(s) encontrado(s)
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ano
                    </Label>
                    <Select value={anoEfetivo} onValueChange={trocarAno} disabled={carregandoOpcoes}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {anos.map((ano) => (
                          <SelectItem key={ano} value={ano}>
                            {ano}
                          </SelectItem>
                        ))}
                        <SelectItem value="todos">Todos os anos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Vendedor
                    </Label>
                    <Select value={vendedorFiltro} onValueChange={trocarVendedor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os vendedores" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os vendedores</SelectItem>
                        {vendedores.map(([codigo, nome]) => (
                          <SelectItem key={codigo} value={codigo}>
                            {nome} ({codigo})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-border/50 pt-3">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setEtapaAtiva('2')}
                    className="gap-1.5 text-xs"
                  >
                    Escolher Inventários
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
              </TabsContent>

              {/* Painel Etapa 2: Escolha dos Inventários A e B */}
              <TabsContent value="2" className="mt-0 space-y-4 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {primeiroInventario
                      ? 'A base é a mala vazia; a contagem entra no lado B'
                      : 'Selecione a contagem de referência (A) e a comparada (B)'}
                  </p>
                  {!primeiroInventario && invA && invB && (
                    <Badge variant={mesmoVendedor ? 'outline' : 'warning'} className="text-2xs shrink-0">
                      {mesmoVendedor ? 'Mesmo vendedor' : 'Vendedores diferentes'}
                    </Badge>
                  )}
                </div>

                {/* Modo da comparação. Fica ANTES dos seletores porque decide o que o
                    lado A é: outra contagem, ou uma data de mala vazia. */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5">
                  <Button
                    variant={primeiroInventario ? 'ghost' : 'default'}
                    size="sm"
                    onClick={() => trocarModo(false)}
                    className="flex-1 gap-1.5 text-xs"
                  >
                    Comparar duas contagens
                  </Button>
                  <Button
                    variant={primeiroInventario ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => trocarModo(true)}
                    className="flex-1 gap-1.5 text-xs"
                  >
                    Primeiro inventário
                  </Button>
                </div>

                <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  {/* Lado A: uma contagem, ou a data em que a mala estava vazia */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor={primeiroInventario ? 'mala-vazia' : undefined}
                        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {primeiroInventario ? 'Mala vazia em · Base' : 'Inventário A · Base'}
                      </Label>
                      {!primeiroInventario && invA && (
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {invA.nome_vendedor}
                        </span>
                      )}
                    </div>
                    {primeiroInventario ? (
                      <Input
                        id="mala-vazia"
                        type="date"
                        value={dataMalaVazia}
                        max={dataB ?? undefined}
                        onChange={(e) => setDataMalaVazia(e.target.value)}
                      />
                    ) : (
                      <Select value={idA} onValueChange={setIdA} disabled={carregandoOpcoes}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha o inventário A" />
                        </SelectTrigger>
                        <SelectContent>
                          {opcoesFiltradas.map((o) => (
                            <SelectItem key={o.id} value={o.id} disabled={o.id === idB}>
                              {rotulo(o)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Botão Inverter — não existe no primeiro inventário: não há dois
                      lados para trocar de lugar. */}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={trocarLados}
                    disabled={primeiroInventario || (!idA && !idB)}
                    aria-label="Inverter A e B"
                    title="Inverter ordem das contagens (A <-> B)"
                    className="w-full lg:w-11 mb-0.5"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>

                  {/* Inventário B */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {primeiroInventario ? 'Contagem · Comparada' : 'Inventário B · Comparado'}
                      </Label>
                      {invB && (
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {invB.nome_vendedor}
                        </span>
                      )}
                    </div>
                    <Select value={idB} onValueChange={setIdB} disabled={carregandoOpcoes}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o inventário B" />
                      </SelectTrigger>
                      <SelectContent>
                        {opcoesFiltradas.map((o) => (
                          <SelectItem key={o.id} value={o.id} disabled={o.id === idA}>
                            {rotulo(o)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEtapaAtiva('1')}
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    Alterar Escopo
                  </Button>

                  <Button
                    variant={prontoParaComparar ? 'outline' : 'ghost'}
                    size="sm"
                    onClick={() => setEtapaAtiva('3')}
                    className="gap-1.5 text-xs"
                  >
                    {primeiroInventario ? 'Configurar ERP' : 'Configurar ERP (Opcional)'}
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </TabsContent>

              {/* Painel Etapa 3: Movimentos do ERP */}
              <TabsContent value="3" className="mt-0 space-y-3 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {primeiroInventario
                      ? 'Sem contagem anterior, o esperado vem só do ERP — remessas e vendas são obrigatórias'
                      : 'Reconcilie remessas e vendas faturadas no período do ERP Ciclone'}
                  </p>
                  {reconciliar && mesmoVendedor && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Checkbox
                          checked={ajustarPeriodo}
                          onCheckedChange={(v) => setAjustarPeriodo(v === true)}
                        />
                        Ajustar períodos
                      </label>
                      <button
                        type="button"
                        onClick={() => setRegrasAbertas(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        <SlidersHorizontal className="size-3.5" />
                        Regras
                        {!regrasNoPadrao && (
                          <Badge variant="info" className="px-1.5 py-0 text-2xs">
                            alteradas
                          </Badge>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Toggles primários dos movimentos */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <LinhaMovimento
                      id="remessa"
                      rotulo="Considerar remessas"
                      ligado={considerarRemessas}
                      onToggle={setConsiderarRemessas}
                      desabilitado={!mesmoVendedor || primeiroInventario}
                      ajustando={ajustarPeriodo}
                      de={remessaDe}
                      ate={remessaAte}
                      onDe={setRemessaDe}
                      onAte={setRemessaAte}
                    />
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <LinhaMovimento
                      id="venda"
                      rotulo="Considerar vendas"
                      ligado={considerarVendas}
                      onToggle={setConsiderarVendas}
                      desabilitado={!mesmoVendedor || primeiroInventario}
                      ajustando={ajustarPeriodo}
                      de={vendaDe}
                      ate={vendaAte}
                      onDe={setVendaDe}
                      onAte={setVendaAte}
                    />
                  </div>
                </div>

                {/* Parâmetros do ERP: Visíveis quando conciliação ativada */}
                {reconciliar && mesmoVendedor && (
                  <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Empresa</Label>
                      <Select
                        value={empresa}
                        onValueChange={(v) => setEmpresa(v as EscolhaEmpresa)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ambas">Ambas (Empresa 1 e 2)</SelectItem>
                          <SelectItem value="1">Empresa 1</SelectItem>
                          <SelectItem value="2">Empresa 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Data base</Label>
                      <Select
                        value={baseData}
                        onValueChange={(v) => setBaseData(v as 'movimento' | 'emissao')}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="movimento">Movimento da nota</SelectItem>
                          <SelectItem value="emissao">Emissão do pedido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Ação de Busca ERP */}
                {reconciliar && mesmoVendedor && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {/* Sem as regras carregadas não dá para consultar: elas viajam
                        em toda consulta, e sair sem elas devolveria o padrão do
                        gateway — que conta o tipo 13 que esta tela declara fora. */}
                    <Button
                      onClick={buscarMovimentos}
                      disabled={!ordemCorreta || carregandoMovimentos || !regrasEfetivas}
                    >
                      {carregandoMovimentos ? (
                        <>
                          <span className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Consultando o ERP…
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 size-4" />
                          {paramsAplicados ? 'Atualizar movimentos' : 'Buscar movimentos no ERP'}
                        </>
                      )}
                    </Button>
                    {!regrasEfetivas ? (
                      <span className="text-xs text-muted-foreground">
                        {consultaRegras.error
                          ? 'Sem as regras de conciliação do ERP não dá para consultar — reabra a tela quando o Ciclone responder.'
                          : 'Carregando as regras de conciliação…'}
                      </span>
                    ) : (
                      buscaDesatualizada &&
                      !carregandoMovimentos && (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-warning-strong">
                          <TriangleAlert className="size-3.5 shrink-0" />
                          Parâmetros alterados — clique em atualizar para consultar o ERP.
                        </span>
                      )
                    )}
                  </div>
                )}

                {podeReconciliar && paramsAplicados && (
                  <p className="text-xs text-muted-foreground">
                    Fórmula: Esperado ={' '}
                    {primeiroInventario ? `mala vazia em ${dataBr(dataBase)}` : 'Qtd A'}
                    {considerarRemessas && ' + remessas'}
                    {considerarVendas && ' − vendas'}
                    {empresa !== 'ambas' && ` · empresa ${empresa}`}
                    {baseData === 'emissao' && ' · por emissão'}
                    {!regrasNoPadrao && ' · regras customizadas'}
                    {!ajustarPeriodo && ' · período padrão entre contagens'}
                  </p>
                )}

                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEtapaAtiva('2')}
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    Voltar para Escolha de Inventários
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <RegrasConciliacaoDialog
              aberto={regrasAbertas}
              onOpenChange={setRegrasAbertas}
              regras={consultaRegras.data}
              carregando={consultaRegras.isLoading}
              erro={consultaRegras.error ?? null}
              selecao={regrasSelecao}
              onChange={setRegrasSelecao}
            />

            {/* Avisos condicionais */}
            {!carregandoOpcoes && opcoesFiltradas.length === 0 && (
              <p className="pt-2.5 text-xs text-muted-foreground">
                Nenhum inventário em <strong className="text-foreground">{anoEfetivo}</strong>
                {vendedorFiltro !== 'todos' && ' para este vendedor'}. Escolha outro ano ou
                selecione <strong className="text-foreground">Todos</strong>.
              </p>
            )}
            {mesmoInventario && (
              <p className="pt-2.5 text-xs font-medium text-destructive-strong">
                Escolha dois inventários diferentes para comparar.
              </p>
            )}
            {primeiroInventario && !!idB && !dataBase && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-destructive-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                Informe a data em que a mala estava vazia — é ela que define de quando o ERP
                começa a somar as remessas.
              </p>
            )}
            {/* O erro caro deste modo, e o único que a tela consegue detectar sozinha. */}
            {temInventarioAnterior && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-warning-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                Este vendedor já tem contagem anterior — se a mala não nasceu vazia na data
                informada, tudo que entrou antes dela vai aparecer como sobra. Comparar com o
                inventário anterior costuma ser o caminho certo.
              </p>
            )}
            {vendedoresDiferentes && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-warning-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                A e B são de vendedores diferentes — o comparativo raramente faz sentido, e os
                movimentos do ERP ficam indisponíveis.
              </p>
            )}
            {reconciliar && mesmoVendedor && !ordemCorreta && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-destructive-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                {ajustarPeriodo
                  ? 'Em cada período, a data inicial precisa ser anterior à final.'
                  : 'Para considerar movimentos, A precisa ser o inventário mais antigo. Use o botão de inverter.'}
              </p>
            )}
            {reconciliar && podeReconciliar && !codigoExisteNoErp && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-destructive-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                O código <strong>{codigoVendedor}</strong> não existe como vendedor no Ciclone. Os
                movimentos virão zerados — confira o cadastro antes de confiar no resultado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Bloco 2 · Resultado ──────────────────────────────────────────────────── */}
        {!prontoParaComparar || aguardandoErp ? (
          <Card>
            <CardContent className="flex flex-col items-center px-6 py-20 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <GitCompare className="size-7" />
              </div>
              <p className="text-base font-semibold">
                {aguardandoErp ? 'Falta buscar os movimentos' : 'Nenhum comparativo ainda'}
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {aguardandoErp
                  ? 'Sem contagem anterior, o esperado vem inteiro do ERP. Vá até a Etapa 3 e busque as remessas e vendas do período — o resultado aparece aqui em seguida.'
                  : primeiroInventario
                    ? 'Escolha a contagem e informe a data em que a mala estava vazia. O resultado aparece aqui, com o resumo e a diferença produto a produto.'
                    : 'Escolha o inventário A e o B acima. O resultado aparece aqui, com o resumo e a diferença produto a produto.'}
              </p>
              {aguardandoErp && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEtapaAtiva('3')}
                  className="mt-4 gap-1.5 text-xs"
                >
                  Ir para a Etapa 3
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
            </CardContent>
          </Card>
        ) : carregandoComparacao || carregandoMovimentos || carregandoValores ? (
          <Card>
            <PageLoader
              inline
              label={
                !carregandoMovimentos
                  ? 'Carregando comparativo'
                  : tentativaAtual > 1
                    ? `Sem resposta do ERP — tentando novamente (${tentativaAtual} de ${TENTATIVAS_ERP})`
                    : 'Consultando movimentos no ERP'
              }
            />
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              <strong>Não foi possível comparar.</strong> {error.message}
            </AlertDescription>
          </Alert>
        ) : erroMovimentos ? (
          <Alert variant={erroMovimentos.indisponivel ? 'warning' : 'destructive'}>
            {erroMovimentos.indisponivel ? <CloudOff /> : <TriangleAlert />}
            <AlertDescription>
              {erroMovimentos.indisponivel ? (
                <>
                  <strong>ERP indisponível.</strong> Não deu para buscar os movimentos. Desmarque
                  as opções acima para ver a comparação pura entre as contagens, que não depende
                  do Ciclone.
                </>
              ) : (
                <>
                  <strong>Não foi possível buscar os movimentos.</strong> {erroMovimentos.message}
                </>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader className="gap-3 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle>Resultado</CardTitle>
                    <Badge variant="outline" className="text-xs font-normal">
                      {linhasFiltradas.length} produto{linhasFiltradas.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  {/* A linha de base tem que estar VISÍVEL no resultado: no primeiro
                      inventário ela é uma premissa digitada, não um dado do sistema, e é
                      o que separa o número correto do número inventado. */}
                  {primeiroInventario && invB ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Mala vazia em{' '}
                      <span className="font-medium text-foreground">{dataBr(dataBase)}</span>
                      <span className="px-1 text-foreground">→</span> {rotulo(invB)}
                    </p>
                  ) : (
                    invA &&
                    invB && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {rotulo(invA)} <span className="px-1 text-foreground">→</span>{' '}
                        {rotulo(invB)}
                      </p>
                    )
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:items-center lg:justify-end">
                  {/* Busca rápida */}
                  <SearchFilter
                    value={busca}
                    onChange={setBusca}
                    placeholder="Buscar produto..."
                    className="max-w-none sm:w-56"
                  />

                  <div className="flex items-center gap-2">
                    {/* Filtro de Linhas */}
                    <Select value={filtroLinha} onValueChange={setFiltroLinha}>
                      <SelectTrigger className="w-full font-normal sm:w-52">
                        <SelectValue />
                      </SelectTrigger>
                      {/*
                        Dois grupos, duas perguntas: "o que aconteceu com a contagem" e
                        "onde o dado pode estar ruim". Eram três grupos com onze opções,
                        e "Todos os produtos" morava sob *Origem da linha*, onde não é
                        origem de nada — agora é o padrão e fica solto no topo.

                        Saíram "Presentes em ambos" (é a maioria; o que interessa é o
                        complemento dela, que já são três opções) e "Com impacto em R$",
                        que só existia para dar destino ao card de concentração.
                      */}
                      <SelectContent>
                        <SelectItem value="todos">
                          Todos os produtos ({resumo.total})
                        </SelectItem>

                        <SelectGroup>
                          <SelectLabel>Divergência</SelectLabel>
                          <SelectItem value="com_diferenca">
                            Com diferença ({resumo.total - resumo.iguais})
                          </SelectItem>
                          <SelectItem value="falta">
                            Só faltas ({resumo.faltaItens})
                          </SelectItem>
                          <SelectItem value="sobra">
                            Só sobras ({resumo.sobraItens})
                          </SelectItem>
                          <SelectItem value="iguais">
                            Sem diferença ({resumo.iguais})
                          </SelectItem>
                        </SelectGroup>

                        <SelectGroup>
                          <SelectLabel>Casos a investigar</SelectLabel>
                          {/* Movimento no ERP sem contagem: existe nos dois modos. */}
                          <SelectItem value="so_movimento">
                            Só movimento ({resumo.soMovimento})
                          </SelectItem>
                          {/* Sem lado A, "só no A" devolveria sempre vazio e "só no B"
                              seria a contagem inteira: nada está em A. */}
                          {!primeiroInventario && (
                            <>
                              <SelectItem value="so_em_a">
                                Só no inventário A ({resumo.soEmA})
                              </SelectItem>
                              <SelectItem value="so_em_b">
                                Só no inventário B ({resumo.soEmB})
                              </SelectItem>
                            </>
                          )}
                          {resumo.semValor > 0 && (
                            <SelectItem value="sem_valor">
                              Sem valor cadastrado ({resumo.semValor})
                            </SelectItem>
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>

                    {/* Modo de leitura */}
                    <Select
                      value={modoTabela}
                      onValueChange={(v) => {
                        setModoTabela(v as 'resumido' | 'detalhado' | 'gestor');
                        // Entrar no gestor recomeça o drill-down. Guardar o caminho
                        // entre visitas devolveria o usuário a um recorte que ele não
                        // escolheu — e que pode nem existir na comparação atual.
                        if (v === 'gestor') {
                          setCaminhoGestor([]);
                          setSubmodoGestor('sintetico');
                        }
                      }}
                    >
                      <SelectTrigger className="w-full font-normal sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resumido">Resumido</SelectItem>
                        <SelectItem value="detalhado">Detalhado</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Botão Exportar Excel */}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={exportarExcel}
                      disabled={linhasFiltradas.length === 0}
                      aria-label="Exportar para Excel"
                      title="Exportar resultados para planilha Excel"
                      className="shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Resumo em faixa */}
              {/* Quatro colunas no desktop: com o quinto card fora, cada um ganhou 25%
                  de largura — que é o que faz as notas pararem de truncar. */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {tiles.map((t) => {
                  const ativo = !!t.filtro && filtroLinha === t.filtro;
                  const conteudo = (
                    <>
                      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t.rotulo}
                      </p>
                      <p className={`mt-0.5 text-xl font-bold tabular-nums ${t.cor ?? ''}`}>
                        {t.valor}
                      </p>
                      <p className="mt-0.5 truncate text-2xs text-muted-foreground">{t.nota}</p>
                    </>
                  );
                  // Seleção por BORDA, não por anel: o anel é do `:focus-visible` global e
                  // dois anéis na mesma peça viram a mesma coisa aos olhos.
                  const base =
                    'rounded-xl border px-4 py-3 text-left transition-colors ' +
                    (ativo
                      ? 'border-primary bg-muted/70'
                      : 'border-transparent bg-muted/50');
                  return t.filtro ? (
                    <button
                      key={t.rotulo}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setFiltroLinha(ativo ? 'todos' : t.filtro)}
                      title={ativo ? 'Remover o filtro' : `Filtrar por ${t.rotulo.toLowerCase()}`}
                      className={`${base} hover:bg-muted/70`}
                    >
                      {conteudo}
                    </button>
                  ) : (
                    <div key={t.rotulo} className={base}>
                      {conteudo}
                    </div>
                  );
                })}
              </div>

              {podeReconciliar && sinalFragmento && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    <strong>Possível contagem parcial.</strong>{' '}
                    {sinalFragmento === 'mesma-data'
                      ? 'A e B são do mesmo dia — nesse caso costumam ser fragmentos disjuntos da mesma contagem, não uma recontagem.'
                      : 'Existe outra contagem do mesmo vendedor na mesma data de A ou de B, o que sugere que a contagem foi fragmentada.'}{' '}
                    Reconciliar um fragmento contra os movimentos do período inteiro produz
                    divergência falsa. Se for o caso, junte os inventários na Conferência antes de
                    comparar.
                  </AlertDescription>
                </Alert>
              )}

              {/* Não vale no primeiro inventário: lá NADA está em A, por definição — o
                  aviso dispararia sempre e apontaria para uma causa que não existe. */}
              {!primeiroInventario && resumo.emAmbos === 0 && resumo.total > 0 && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    <strong>Nenhum produto em comum</strong> entre os dois inventários — costuma
                    indicar contagens parciais de faixas diferentes, não recontagens do mesmo
                    estoque. Nesse caso o que você quer pode ser juntar os dois na Conferência.
                  </AlertDescription>
                </Alert>
              )}

              {modoGestor ? (
                <PainelGestor
                  linhas={linhasParaGestor}
                  submodo={submodoGestor}
                  onSubmodo={setSubmodoGestor}
                  caminho={caminhoGestor}
                  onCaminho={setCaminhoGestor}
                  comEsperado={podeReconciliar}
                />
              ) : (
              <div className="overflow-hidden rounded-xl border border-border/80">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
                        <TableHead className="font-semibold">Produto</TableHead>
                        {detalhado && (
                          <>
                            <TableHead className="text-right font-semibold">Valor unit.</TableHead>
                            <TableHead className="text-right font-semibold">Qtd A</TableHead>
                            {podeReconciliar && (
                              <>
                                {considerarRemessas && (
                                  <TableHead className="text-right font-semibold">
                                    Remessa
                                  </TableHead>
                                )}
                                {considerarVendas && (
                                  <TableHead className="text-right font-semibold">Venda</TableHead>
                                )}
                                <TableHead className="text-right font-semibold">Esperado</TableHead>
                              </>
                            )}
                            <TableHead className="text-right font-semibold">Qtd B</TableHead>
                          </>
                        )}
                        <TableHead className="text-right font-semibold">
                          {podeReconciliar ? 'Dif. qtd (B − esperado)' : 'Dif. qtd (B − A)'}
                        </TableHead>
                        <TableHead className="text-right font-semibold">Dif. em R$</TableHead>
                        <TableHead className="text-center font-semibold">Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.length > 0 ? (
                        paginatedData.map((l) => (
                          <TableRow key={l.codigo_auxiliar}>
                            <TableCell className="py-3">
                              <span className="font-mono text-sm font-medium">
                                {l.codigo_auxiliar}
                              </span>
                              {l.nome_produto !== l.codigo_auxiliar && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {l.nome_produto}
                                </span>
                              )}
                            </TableCell>
                            {detalhado && (
                              <>
                                <TableCell className="text-right text-sm tabular-nums">
                                  {l.valor_unitario === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    moeda(l.valor_unitario)
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium tabular-nums">
                                  {l.quantidade_a}
                                </TableCell>
                                {podeReconciliar && (
                                  <>
                                    {considerarRemessas && (
                                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                        {l.remessa === 0 ? '—' : `+${l.remessa}`}
                                      </TableCell>
                                    )}
                                    {considerarVendas && (
                                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                        {l.venda === 0 ? '—' : `−${l.venda}`}
                                      </TableCell>
                                    )}
                                    <TableCell className="text-right font-medium tabular-nums">
                                      {l.esperado}
                                    </TableCell>
                                  </>
                                )}
                                <TableCell className="text-right font-medium tabular-nums">
                                  {l.quantidade_b}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-right">
                              <span
                                className={`font-bold tabular-nums ${detalhado ? '' : 'text-lg'} ${corDif(l.diferenca)}`}
                              >
                                {l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {l.diferenca === 0 || l.valor_unitario === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span
                                  className={`font-semibold tabular-nums ${detalhado ? '' : 'text-base'} ${corDif(l.diferenca)}`}
                                >
                                  {l.diferenca > 0 ? '+' : ''}
                                  {moeda(l.diferenca * l.valor_unitario)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {l.so_movimento ? (
                                <Badge variant="warning" className="px-2.5 py-0.5 text-2xs">
                                  Só movimento
                                </Badge>
                              ) : !l.presente_em_a ? (
                                <Badge variant="neutral" className="px-2.5 py-0.5 text-2xs">
                                  Só no B
                                </Badge>
                              ) : !l.presente_em_b ? (
                                <Badge variant="neutral" className="px-2.5 py-0.5 text-2xs">
                                  Só no A
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Em ambos</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={totalColunas} className="h-28 text-center">
                            <Minus className="mx-auto mb-2 size-7 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">
                              Nenhum produto encontrado com os filtros aplicados
                            </p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              )}

              {resumo.semValor > 0 && (
                <p className="text-xs text-muted-foreground">
                  {/* O número leva à lista. Antes dizia QUANTOS eram sem dizer QUAIS, e
                      quem quisesse ver tinha de descobrir a opção certa no seletor. */}
                  <button
                    type="button"
                    onClick={() => setFiltroLinha('sem_valor')}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    {resumo.semValor} produto(s)
                  </button>{' '}
                  sem valor cadastrado em Produtos — entram nas quantidades, mas contam como zero
                  nos totais em reais.
                </p>
              )}

              {/* O gestor não pagina: ele mostra o conjunto inteiro do recorte, e uma
                  paginação por baixo controlaria uma tabela que não está na tela. */}
              {!modoGestor && paginacao.totalPages > 1 && <Pagination {...paginacao} />}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
