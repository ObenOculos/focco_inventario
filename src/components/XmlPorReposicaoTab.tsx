import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  FileCode,
  FileSpreadsheet,
  ListChecks,
  Loader2,
  PackageSearch,
  RotateCcw,
  Search,
  Store,
  TriangleAlert,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { CaixaDeMarcacao } from '@/components/CaixaDeMarcacao';
import { FiltroCategorias } from '@/components/FiltroCategorias';
import { Pagination } from '@/components/Pagination';
import { PageLoader } from '@/components/PageLoader';
import { StatusInventarioBadge, rotuloStatusInventario } from '@/components/StatusInventarioBadge';

import { useIsMobile } from '@/hooks/use-mobile';
import { usePagination } from '@/hooks/usePagination';
import { useInventariosParaXmlQuery } from '@/hooks/useInventariosParaXmlQuery';
import { useCatalogoDeGradesQuery, useItensContadosQuery } from '@/hooks/useReposicaoMalaQuery';
import { useEstoqueInternoQuery } from '@/hooks/usePanoramaQuery';
import {
  casaComSelecao,
  SELECAO_VAZIA,
  type SelecaoCategorias,
} from '@/lib/categoriasProduto';
import {
  excedeDisponivel,
  filtrarReposicao,
  montarReposicao,
  podePedir,
  RECORTE_PADRAO,
  ROTULO_SITUACAO,
  selecaoInicial,
  semRuido,
  type FocoReposicao,
  type LinhaReposicao,
  type SituacaoLinha,
} from '@/lib/reposicaoMala';
import { exportarReposicaoExcel } from '@/lib/exportarReposicaoExcel';
import { downloadXml, downloadXmlsAsZip, gerarXmlRetornoCiclone, LOJAS } from '@/lib/gerarXmlCiclone';

/**
 * Reposição da mala — o estoque da loja e a contagem do representante, lado a lado.
 *
 * ## A leitura que a tela persegue
 *
 * O usuário faz DUAS perguntas no mesmo lugar: "o que mando para este representante" e
 * "esta contagem bate com o que a empresa acha que tem". A primeira versão só sabia
 * responder a primeira, e empurrava a segunda para uma segunda aba da planilha.
 *
 * Hoje a resposta vem em três alturas, da mais grossa para a mais fina:
 *
 * 1. **Faixa de indicadores** — quatro números que fecham a leitura sem rolar a página:
 *    o que repor, o que ele já tem, o que a loja não pode mandar, e o total contado.
 * 2. **Tabela, uma linha por SKU** — os dois números lado a lado (`Na loja` × `Na mala`)
 *    e um rótulo dizendo o que fazer. É a comparação que o usuário desenhou quando pediu
 *    "Produto | Estoque Ciclone | Inventário | Precisa pedir".
 * 3. **Rodapé** — o que virou pedido, e as duas saídas (planilha e XML).
 *
 * ## Tabela, e não cartão por modelo
 *
 * A versão anterior aninhava as cores dentro de um cartão por modelo. Fazia sentido
 * quando a tela só mostrava o que faltava — o cartão reduzia 1.298 linhas a 661. Deixou
 * de fazer quando o padrão passou a ser a LISTA COMPLETA: aninhamento é bom para decidir
 * uma grade e ruim para varrer e comparar, que é o que o usuário pediu. As cores do mesmo
 * modelo continuam adjacentes pela ordenação, então o contexto de grade não se perdeu.
 *
 * ## Uma loja só, e não "ambas"
 *
 * O pedido sai para UMA empresa, e o saldo que o justifica tem de ser o dela. Somar as
 * duas apoiaria a sugestão em mercadoria que está na outra loja. Hoje isso é ainda mais
 * direto: só a Loja 02 movimenta.
 */

/** Sentinela do `Select` — o Radix trata string vazia como "sem valor". */
const NENHUM = 'nenhum';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A cor de cada situação. `repor` é o único `warning` — é o que pede ação; o resto é
 * estado, não alerta. Pintar cinco badges de cinco cores diferentes transformaria a
 * coluna num arco-íris onde nada se destaca.
 */
const VARIANTE_SITUACAO: Record<SituacaoLinha, 'warning' | 'success' | 'neutral'> = {
  repor: 'warning',
  'na-mala': 'success',
  'sem-saldo': 'neutral',
  inativa: 'neutral',
  'nao-oculos': 'neutral',
};

interface Consulta {
  inventarioId: string;
  loja: number;
}

