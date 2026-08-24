import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmentado } from '@/components/comparativo/Segmentado';
import { ChevronRight, CloudOff, Home, Package, Search } from 'lucide-react';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { empresasDaEscolha, type EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';
import {
  useEntradasProdutoQuery,
  useEntradasQuery,
  useSaidasProdutoQuery,
  useSaidasQuery,
  type Lente,
  type LinhaPanorama,
  type ParametrosPanorama,
} from '@/hooks/usePanoramaQuery';
import {
  agrupar,
  agruparPorProduto,
  comEixoNoTopo,
  eixoDe,
  EIXOS_DA_LENTE,
  filtrarPeloCaminho,
  MEDIDAS,
  ORDEM_PADRAO,
  recorteDoCaminho,
  serieMensal,
  somar,
  type EixoId,
  type Medida,
  type NoAgregado,
} from '@/lib/panorama';

/**
 * Panorama — a leitura gerencial da movimentação, ao lado da Consulta ao ERP.
 *
 * As duas telas bebem da mesma fonte e respondem perguntas opostas. A Consulta é
 * AUDITORIA: cada linha de nota, para achar operação emitida errada. Esta é
 * ANÁLISE: quanto entrou, quanto saiu, de quê e por quê — e por isso o que atravessa
 * a rede já vem somado pelo Postgres. Juntar as duas numa tela só pioraria as duas,
 * porque o formato do dado é diferente antes de a interface começar.
 *
 * Como se lê, de cima para baixo:
 *
 *   1. **Parâmetros** — a única parte que custa uma ida ao ERP. Dispara no clique.
 *   2. **Indicadores** — os totais do recorte aberto, não do período inteiro: eles
 *      acompanham o drill-down, senão a tela mostraria um número que não é o da
 *      lista logo abaixo.
 *   3. **Série mensal** — quando o volume aconteceu.
 *   4. **Árvore** — um nível por vez, na ordem que o gestor escolher, até o produto.
 *
 * Quantidade e valor nunca se misturam num mesmo número: a medida ativa é uma só, e
 * trocá-la reordena a lista. É de propósito — a bonificação lidera em unidades e
 * some em valor, e é essa troca de posição que responde "onde está o dinheiro"
 * contra "onde está o volume".
 *
 * As duas lentes (Saídas e Entradas) usam a MESMA máquina de `lib/panorama.ts`. O
 * que muda entre elas são os eixos disponíveis — e o vocabulário: "tipo de saída"
 * de um lado, "tipo de entrada" e "origem" do outro.
 */

const HOJE = new Date();
const FORMATO_ISO = 'yyyy-MM-dd';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const LENTES: { valor: Lente; rotulo: string }[] = [
  { valor: 'saidas', rotulo: 'Saídas' },
  { valor: 'entradas', rotulo: 'Entradas' },
];

/** Formata na medida ativa. É o único lugar que decide como cada grandeza aparece. */
const formatar = (valor: number, medida: Medida) =>
  medida === 'valor' ? MOEDA.format(valor) : INTEIRO.format(valor);

const mesCurto = (iso: string) => {
  try {
    return format(parseISO(iso), 'MMM/yy');
  } catch {
    return iso;
  }
};

/** Cartão de indicador. Mesmo desenho do resumo do Comparativo — um só vocabulário. */
function Indicador({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio: string }) {
  return (
    <div className="min-w-[9rem] flex-1 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 shadow-xs">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="text-lg font-bold tabular-nums">{valor}</p>
      <p className="truncate text-2xs tabular-nums text-muted-foreground">{apoio}</p>
    </div>
  );
}

/**
 * Série mensal — colunas de uma série só.
 *
 * Uma série, uma cor: colorir cada mês de um tom diferente dobraria a codificação da
 * altura na matiz e gastaria o único canal livre com informação que a barra já dá.
 * A escala é a do maior mês do recorte, não a do período inteiro, para o desenho não
 * achatar ao descer na árvore.
 */
function SerieMensal({
  pontos,
  medida,
}: {
  pontos: { mes: string; quantidade: number; valor: number }[];
  medida: Medida;
}) {
  const maximo = Math.max(...pontos.map((p) => p[medida]), 0);
  if (pontos.length === 0 || maximo === 0) return null;

  return (
    <div className="flex items-end gap-[2px] sm:gap-1" role="img" aria-label="Movimentação por mês">
      {pontos.map((p) => {
        const fracao = p[medida] / maximo;
        return (
          <div key={p.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            {/* `title` é a camada de hover: o valor exato sem poluir a tela com um
                número por coluna, que ninguém lê. */}
            <div
              className="flex h-24 w-full items-end"
              title={`${mesCurto(p.mes)}: ${formatar(p[medida], medida)}`}
            >
              <div
                className="w-full rounded-t bg-primary transition-[height]"
                style={{ height: `${Math.max(fracao * 100, 2)}%` }}
              />
            </div>
            <span className="truncate text-2xs text-muted-foreground">{mesCurto(p.mes)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Linha da árvore: rótulo, barra de participação e as duas medidas.
 *
 * A barra é a MESMA cor em todas as linhas. Escurecer as maiores seria colorir por
 * ranking — a lista já está ordenada e a barra já mostra o tamanho.
 */
function LinhaNivel({
  no,
  medida,
  onAbrir,
}: {
  no: NoAgregado;
  medida: Medida;
  onAbrir?: () => void;
}) {
  const conteudo = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold">{no.rotulo}</span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {PORCENTAGEM.format(no.participacao)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${no.participacao * 100}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{formatar(no[medida], medida)}</p>
          <p className="text-2xs tabular-nums text-muted-foreground">
            {medida === 'valor' ? `${INTEIRO.format(no.quantidade)} un.` : MOEDA.format(no.valor)}
          </p>
        </div>
        {onAbrir && <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
      </div>
    </>
  );

  if (!onAbrir) {
    return <div className="flex items-center gap-4 px-3.5 py-3">{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-4 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-muted/30"
    >
      {conteudo}
    </button>
  );
}

export default function Panorama() {
  // ── Parâmetros (custam uma ida ao ERP) ────────────────────────────────────
  const [de, setDe] = useState(format(startOfMonth(subMonths(HOJE, 5)), FORMATO_ISO));
  const [ate, setAte] = useState(format(HOJE, FORMATO_ISO));
  const [empresa, setEmpresa] = useState<EscolhaEmpresa>('ambas');
  const [baseData, setBaseData] = useState<'movimento' | 'emissao'>('movimento');
  const [consulta, setConsulta] = useState<ParametrosPanorama | null>(null);

  // ── Leitura (instantânea, sobre o que já veio) ────────────────────────────
  const [lente, setLente] = useState<Lente>('saidas');
  const [medida, setMedida] = useState<Medida>('quantidade');
  const [ordem, setOrdem] = useState<EixoId[]>(ORDEM_PADRAO.saidas);
  const [caminho, setCaminho] = useState<string[]>([]);
  const [rotulos, setRotulos] = useState<string[]>([]);
  const [verProdutos, setVerProdutos] = useState(false);

  // As quatro consultas são declaradas sempre — hook não pode ser condicional. A
  // lente inativa recebe `null` e fica parada, sem tocar na rede.
  const paramSaidas = lente === 'saidas' ? consulta : null;
  const paramEntradas = lente === 'entradas' ? consulta : null;

  const saidas = useSaidasQuery(paramSaidas);
  const entradas = useEntradasQuery(paramEntradas);
  const ativa = lente === 'saidas' ? saidas : entradas;

  const linhas: LinhaPanorama[] = useMemo(() => ativa.data ?? [], [ativa.data]);
  const { isLoading, isFetching, error } = ativa;

  const doRecorte = useMemo(
    () => filtrarPeloCaminho(linhas, ordem, caminho),
    [linhas, ordem, caminho]
  );

  const totais = useMemo(() => somar(doRecorte), [doRecorte]);
  const serie = useMemo(() => serieMensal(doRecorte), [doRecorte]);

  const eixoAtual: EixoId | undefined = ordem[caminho.length];
  const nos = useMemo(
    () => (eixoAtual ? agrupar(doRecorte, eixoAtual, medida) : []),
    [doRecorte, eixoAtual, medida]
  );

  // A folha só é pedida quando há recorte: no topo, o "recorte" é o período inteiro e
  // a consulta voltaria com todos os produtos — a listagem imensa que este módulo
  // existe para evitar.
  const parametrosProduto: ParametrosPanorama | null =
    verProdutos && consulta && caminho.length > 0
      ? { ...consulta, ...recorteDoCaminho(doRecorte, lente) }
      : null;

  const produtosSaida = useSaidasProdutoQuery(lente === 'saidas' ? parametrosProduto : null);
  const produtosEntrada = useEntradasProdutoQuery(lente === 'entradas' ? parametrosProduto : null);
  const folha = lente === 'saidas' ? produtosSaida : produtosEntrada;

  // ⚠️ Obrigatório: o recorte enviado ao gateway é um SUPERCONJUNTO (as dimensões vão
  // como listas independentes e o servidor cruza todas). Reaplicar o caminho aqui é o
  // que devolve a exatidão — ver `recorteDoCaminho`.
  const nosProdutos = useMemo(() => {
    // Anotado como `LinhaPanorama[]` para colapsar a união `SaidaProduto[] |
    // EntradaProduto[]`: sem isso o genérico de `filtrarPeloCaminho` se prende ao
    // primeiro membro da união e recusa o outro.
    const linhasFolha: LinhaPanorama[] = folha.data ?? [];
    return agruparPorProduto(filtrarPeloCaminho(linhasFolha, ordem, caminho), medida);
  }, [folha.data, ordem, caminho, medida]);

  /** Volta a árvore para a raiz. Toda troca de lente, eixo ou consulta passa por aqui. */
  const recomecar = () => {
    setCaminho([]);
    setRotulos([]);
    setVerProdutos(false);
  };

  const consultar = () => {
    recomecar();
    setConsulta({
      de,
      ate,
      empresas: empresasDaEscolha(empresa),
      base_data: baseData,
    });
  };

  const trocarLente = (nova: Lente) => {
    setLente(nova);
    // A ordem volta ao padrão DA LENTE: os eixos não são os mesmos, e manter a ordem
    // anterior deixaria "Tipo de saída" no topo de uma árvore de entradas, onde ele
    // agrupa tudo em "Sem classificação".
    setOrdem(ORDEM_PADRAO[nova]);
    recomecar();
  };

  const descer = (no: NoAgregado) => {
    setCaminho((c) => [...c, no.chave]);
    // O rótulo viaja junto porque a chave nem sempre é legível: em "Origem" ela é o
    // código do cadastro, e a trilha mostraria um número.
    setRotulos((r) => [...r, no.rotulo]);
    setVerProdutos(false);
  };

  const voltarPara = (n: number) => {
    setCaminho((c) => c.slice(0, n));
    setRotulos((r) => r.slice(0, n));
    setVerProdutos(false);
  };

  const trocarTopo = (eixo: EixoId) => {
    setOrdem(comEixoNoTopo(ordem, eixo));
    recomecar();
  };

  const periodoInvalido = de > ate;
  const rotuloMovimento = lente === 'saidas' ? 'saíram' : 'entraram';

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Panorama"
          description="Movimentação somada no ERP: o que entrou, o que saiu, de quê e por qual motivo."
          isFetching={isFetching && !isLoading}
          action={
            <Segmentado
              nome="Lente"
              opcoes={LENTES}
              valor={lente}
              onValor={(v) => trocarLente(v)}
            />
          }
        />

        {/* 1. Parâmetros — a parte cara */}
        <Card className="rounded-2xl border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold tracking-tight">Período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="panorama-de">De</Label>
                <Input
                  id="panorama-de"
                  type="date"
                  value={de}
                  onChange={(e) => setDe(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="panorama-ate">Até</Label>
                <Input
                  id="panorama-ate"
                  type="date"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="panorama-empresa">Empresa</Label>
                <Select value={empresa} onValueChange={(v) => setEmpresa(v as EscolhaEmpresa)}>
                  <SelectTrigger id="panorama-empresa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambas">Ambas</SelectItem>
                    <SelectItem value="1">Empresa 1</SelectItem>
                    <SelectItem value="2">Empresa 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="panorama-base">Data base</Label>
                <Select
                  value={baseData}
                  onValueChange={(v) => setBaseData(v as 'movimento' | 'emissao')}
                >
                  <SelectTrigger id="panorama-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="movimento">Movimento da nota</SelectItem>
                    <SelectItem value="emissao">Emissão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={consultar}
                  disabled={periodoInvalido || isLoading}
                >
                  <Search className="h-4 w-4" />
                  {isLoading ? 'Consultando' : 'Consultar'}
                </Button>
              </div>
            </div>
            {periodoInvalido && (
              <p className="mt-3 text-sm text-destructive-strong">
                A data inicial não pode ser posterior à final.
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <CloudOff className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] min-w-[9rem] flex-1 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}

        {consulta && !isLoading && !error && linhas.length === 0 && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Package className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">
                Nenhuma movimentação de {lente === 'saidas' ? 'saída' : 'entrada'} no período.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Amplie o intervalo ou troque a empresa.
              </p>
            </CardContent>
          </Card>
        )}

        {!consulta && !isLoading && (
          <Card className="rounded-2xl border border-border/80 shadow-xs">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Search className="mb-2.5 h-11 w-11 text-muted-foreground/50" />
              <p className="text-sm font-medium">Escolha o período e consulte.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A consulta atravessa a VPN até o Ciclone — por isso ela só roda no clique.
              </p>
            </CardContent>
          </Card>
        )}

        {linhas.length > 0 && !isLoading && (
          <>
            {/* 2. Indicadores — do recorte aberto, não do período inteiro */}
            <div className="flex flex-wrap gap-3">
              <Indicador
                rotulo="Unidades"
                valor={INTEIRO.format(totais.quantidade)}
                apoio={`${INTEIRO.format(totais.linhas)} linhas de nota`}
              />
              <Indicador
                rotulo="Valor"
                valor={MOEDA.format(totais.valor)}
                apoio={
                  totais.quantidade > 0
                    ? `${MOEDA.format(totais.valor / totais.quantidade)} por unidade`
                    : '—'
                }
              />
              <Indicador
                rotulo="Meses"
                valor={INTEIRO.format(serie.length)}
                apoio={
                  serie.length > 0
                    ? `${mesCurto(serie[0].mes)} a ${mesCurto(serie[serie.length - 1].mes)}`
                    : '—'
                }
              />
            </div>

            {/* 3. Quando */}
            {serie.length > 1 && (
              <Card className="rounded-2xl border border-border/80 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    Quanto {rotuloMovimento} por mês · {medida === 'valor' ? 'valor' : 'unidades'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SerieMensal pontos={serie} medida={medida} />
                </CardContent>
              </Card>
            )}

            {/* 4. Árvore */}
            <Card className="rounded-2xl border border-border/80 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {verProdutos || !eixoAtual
                      ? 'Produtos'
                      : `Por ${eixoDe(eixoAtual).rotulo.toLowerCase()}`}
                  </CardTitle>
                  <Segmentado
                    nome="Medida"
                    opcoes={MEDIDAS}
                    valor={medida}
                    // Arrow, e não `setMedida` direto: passar o setter faz o
                    // `SetStateAction<Medida>` disputar a inferência de `T` com as
                    // opções, e o TypeScript alarga os dois para `string`.
                    onValor={(v) => setMedida(v)}
                    tamanho="sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Ordem de leitura: trocar o primeiro eixo é o que transforma a mesma
                    consulta em "por onde saiu cada marca" ou "que marcas cada tipo de
                    saída levou". Só faz sentido na raiz — no meio do caminho, mudaria
                    o significado dos passos já dados. */}
                {caminho.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Abrir por
                    </span>
                    {EIXOS_DA_LENTE[lente].map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={ordem[0] === id}
                        onClick={() => trocarTopo(id)}
                        className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                          ordem[0] === id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {eixoDe(id).rotulo}
                      </button>
                    ))}
                  </div>
                )}

                {/* Trilha — só navegação. O total do recorte tem um lugar só, os
                    indicadores acima. */}
                {caminho.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => voltarPara(0)}
                      aria-label="Voltar ao início"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    >
                      <Home size={14} />
                      Tudo
                    </button>
                    {caminho.map((chave, i) => {
                      const ultimo = i === caminho.length - 1;
                      return (
                        <span key={`${i}-${chave}`} className="flex items-center gap-1">
                          <ChevronRight size={14} className="text-muted-foreground" />
                          {ultimo ? (
                            <span className="rounded-lg px-2 py-1 font-semibold">
                              {rotulos[i] ?? chave}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => voltarPara(i + 1)}
                              className="rounded-lg px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                            >
                              {rotulos[i] ?? chave}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Níveis de categoria */}
                {eixoAtual && !verProdutos && (
                  <div className="divide-y divide-border/60">
                    {nos.map((no) => (
                      <LinhaNivel
                        key={no.chave}
                        no={no}
                        medida={medida}
                        onAbrir={() => descer(no)}
                      />
                    ))}
                  </div>
                )}

                {/* A folha. Uma ida a mais ao ERP, e por isso é pedida, nunca automática. */}
                {caminho.length > 0 && !verProdutos && (
                  <Button variant="outline" size="sm" onClick={() => setVerProdutos(true)}>
                    <Package className="h-4 w-4" />
                    Ver produtos deste recorte
                  </Button>
                )}

                {verProdutos && (
                  <>
                    {folha.isLoading && (
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-12 w-full rounded-xl" />
                        ))}
                      </div>
                    )}
                    {folha.error && (
                      <Alert variant="destructive">
                        <CloudOff className="h-4 w-4" />
                        <AlertDescription>{folha.error.message}</AlertDescription>
                      </Alert>
                    )}
                    {!folha.isLoading && !folha.error && (
                      <div className="divide-y divide-border/60">
                        {nosProdutos.length === 0 ? (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Nenhum produto neste recorte.
                          </p>
                        ) : (
                          nosProdutos.map((no) => (
                            <LinhaNivel key={no.chave} no={no} medida={medida} />
                          ))
                        )}
                      </div>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setVerProdutos(false)}>
                      Voltar às categorias
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
