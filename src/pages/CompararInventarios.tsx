import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { PageLoader } from '@/components/PageLoader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { SearchFilter } from '@/components/SearchFilter';
import { Pagination } from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useFiltroAno } from '@/hooks/useFiltroAno';
import { ArrowLeftRight, Download, GitCompare, Minus, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  useComparacaoQuery,
  useInventariosOpcoesQuery,
  type InventarioOpcao,
} from '@/hooks/useCompararInventariosQuery';

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
  const [vendedorFiltro, setVendedorFiltro] = useState<string>('todos');
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [filtroLinha, setFiltroLinha] = useState<string>('com_diferenca');

  const { data: opcoes = [], isLoading: carregandoOpcoes } = useInventariosOpcoesQuery();
  const {
    data: linhas = [],
    isLoading: carregandoComparacao,
    isFetching,
    error,
  } = useComparacaoQuery(idA || null, idB || null);

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

  const resumo = useMemo(() => {
    const emAmbos = linhas.filter((l) => l.presente_em_a && l.presente_em_b).length;
    const soEmA = linhas.filter((l) => l.presente_em_a && !l.presente_em_b).length;
    const soEmB = linhas.filter((l) => !l.presente_em_a && l.presente_em_b).length;
    const iguais = linhas.filter((l) => l.diferenca === 0).length;
    const somaA = linhas.reduce((acc, l) => acc + l.quantidade_a, 0);
    const somaB = linhas.reduce((acc, l) => acc + l.quantidade_b, 0);
    const valorA = linhas.reduce((acc, l) => acc + l.quantidade_a * l.valor_unitario, 0);
    const valorB = linhas.reduce((acc, l) => acc + l.quantidade_b * l.valor_unitario, 0);
    const semValor = linhas.filter((l) => l.valor_unitario === 0).length;
    return {
      total: linhas.length,
      emAmbos,
      soEmA,
      soEmB,
      iguais,
      somaA,
      somaB,
      valorA,
      valorB,
      valorDiferenca: valorB - valorA,
      semValor,
    };
  }, [linhas]);

  const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const linhasFiltradas = useMemo(() => {
    switch (filtroLinha) {
      case 'com_diferenca':
        return linhas.filter((l) => l.diferenca !== 0);
      case 'iguais':
        return linhas.filter((l) => l.diferenca === 0);
      case 'so_em_a':
        return linhas.filter((l) => l.presente_em_a && !l.presente_em_b);
      case 'so_em_b':
        return linhas.filter((l) => !l.presente_em_a && l.presente_em_b);
      case 'em_ambos':
        return linhas.filter((l) => l.presente_em_a && l.presente_em_b);
      default:
        return linhas;
    }
  }, [linhas, filtroLinha]);

  const { paginatedData, ...paginacao } = usePagination({
    data: linhasFiltradas,
    searchTerm: busca,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
    itemsPerPage: 20,
  });

  const exportarExcel = () => {
    if (linhasFiltradas.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const dados = linhasFiltradas.map((l) => ({
      'Código Auxiliar': l.codigo_auxiliar,
      'Nome Produto': l.nome_produto,
      'Valor Unitário': l.valor_unitario,
      'Quantidade A': l.quantidade_a,
      'Quantidade B': l.quantidade_b,
      'Diferença (B - A)': l.diferenca,
      'Valor A': l.quantidade_a * l.valor_unitario,
      'Valor B': l.quantidade_b * l.valor_unitario,
      'Valor da Diferença': l.diferenca * l.valor_unitario,
      Situação: !l.presente_em_a
        ? 'Só no inventário B'
        : !l.presente_em_b
          ? 'Só no inventário A'
          : l.diferenca === 0
            ? 'Igual'
            : 'Diferente',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativo');
    const nomeA = invA ? format(new Date(invA.data_inventario), 'dd-MM-yyyy') : 'A';
    const nomeB = invB ? format(new Date(invB.data_inventario), 'dd-MM-yyyy') : 'B';
    const fileName = `comparativo_${nomeA}_vs_${nomeB}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Arquivo ${fileName} baixado com sucesso.`);
  };

  const mesmoInventario = !!idA && idA === idB;
  const prontoParaComparar = !!idA && !!idB && !mesmoInventario;
  const vendedoresDiferentes =
    !!invA && !!invB && invA.codigo_vendedor !== invB.codigo_vendedor;

  /** Cor da divergência: positiva informativa, negativa em atenção. Escala divergente. */
  const corDif = (v: number) =>
    v > 0 ? 'text-info-strong' : v < 0 ? 'text-warning-strong' : 'text-muted-foreground';

  const tiles = [
    {
      rotulo: 'Produtos',
      valor: String(resumo.total),
      nota: `${resumo.emAmbos} em ambos · ${resumo.iguais} sem diferença`,
    },
    { rotulo: 'Só no A', valor: String(resumo.soEmA), nota: 'ausentes no B' },
    { rotulo: 'Só no B', valor: String(resumo.soEmB), nota: 'ausentes no A' },
    {
      rotulo: 'Diferença',
      valor: `${resumo.valorDiferenca > 0 ? '+' : ''}${moeda(resumo.valorDiferenca)}`,
      nota: `${resumo.somaA} → ${resumo.somaB} un. (${resumo.somaB - resumo.somaA >= 0 ? '+' : ''}${resumo.somaB - resumo.somaA})`,
      cor: corDif(resumo.valorDiferenca),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Comparar Inventários"
          description="Escolha dois inventários e veja a diferença entre as contagens"
          isFetching={isFetching && !carregandoComparacao}
        />

        {/* ── Bloco 1 · Seleção ─────────────────────────────────────────────────────
            Uma linha só a partir de `lg`. O botão de inverter fica entre A e B, onde a
            relação que ele altera está visível. */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            {/* Funil da esquerda para a direita: Ano → Vendedor → A → B. O ano é o recorte
                mais amplo, e por isso vem primeiro — que é o "acima" de um layout em linha. */}
            <div className="grid items-end gap-3 lg:grid-cols-[auto_minmax(0,0.85fr)_minmax(0,1.15fr)_auto_minmax(0,1.15fr)]">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ano
                </Label>
                <Select value={anoEfetivo} onValueChange={trocarAno} disabled={carregandoOpcoes}>
                  <SelectTrigger className="w-full lg:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((ano) => (
                      <SelectItem key={ano} value={ano}>
                        {ano}
                      </SelectItem>
                    ))}
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vendedor
                </Label>
                <Select value={vendedorFiltro} onValueChange={trocarVendedor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
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

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Inventário A · base
                </Label>
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
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={trocarLados}
                disabled={!idA && !idB}
                aria-label="Inverter A e B"
                className="w-full lg:w-11"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Inventário B · comparado
                </Label>
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

            {/* Avisos condicionais: nada ocupa espaço enquanto está tudo certo. */}
            {!carregandoOpcoes && opcoesFiltradas.length === 0 && (
              <p className="pt-2.5 text-xs text-muted-foreground">
                Nenhum inventário em <strong className="text-foreground">{anoEfetivo}</strong>
                {vendedorFiltro !== 'todos' && ' para este vendedor'}. Escolha outro ano ou
                selecione <strong className="text-foreground">Todos</strong>.
              </p>
            )}
            {mesmoInventario && (
              <p className="pt-2.5 text-xs font-medium text-destructive-strong">
                Escolha dois inventários diferentes.
              </p>
            )}
            {vendedoresDiferentes && (
              <p className="flex items-center gap-1.5 pt-2.5 text-xs font-medium text-warning-strong">
                <TriangleAlert className="size-3.5 shrink-0" />
                A e B são de vendedores diferentes — o comparativo raramente faz sentido.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Bloco 2 · Resultado ──────────────────────────────────────────────────── */}
        {!prontoParaComparar ? (
          <Card>
            <CardContent className="flex flex-col items-center px-6 py-20 text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <GitCompare className="size-7" />
              </div>
              <p className="text-base font-semibold">Nenhum comparativo ainda</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Escolha o inventário A e o B acima. O resultado aparece aqui, com o resumo e a
                diferença produto a produto.
              </p>
            </CardContent>
          </Card>
        ) : carregandoComparacao ? (
          <Card>
            <PageLoader inline label="Carregando comparativo" />
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              <strong>Não foi possível comparar.</strong> {error.message}
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader className="gap-3 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <CardTitle>Resultado</CardTitle>
                  {invA && invB && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {rotulo(invA)} <span className="px-1 text-foreground">→</span> {rotulo(invB)}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  <SearchFilter
                    value={busca}
                    onChange={setBusca}
                    placeholder="Buscar produto..."
                    className="max-w-none sm:w-56"
                  />
                  <div className="flex gap-2">
                    <Select value={filtroLinha} onValueChange={setFiltroLinha}>
                      <SelectTrigger className="w-full font-normal sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="com_diferenca">Com diferença</SelectItem>
                        <SelectItem value="todos">Todos os produtos</SelectItem>
                        <SelectItem value="iguais">Sem diferença</SelectItem>
                        <SelectItem value="em_ambos">Presentes em ambos</SelectItem>
                        <SelectItem value="so_em_a">Só no inventário A</SelectItem>
                        <SelectItem value="so_em_b">Só no inventário B</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={exportarExcel}
                      disabled={linhasFiltradas.length === 0}
                      aria-label="Exportar para Excel"
                      className="shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Resumo em faixa: quatro ladrilhos dentro do cartão, no lugar de quatro
                  cartões soltos. Some borda, sombra e o espaço entre eles. */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {tiles.map((t) => (
                  <div key={t.rotulo} className="rounded-xl bg-muted/50 px-4 py-3">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t.rotulo}
                    </p>
                    <p className={`mt-0.5 text-xl font-bold tabular-nums ${t.cor ?? ''}`}>
                      {t.valor}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-muted-foreground">{t.nota}</p>
                  </div>
                ))}
              </div>

              {resumo.emAmbos === 0 && resumo.total > 0 && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    <strong>Nenhum produto em comum</strong> entre os dois inventários — costuma
                    indicar contagens parciais de faixas diferentes, não recontagens do mesmo
                    estoque. Nesse caso o que você quer pode ser juntar os dois na Conferência.
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-hidden rounded-xl border border-border/80">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
                        <TableHead className="font-semibold">Produto</TableHead>
                        <TableHead className="text-right font-semibold">Valor unit.</TableHead>
                        <TableHead className="text-right font-semibold">Qtd A</TableHead>
                        <TableHead className="text-right font-semibold">Qtd B</TableHead>
                        {/* A fórmula mora aqui, onde é lida no momento em que importa —
                            e não num parágrafo permanente no topo da tela. */}
                        <TableHead className="text-right font-semibold">Dif. (B − A)</TableHead>
                        <TableHead className="text-right font-semibold">Valor da dif.</TableHead>
                        <TableHead className="text-center font-semibold">Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.length > 0 ? (
                        paginatedData.map((l) => (
                          // Sem tinta de fundo na linha: com o filtro padrão "com diferença",
                          // todas as linhas visíveis seriam tintas — o que não distingue nada.
                          // O número colorido já carrega o sinal.
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
                            <TableCell className="text-right font-medium tabular-nums">
                              {l.quantidade_b}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-bold tabular-nums ${corDif(l.diferenca)}`}>
                                {l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {l.diferenca === 0 || l.valor_unitario === 0 ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span
                                  className={`font-semibold tabular-nums ${corDif(l.diferenca)}`}
                                >
                                  {l.diferenca > 0 ? '+' : ''}
                                  {moeda(l.diferenca * l.valor_unitario)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {!l.presente_em_a ? (
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
                          <TableCell colSpan={7} className="h-28 text-center">
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

              {/* Nota de rodapé, não cartão próprio: é ressalva sobre os totais acima. */}
              {resumo.semValor > 0 && (
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{resumo.semValor}</strong> produto(s) sem
                  valor cadastrado em Produtos — entram nas quantidades, mas contam como zero nos
                  totais em reais.
                </p>
              )}

              {paginacao.totalPages > 1 && <Pagination {...paginacao} />}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