export function XmlPorReposicaoTab() {
  const { data: inventarios = [], isLoading: carregandoInventarios } =
    useInventariosParaXmlQuery();

  const [inventarioId, setInventarioId] = useState<string>(NENHUM);
  const [loja, setLoja] = useState<number>(LOJAS[LOJAS.length - 1].codigo);
  const [consulta, setConsulta] = useState<Consulta | null>(null);

  const [selecaoCategorias, setSelecaoCategorias] = useState<SelecaoCategorias>(SELECAO_VAZIA);
  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState(RECORTE_PADRAO);
  /** Código auxiliar → quantidade a repor. Estar no mapa é estar marcado. */
  const [selecao, setSelecao] = useState<Map<string, number>>(new Map());

  const [dialogAberto, setDialogAberto] = useState(false);
  const [tabela, setTabela] = useState<'venda' | 'remessa'>('remessa');
  const [segmentos, setSegmentos] = useState(1);
  const [gerando, setGerando] = useState(false);

  const mobile = useIsMobile();
  const inventario = inventarios.find((i) => i.id === consulta?.inventarioId) ?? null;

  const estoque = useEstoqueInternoQuery(
    consulta ? { empresas: [consulta.loja], nivel: 'produto' } : null
  );
  const catalogo = useCatalogoDeGradesQuery(!!consulta);
  const contagem = useItensContadosQuery(consulta?.inventarioId ?? null);

  // `isFetching`, nunca `isPending`: no react-query v5 uma consulta DESABILITADA fica em
  // `pending` para sempre, e o botão de consultar nasceria desabilitado sem nunca se
  // soltar — a tela inteira travada sem nenhum erro para explicar.
  const carregando = estoque.isFetching || catalogo.isFetching || contagem.isFetching;

  const reposicao = useMemo(() => {
    if (!estoque.data || !catalogo.data || !contagem.data) return null;
    return montarReposicao(estoque.data, catalogo.data, contagem.data);
  }, [estoque.data, catalogo.data, contagem.data]);

  // Toda linha `repor` nasce marcada com 1 — a sugestão é o ponto da tela, e obrigar a
  // marcar centenas de caixas antes de ver resultado inverteria o trabalho.
  useEffect(() => {
    if (!reposicao) return;
    setSelecao(selecaoInicial(reposicao.linhas));
    setSelecaoCategorias(SELECAO_VAZIA);
    setBusca('');
    setRecorte(RECORTE_PADRAO);
  }, [reposicao]);

  const todas = useMemo(() => reposicao?.linhas ?? [], [reposicao]);
  /**
   * A lista sem RUÍDO (acessório e cor morta), mas ainda sem o foco.
   *
   * É a base dos indicadores: contar "863 a repor" sobre a lista já focada em `repor`
   * daria sempre o total da tela, e o indicador deixaria de informar no instante em que
   * fosse usado.
   */
  const base = useMemo(() => semRuido(todas, recorte), [todas, recorte]);
  const recortadas = useMemo(
    () => filtrarReposicao(todas, recorte, selecao),
    [todas, recorte, selecao]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return recortadas.filter((l) => {
      if (!casaComSelecao(l, selecaoCategorias)) return false;
      if (!termo) return true;
      return (
        l.codigo_auxiliar.toLowerCase().includes(termo) ||
        l.nome_produto.toLowerCase().includes(termo) ||
        l.modelo.toLowerCase().includes(termo)
      );
    });
  }, [recortadas, selecaoCategorias, busca]);

  const { paginatedData, ...paginacao } = usePagination({ data: filtradas, itemsPerPage: 25 });

  /** Os quatro números da faixa, contados sobre `base` — ver o comentário dela. */
  const indicadores = useMemo(() => {
    const conta = (s: SituacaoLinha) => base.filter((l) => l.situacao === s);
    const repor = conta('repor');
    const naMala = conta('na-mala');
    const semSaldo = conta('sem-saldo');
    // Os contados são apurados sobre o RECORTE, como os outros três. Um contador
    // absoluto ao lado de três filtrados é a receita da confusão que esta tela já teve:
    // o usuário soma a coluna, acha menos que o indicador, e conclui que sumiu item. O
    // total do inventário viaja separado, como apoio, para a conferência continuar
    // possível.
    const contados = base.filter((l) => l.naMala > 0);
    const furados = base.filter((l) => l.cadastroFurado);
    return {
      repor: repor.length,
      naMala: naMala.length,
      unidadesNaMala: naMala.reduce((t, l) => t + l.naMala, 0),
      semSaldo: semSaldo.length,
      cadastro: furados.length,
      unidadesEmTerceiros: furados.reduce((t, l) => t + l.emTerceiro, 0),
      contados: contados.length,
      unidadesContadas: contados.reduce((t, l) => t + l.naMala, 0),
    };
  }, [base]);

  /**
   * O pedido: **tudo que está marcado**, filtro nenhum encolhe.
   *
   * ## Por que o filtro não recorta o pedido
   *
   * Filtrar é gesto de LEITURA; marcar é gesto de DECISÃO. Enquanto os dois
   * compartilhavam o mesmo controle, toda versão desta tela tinha um defeito: ou clicar
   * num indicador para conferir uma dúvida truncava o arquivo em silêncio, ou o rodapé
   * anunciava itens que não estavam na lista.
   *
   * A saída não foi escolher qual defeito doía menos — foi separar os dois gestos. O
   * filtro voltou a servir só para olhar, e a SELEÇÃO ficou inspecionável por conta
   * própria: `foco: 'pedido'` mostra na tabela exatamente o que vai no arquivo, e o
   * diálogo lista item por item antes de gerar. "O que eu vejo é o que eu mando" passou
   * a valer no momento em que importa — o de confirmar —, em vez de ficar refém de um
   * filtro que o usuário pôs por outro motivo.
   */
  const pedido = useMemo(() => {
    if (selecao.size === 0) return [] as { linha: LinhaReposicao; quantidade: number }[];
    return todas
      .filter((l) => selecao.has(l.codigo_auxiliar))
      .map((l) => ({ linha: l, quantidade: selecao.get(l.codigo_auxiliar)! }));
  }, [selecao, todas]);

  const vendoPedido = recorte.foco === 'pedido';

  /** Sempre sobre o pedido — o número do rodapé é o número do arquivo. */
  const totais = useMemo(() => {
    let unidades = 0;
    let valor = 0;
    for (const { linha, quantidade } of pedido) {
      unidades += quantidade;
      valor += quantidade * (tabela === 'remessa' ? linha.valor_remessa : linha.valor_produto);
    }
    return { itens: pedido.length, unidades, valor };
  }, [pedido, tabela]);

  const alternar = (codigo: string, marcado: boolean) => {
    setSelecao((atual) => {
      const proximo = new Map(atual);
      if (marcado) proximo.set(codigo, proximo.get(codigo) ?? 1);
      else proximo.delete(codigo);
      return proximo;
    });
  };

  const ajustarQuantidade = (codigo: string, valor: number) => {
    setSelecao((atual) => {
      const proximo = new Map(atual);
      // Abaixo de 1 a linha deixa de ser item de pedido; some da seleção em vez de virar
      // item de quantidade zero, que o Ciclone aceitaria calado.
      if (!Number.isFinite(valor) || valor < 1) proximo.delete(codigo);
      else proximo.set(codigo, Math.floor(valor));
      return proximo;
    });
  };

  const consultar = () => {
    if (inventarioId === NENHUM) return;
    setConsulta({ inventarioId, loja });
  };

  const handleExportar = () => {
    if (!consulta || !inventario) return;
    try {
      // `filtradas`, e não `recortadas`: o arquivo é o que está na tela, incluindo o
      // recorte por categoria e a busca.
      const arquivo = exportarReposicaoExcel(filtradas, {
        nomeVendedor: inventario.nome_vendedor,
        codigoVendedor: inventario.codigo_vendedor,
        loja: consulta.loja,
        dataInventario: format(new Date(inventario.data_inventario), 'dd/MM/yyyy'),
        selecao,
        tabela,
      });
      toast.success('Planilha gerada.', { description: arquivo });
    } catch (erro) {
      console.error(erro);
      toast.error('Falha ao gerar a planilha.', {
        description: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    }
  };

  const handleGerar = async () => {
    if (!consulta || !inventario) return;
    setGerando(true);
    try {
      const itens = pedido.map(({ linha, quantidade }) => ({
        codigo_auxiliar: linha.codigo_auxiliar,
        nome_produto: linha.nome_produto || linha.codigo_auxiliar,
        quantidade,
        valor_unitario: tabela === 'remessa' ? linha.valor_remessa : linha.valor_produto,
      }));

      if (itens.length === 0) {
        toast.error('Nenhum item marcado para repor.');
        return;
      }

      const pedidos = Math.min(Math.max(1, Math.min(10, segmentos)), itens.length);
      if (pedidos < segmentos) {
        toast.warning(`Só há ${itens.length} item(ns). Gerando ${pedidos} pedido(s).`);
      }

      const baldes: (typeof itens)[] = Array.from({ length: pedidos }, () => []);
      itens.forEach((item, i) => baldes[i % pedidos].push(item));

      const dataIso = new Date().toISOString().split('T')[0];
      const arquivos = baldes.map((balde, i) => {
        const xml = gerarXmlRetornoCiclone({
          codigoVendedor: inventario.codigo_vendedor,
          nomeVendedor: inventario.nome_vendedor,
          codigoLoja: consulta.loja,
          itens: balde,
          sequencia: pedidos > 1 ? i + 1 : undefined,
        });
        const sufixo = pedidos > 1 ? `-parte${i + 1}-de-${pedidos}` : '';
        return {
          nome: `reposicao-${tabela}-loja${consulta.loja}-${inventario.codigo_vendedor}${sufixo}-${dataIso}.xml`,
          conteudo: xml,
        };
      });

      if (pedidos > 1) {
        await downloadXmlsAsZip(
          arquivos,
          `reposicao-${tabela}-loja${consulta.loja}-${inventario.codigo_vendedor}-${pedidos}partes-${dataIso}.zip`
        );
        toast.success(`ZIP gerado com ${pedidos} XMLs.`);
      } else {
        downloadXml(arquivos[0].conteudo, arquivos[0].nome);
        toast.success('XML de reposição gerado.');
      }
      setDialogAberto(false);
    } catch (erro) {
      console.error(erro);
      toast.error('Falha ao gerar XML.', {
        description: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    } finally {
      setGerando(false);
    }
  };

  const erro = estoque.error ?? catalogo.error ?? contagem.error;

  return (
    <div className="space-y-6">
      {/* ── Escopo ─────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label
                htmlFor="reposicao-inventario"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Inventário do representante
              </Label>
              <Select
                value={inventarioId}
                onValueChange={setInventarioId}
                disabled={carregandoInventarios}
              >
                <SelectTrigger id="reposicao-inventario">
                  <SelectValue placeholder="Escolha a contagem" />
                </SelectTrigger>
                <SelectContent>
                  {inventarios.length === 0 && (
                    <SelectItem value={NENHUM} disabled>
                      Nenhum inventário registrado
                    </SelectItem>
                  )}
                  {inventarios.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.nome_vendedor} · {format(new Date(inv.data_inventario), 'dd/MM/yyyy')} ·{' '}
                      {inv.total_produtos} produtos · {rotuloStatusInventario(inv.status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="reposicao-loja"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Loja
              </Label>
              <Select value={String(loja)} onValueChange={(v) => setLoja(Number(v))}>
                <SelectTrigger id="reposicao-loja">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOJAS.map((l) => (
                    <SelectItem key={l.codigo} value={String(l.codigo)}>
                      {l.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={consultar}
              disabled={inventarioId === NENHUM || carregando}
              className="w-full lg:w-auto"
            >
              {carregando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageSearch className="h-4 w-4" />
              )}
              Consultar estoque
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            A loja vale para os dois lados: o saldo consultado é o dela, e é para ela que o
            pedido sai. O saldo vem do Ciclone na hora — a consulta leva alguns segundos.
          </p>
        </CardContent>
      </Card>

      {/* ── Resultado ──────────────────────────────────────────────────────────── */}
      {!consulta ? (
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <PackageSearch className="size-7" />
            </div>
            <p className="text-base font-semibold">Escolha o inventário e consulte</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              A tela põe o estoque da loja e a contagem do representante lado a lado, e marca o
              que cabe mandar para a mala.
            </p>
          </CardContent>
        </Card>
      ) : erro ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>Não foi possível montar a comparação: {erro.message}</AlertDescription>
        </Alert>
      ) : carregando || !reposicao ? (
        <Card>
          <PageLoader inline label="Consultando o saldo da empresa" />
        </Card>
      ) : reposicao.graoDeModelo ? (
        /* Erro no lugar onde o dado apareceria, e não uma lista degradada: sem código
           auxiliar esta tela não distingue óculos de acessório nem casa cor com cor, e
           qualquer coisa que ela mostrasse seria plausível e errada. */
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            O ERP respondeu com o saldo por <strong>modelo</strong>, sem cor — esta tela precisa
            do saldo por <strong>código auxiliar</strong>. Sinal de que a rota{' '}
            <code className="font-mono text-xs">/estoque?nivel=produto</code> não está no ar:
            gateway não reiniciado, ou Edge Function{' '}
            <code className="font-mono text-xs">erp-consulta</code> desatualizada.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <FaixaIndicadores
            indicadores={indicadores}
            contagem={reposicao.contagem}
            inventario={inventario}
            foco={recorte.foco}
            onFoco={(f) => setRecorte((r) => ({ ...r, foco: r.foco === f ? null : f }))}
          />

          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle>
                    {paginacao.totalItems} {paginacao.totalItems === 1 ? 'produto' : 'produtos'}
                  </CardTitle>
                  <span className="text-xs font-normal text-muted-foreground">
                    de {todas.length} no cruzamento
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-sm flex-1">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={18}
                  />
                  <Input
                    id="reposicao-busca"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar código, modelo ou nome"
                    className="pl-10"
                  />
                </div>
                <FiltroCategorias
                  linhas={recortadas}
                  selecao={selecaoCategorias}
                  onSelecao={setSelecaoCategorias}
                  quantidadeDa={(l: LinhaReposicao) => Math.max(0, l.saldoLoja)}
                />

                {/* Piso de saldo. Fica nesta barra, e não entre as caixas de marcação,
                    porque não é uma escolha binária de ruído — é um número que o usuário
                    calibra. Entra no mesmo recorte delas, então os indicadores acompanham. */}
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="reposicao-estoque-minimo"
                    className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Estoque mínimo
                  </Label>
                  <Input
                    id="reposicao-estoque-minimo"
                    type="number"
                    min={0}
                    step={1}
                    value={recorte.estoqueMinimo || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setRecorte((r) => ({
                        ...r,
                        estoqueMinimo: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0,
                      }));
                    }}
                    className="w-24 text-right tabular-nums"
                  />
                </div>
              </div>

              {recorte.estoqueMinimo > 0 && (
                <p className="text-xs text-muted-foreground">
                  Mostrando só produtos com{' '}
                  <strong className="tabular-nums">{recorte.estoqueMinimo}</strong> ou mais peças
                  na loja. Os indicadores acima acompanham o piso, e quem está{' '}
                  <em>sem saldo</em> fica de fora por consequência.
                </p>
              )}

              {/* Só RUÍDO mora aqui. As duas caixas tiram o que quase nunca se quer ver —
                  acessório e cor morta — e por isso nascem marcadas.
                  
                  Escolher ASSUNTO ("o que repor", "o que já está na mala") é outra
                  natureza de recorte e mudou de lugar: virou clique no indicador, que já
                  mostra a contagem e usa exatamente as mesmas palavras da coluna
                  Situação. Antes havia uma caixa "Só o que falta" aqui, e ela era o
                  terceiro vocabulário para o mesmo conceito — o indicador dizia
                  "A repor", a coluna dizia "Repor" e a caixa dizia "falta". */}
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <CaixaDeMarcacao
                  marcado={recorte.soOculos}
                  onMarcado={(v) => setRecorte((r) => ({ ...r, soOculos: v }))}
                  descricao="Tira estojo, flanela, expositor e afins — não têm cadastro e não entram em pedido."
                >
                  Só óculos
                </CaixaDeMarcacao>
                <CaixaDeMarcacao
                  marcado={recorte.ocultarInativas}
                  onMarcado={(v) => setRecorte((r) => ({ ...r, ocultarInativas: v }))}
                  descricao="Cores inativadas no Ciclone. Ainda podem ter saldo, mas não se pede grade morta."
                >
                  Ocultar inativos
                </CaixaDeMarcacao>
              </div>

              {paginacao.totalItems === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <PackageSearch className="size-7" />
                  </div>
                  <p className="text-base font-semibold">Nenhum produto no recorte atual</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {recorte.foco === 'pedido'
                      ? 'Nenhum item marcado passa pelos outros filtros. O pedido continua inteiro — limpe os filtros para vê-lo.'
                      : recorte.foco
                        ? 'Nenhum produto neste indicador com os filtros atuais.'
                        : 'As caixas de marcação e os filtros deixaram a lista vazia.'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setSelecaoCategorias(SELECAO_VAZIA);
                      setBusca('');
                      setRecorte(RECORTE_PADRAO);
                    }}
                  >
                    Voltar ao padrão
                  </Button>
                </div>
              ) : (
                <>
                  {mobile ? (
                    <div className="space-y-2">
                      {paginatedData.map((l) => (
                        <CartaoProduto
                          key={l.codigo_auxiliar}
                          linha={l}
                          quantidade={selecao.get(l.codigo_auxiliar)}
                          onAlternar={alternar}
                          onQuantidade={ajustarQuantidade}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/80">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Produto
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Na loja
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Na mala
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Situação
                            </TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Repor
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((l) => (
                            <LinhaProduto
                              key={l.codigo_auxiliar}
                              linha={l}
                              quantidade={selecao.get(l.codigo_auxiliar)}
                              onAlternar={alternar}
                              onQuantidade={ajustarQuantidade}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {paginacao.totalPages > 1 && <Pagination {...paginacao} unidade="produtos" />}
                </>
              )}
            </CardContent>
          </Card>

          {/* Resumo e ação. Fora do `if` da lista vazia de propósito: sem nada a repor, é
              aqui que mora o botão de exportar a comparação. */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
              <div className="text-sm">
                <p className="font-semibold tabular-nums">
                  {totais.itens} {totais.itens === 1 ? 'item' : 'itens'} · {totais.unidades}{' '}
                  {totais.unidades === 1 ? 'unidade' : 'unidades'} no pedido
                </p>
                <p className="text-xs text-muted-foreground">
                  {moeda(totais.valor)} pela tabela de {tabela === 'remessa' ? 'remessa' : 'venda'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* O pedido deixou de ser um número no rodapé e virou algo que se ABRE.
                    É isto que dispensa avisar "N marcados estão fora do filtro": em vez
                    de descrever a diferença entre a lista e a seleção, a tela deixa ver
                    a seleção. */}
                <Button
                  variant={vendoPedido ? 'default' : 'ghost'}
                  onClick={() =>
                    setRecorte((r) => ({ ...r, foco: r.foco === 'pedido' ? null : 'pedido' }))
                  }
                  disabled={totais.itens === 0}
                  aria-pressed={vendoPedido}
                >
                  <ListChecks className="h-4 w-4" />
                  {vendoPedido ? 'Vendo o pedido' : 'Ver o pedido'}
                </Button>
                <Button
                  variant="ghost"
                  // `base`, e não `todas`: se o usuário pôs piso de 5, restaurar não
                  // pode remarcar os que ele acabou de excluir do escopo. O `foco` fica
                  // de fora porque é leitura, não escopo.
                  onClick={() => setSelecao(selecaoInicial(base))}
                  disabled={base.length === 0}
                >
                  <RotateCcw className="h-4 w-4" />
                  Restaurar sugestão
                </Button>
                {/* Planilha e XML têm escopos DIFERENTES de propósito: a planilha é uma
                    foto do que está na tela, o pedido é o conjunto de decisões. Por isso
                    o título do botão diz qual é qual — a assimetria é certa, mas não é
                    adivinhável. */}
                <Button
                  variant="outline"
                  onClick={handleExportar}
                  disabled={filtradas.length === 0}
                  title={`Exporta os ${filtradas.length} produtos visíveis na tela — a planilha é uma foto da leitura, o XML é o pedido`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel
                </Button>
                <Button onClick={() => setDialogAberto(true)} disabled={totais.itens === 0}>
                  <FileCode className="h-4 w-4" />
                  Gerar XML de reposição
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={dialogAberto}
        onOpenChange={(aberto) => {
          if (!gerando) setDialogAberto(aberto);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Gerar XML de reposição
            </DialogTitle>
            <DialogDescription>
              Pedido de <strong>{totais.itens}</strong> {totais.itens === 1 ? 'item' : 'itens'} (
              {totais.unidades} un.) para <strong>{inventario?.nome_vendedor}</strong> na{' '}
              {LOJAS.find((l) => l.codigo === consulta?.loja)?.nome}. Gerar apenas produz o
              arquivo — não altera o inventário nem registra nada no Ciclone.
            </DialogDescription>
          </DialogHeader>

          {/* A revisão item a item, no ponto de confirmar.
              É aqui que "o que eu vejo é o que eu mando" passa a valer de verdade: não
              preso ao filtro que o usuário deixou ligado por outro motivo, mas ao
              conteúdo real do arquivo, no segundo antes de gerá-lo. */}
          <div className="rounded-xl border border-border/80">
            <p className="border-b border-border/80 bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              O que vai no arquivo
            </p>
            <div className="max-h-52 overflow-y-auto">
              {pedido.map(({ linha, quantidade }) => (
                <div
                  key={linha.codigo_auxiliar}
                  className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs">{linha.codigo_auxiliar}</span>
                    <span className="ml-2 text-2xs text-muted-foreground">
                      {linha.nome_produto}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">{quantidade} un</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Tabela de Preço</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={tabela === 'venda' ? 'default' : 'outline'}
                onClick={() => setTabela('venda')}
              >
                Venda
              </Button>
              <Button
                type="button"
                variant={tabela === 'remessa' ? 'default' : 'outline'}
                onClick={() => setTabela('remessa')}
              >
                Remessa
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Reposição de mala costuma sair por <strong>remessa</strong> — é mercadoria indo
              para poder de terceiro, não uma venda.
            </p>
          </div>

          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Segmentar em quantos pedidos?</p>
            <Select value={String(segmentos)} onValueChange={(v) => setSegmentos(Number(v))}>
              <SelectTrigger id="reposicao-segmentos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? '1 pedido (sem segmentação)' : `${n} pedidos`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={handleGerar} disabled={gerando}>
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCode className="h-4 w-4" />
            )}
            Gerar arquivo
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────── */

interface Indicadores {
  repor: number;
  naMala: number;
  unidadesNaMala: number;
  semSaldo: number;
  cadastro: number;
  unidadesEmTerceiros: number;
  contados: number;
  unidadesContadas: number;
}

/**
 * Os quatro números que fecham a leitura — e o filtro da tela.
 *
 * Cada quadro é um BOTÃO que recorta a lista. Isso substituiu uma caixa de marcação
 * "Só o que falta", que era o terceiro nome para a mesma coisa: o indicador contava
 * "A repor", a coluna rotulava "Repor" e a caixa dizia "falta". Um controle que já
 * mostra o número e usa a palavra da coluna dispensa os outros dois.
 *
 * As opções são mutuamente excludentes de propósito — ninguém pergunta "o que repor e o
 * que já está na mala" ao mesmo tempo. Clicar no quadro aceso desliga o foco.
 *
 * ## Três quadros que somam, e uma faixa que atravessa
 *
 * Os três quadros PARTICIONAM a lista: todo produto visível é exatamente um deles, e a
 * ordem é a da decisão — o que fazer (Repor), o que já está resolvido (Já na mala), o
 * que não dá para resolver aqui (Sem saldo).
 *
 * **Saldo negativo não é um quarto quadro**, e a diferença custou uma pergunta do
 * usuário para ficar clara: "Sem saldo" é um ESTADO do produto na decisão de pedido,
 * enquanto "cadastro furado" é um DEFEITO do dado que convive com qualquer um dos três —
 * um item pode estar na mala E com saldo negativo. Como quarto quadro, ele quebrava a
 * soma: três caixas fechando o total e uma sobrepondo faz o usuário desconfiar do
 * conjunto inteiro. Virou faixa própria, começando por "também".
 *
 * O total contado também não é quadro: não é recorte, é o denominador — mora na linha de
 * contexto, junto do nome do representante.
 */
function FaixaIndicadores({
  indicadores,
  contagem,
  inventario,
  foco,
  onFoco,
}: {
  indicadores: Indicadores;
  contagem: { produtos: number; unidades: number };
  inventario: { nome_vendedor: string; data_inventario: string; status: string } | null;
  foco: FocoReposicao | null;
  onFoco: (f: FocoReposicao) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {inventario && <p className="text-sm font-semibold">{inventario.nome_vendedor}</p>}
            <p className="text-xs text-muted-foreground">
              contou <strong className="tabular-nums">{contagem.produtos}</strong> produtos ·{' '}
              <strong className="tabular-nums">{contagem.unidades}</strong> unidades
              {indicadores.contados !== contagem.produtos && (
                <>
                  {' '}(<span className="tabular-nums">{indicadores.contados}</span> visíveis nos
                  filtros atuais)
                </>
              )}
            </p>
          </div>
          {inventario && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {format(new Date(inventario.data_inventario), 'dd/MM/yyyy')}
              </span>
              <StatusInventarioBadge status={inventario.status} />
            </div>
          )}
        </div>

        {/* TRÊS quadros, e eles PARTICIONAM a lista: todo produto visível é exatamente
            um dos três. É o que faz a soma fechar e o usuário poder confiar nos números.
            "Cadastro furado" ficou de fora daqui de propósito — ver o bloco abaixo. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Indicador
            rotulo="A repor"
            valor={indicadores.repor}
            apoio="faltam na mala e a loja tem saldo"
            tom="acao"
            ativo={foco === 'repor'}
            onClick={() => onFoco('repor')}
          />
          <Indicador
            rotulo="Já na mala"
            valor={indicadores.naMala}
            apoio={`${indicadores.unidadesNaMala} unidades contadas`}
            tom="neutro"
            ativo={foco === 'na-mala'}
            onClick={() => onFoco('na-mala')}
          />
          <Indicador
            rotulo="Sem saldo na loja"
            valor={indicadores.semSaldo}
            apoio="faltam, e a loja não tem para mandar"
            tom="neutro"
            ativo={foco === 'sem-saldo'}
            onClick={() => onFoco('sem-saldo')}
          />
        </div>

        {/* O saldo negativo ATRAVESSA os três acima — um produto pode estar na mala do
            representante E com o cadastro furado na loja. Por isso ele não é um quarto
            quadro: quatro caixas em que três somam e uma sobrepõe é uma soma que não
            fecha, e o usuário perde a confiança no conjunto todo. Fica numa faixa
            própria, com a palavra "também", que é o que ela é. */}
        {indicadores.cadastro > 0 && (
          <button
            type="button"
            onClick={() => onFoco('cadastro')}
            aria-pressed={foco === 'cadastro'}
            className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-destructive/30 bg-destructive-subtle p-3 text-left transition-colors hover:bg-destructive-subtle/70 ${
              foco === 'cadastro' ? 'ring-2 ring-ring ring-offset-1' : ''
            }`}
          >
            <TriangleAlert className="h-4 w-4 shrink-0 text-destructive-strong" aria-hidden />
            <span className="text-sm text-destructive-strong">
              <strong className="tabular-nums">{indicadores.cadastro}</strong> destes produtos
              também estão com <strong>saldo negativo</strong> na loja — saiu mais do que o
              cadastro registrou.
            </span>
            <span className="text-2xs text-muted-foreground">
              Não é ruptura: há{' '}
              <span className="tabular-nums">{indicadores.unidadesEmTerceiros}</span> unidades
              deles em poder de terceiros.
            </span>
          </button>
        )}

        <p className="text-2xs text-muted-foreground">
          {foco === 'pedido'
            ? 'Mostrando só o que está marcado para o pedido — o botão “Ver o pedido”, no rodapé, desliga.'
            : foco
              ? 'Filtrando a lista — clique de novo no mesmo lugar para ver tudo.'
              : 'Os três primeiros somam a lista inteira; clique num deles para filtrar.'}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Um quadro da faixa.
 *
 * `tom` separa três papéis: `acao` é o que pede trabalho, `alerta` é o que está errado
 * no ERP, `neutro` é estado. Só dois quadros podem ganhar cor ao mesmo tempo, o que
 * mantém o destaque significando alguma coisa — quatro quadros coloridos não destacariam
 * nada.
 */
function Indicador({
  rotulo,
  valor,
  apoio,
  tom,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: number;
  apoio: string;
  tom: 'acao' | 'alerta' | 'neutro';
  ativo: boolean;
  onClick: () => void;
}) {
  const cor =
    tom === 'acao'
      ? { borda: 'border-warning/30 bg-warning-subtle', texto: 'text-warning-strong' }
      : tom === 'alerta'
        ? { borda: 'border-destructive/30 bg-destructive-subtle', texto: 'text-destructive-strong' }
        : { borda: 'border-border/80', texto: 'text-foreground' };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-xl border p-3 text-left transition-colors hover:bg-accent/60 ${cor.borda} ${
        // O estado ligado é ANEL, não fundo: o fundo já carrega o tom do indicador, e
        // trocá-lo apagaria a diferença entre "é a ação" e "está selecionado".
        ativo ? 'ring-2 ring-ring ring-offset-1' : ''
      }`}
    >
      <span
        className={`block text-xs font-semibold uppercase tracking-wider ${
          tom === 'neutro' ? 'text-muted-foreground' : cor.texto
        }`}
      >
        {rotulo}
      </span>
      <span className={`mt-1 block text-2xl font-bold tabular-nums ${cor.texto}`}>
        {valor}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">produtos</span>
      </span>
      <span className="mt-0.5 block text-2xs text-muted-foreground">{apoio}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────── */

interface LinhaProps {
  linha: LinhaReposicao;
  quantidade: number | undefined;
  onAlternar: (codigo: string, marcado: boolean) => void;
  onQuantidade: (codigo: string, valor: number) => void;
}

/** O saldo da loja com o contexto que ele esconde quando é zero ou negativo. */
function SaldoDaLoja({ linha }: { linha: LinhaReposicao }) {
  return (
    <>
      <span
        className={`tabular-nums ${linha.cadastroFurado ? 'font-semibold text-destructive-strong' : ''}`}
      >
        {linha.saldoLoja}
      </span>
      {/* O "em malas" só aparece onde a pergunta nasce: saldo zero ou negativo com
          dezenas de unidades em poder de representantes. Em linha com saldo positivo
          seria ruído. */}
      {linha.saldoLoja <= 0 && linha.emTerceiro > 0 && (
        <span className="block text-2xs text-muted-foreground">
          <span className="tabular-nums">{linha.emTerceiro}</span> em malas
        </span>
      )}
      {linha.saldoLoja > 0 && linha.disponivel !== linha.saldoLoja && (
        <span className="block text-2xs text-muted-foreground">
          <span className="tabular-nums">{linha.disponivel}</span> livre
        </span>
      )}
    </>
  );
}

function Situacao({ linha }: { linha: LinhaReposicao }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={VARIANTE_SITUACAO[linha.situacao]}>{ROTULO_SITUACAO[linha.situacao]}</Badge>
      {/* Badge separado, e não outro valor de situação: saldo negativo convive com
          qualquer uma delas, e fundir os dois esconderia um dos achados. */}
      {linha.cadastroFurado && <Badge variant="destructive">saldo negativo</Badge>}
    </div>
  );
}

function ControleRepor({ linha, quantidade, onAlternar, onQuantidade }: LinhaProps) {
  const pedivel = podePedir(linha);
  const marcado = quantidade !== undefined;
  const id = `repor-${linha.codigo_auxiliar}`;

  // Sem caixa nem campo, em vez de desabilitados: um controle desabilitado promete que
  // existe um jeito de habilitá-lo, e aqui não existe — a loja não tem o que mandar.
  if (!pedivel) {
    return <span className="text-2xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Checkbox
        id={id}
        checked={marcado}
        onCheckedChange={(v) => onAlternar(linha.codigo_auxiliar, v === true)}
        aria-label={`Repor ${linha.codigo_auxiliar}`}
      />
      <Input
        type="number"
        min={0}
        step={1}
        aria-label={`Quantidade a repor de ${linha.codigo_auxiliar}`}
        value={quantidade ?? ''}
        placeholder="0"
        onChange={(e) => onQuantidade(linha.codigo_auxiliar, Number(e.target.value))}
        className="w-20 text-right tabular-nums"
      />
    </div>
  );
}

function LinhaProduto(props: LinhaProps) {
  const { linha, quantidade } = props;
  const excede = quantidade !== undefined && excedeDisponivel(linha, quantidade);
  const secundaria = linha.situacao === 'inativa' || linha.situacao === 'nao-oculos';

  return (
    <TableRow className={secundaria ? 'bg-muted/30 text-muted-foreground' : undefined}>
      <TableCell className="py-3">
        <span className="font-mono text-sm font-medium">{linha.codigo_auxiliar}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {linha.nome_produto}
          {(linha.cor_nome || linha.cor) && ` · ${linha.cor_nome || linha.cor}`}
        </span>
      </TableCell>
      <TableCell className="py-3 text-right">
        <SaldoDaLoja linha={linha} />
      </TableCell>
      <TableCell className="py-3 text-right tabular-nums">
        {linha.naMala > 0 ? linha.naMala : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-3">
        <Situacao linha={linha} />
      </TableCell>
      <TableCell className="py-3 text-right">
        <ControleRepor {...props} />
        {excede && (
          <p className="mt-1 text-2xs text-warning-strong">
            só <span className="tabular-nums">{linha.disponivel}</span> disponível
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** No mobile a tabela de cinco colunas vira cartão, como manda o DESIGN_SYSTEM. */
function CartaoProduto(props: LinhaProps) {
  const { linha, quantidade } = props;
  const excede = quantidade !== undefined && excedeDisponivel(linha, quantidade);
  const secundaria = linha.situacao === 'inativa' || linha.situacao === 'nao-oculos';

  return (
    <div
      className={`rounded-xl border border-border/80 p-3 ${
        secundaria ? 'bg-muted/30 text-muted-foreground' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">{linha.codigo_auxiliar}</p>
          <p className="truncate text-xs text-muted-foreground">
            {linha.nome_produto}
            {(linha.cor_nome || linha.cor) && ` · ${linha.cor_nome || linha.cor}`}
          </p>
        </div>
        <Situacao linha={linha} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Na loja</p>
            <SaldoDaLoja linha={linha} />
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Na mala</p>
            <span className="tabular-nums">
              {linha.naMala > 0 ? linha.naMala : <span className="text-muted-foreground">—</span>}
            </span>
          </div>
        </div>
        <ControleRepor {...props} />
      </div>

      {excede && (
        <p className="mt-2 text-2xs text-warning-strong">
          só <span className="tabular-nums">{linha.disponivel}</span> disponível na loja
        </p>
      )}
    </div>
  );
}
