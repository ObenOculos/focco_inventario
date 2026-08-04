import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { ArrowLeftRight, Download, GitCompare, Loader2, Minus } from 'lucide-react';
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

  const vendedores = useMemo(() => {
    const map = new Map<string, string>();
    opcoes.forEach((o) => {
      if (!map.has(o.codigo_vendedor)) map.set(o.codigo_vendedor, o.nome_vendedor);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [opcoes]);

  const opcoesFiltradas = useMemo(() => {
    if (vendedorFiltro === 'todos') return opcoes;
    return opcoes.filter((o) => o.codigo_vendedor === vendedorFiltro);
  }, [opcoes, vendedorFiltro]);

  const invA = opcoes.find((o) => o.id === idA) || null;
  const invB = opcoes.find((o) => o.id === idB) || null;

  const rotulo = (inv: InventarioOpcao) =>
    `${format(new Date(inv.data_inventario), 'dd/MM/yyyy HH:mm')} · ${inv.nome_vendedor} · ${inv.status}`;

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

  const moeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Comparar Inventários</h1>
            <p className="text-muted-foreground">
              Escolha dois inventários e veja a diferença entre as contagens
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !carregandoComparacao} />
        </div>

        <Card className="border border-border/80 rounded-2xl shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              Seleção
            </CardTitle>
            <CardDescription>
              Esta tela é apenas consulta: comparar não altera nem grava nada. A diferença é
              calculada como <strong>B − A</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-md">
              <Select value={vendedorFiltro} onValueChange={trocarVendedor}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Filtrar por vendedor" />
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
              <p className="text-xs text-muted-foreground pt-1.5">
                Comparar inventários de vendedores diferentes é permitido, mas raramente faz
                sentido. Filtre por vendedor para reduzir as listas.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Inventário A (base)</p>
                <Select value={idA} onValueChange={setIdA} disabled={carregandoOpcoes}>
                  <SelectTrigger className="h-11 rounded-xl">
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
                title="Trocar A e B"
                className="h-11 w-11 rounded-xl shrink-0"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </Button>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Inventário B (comparado)</p>
                <Select value={idB} onValueChange={setIdB} disabled={carregandoOpcoes}>
                  <SelectTrigger className="h-11 rounded-xl">
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

            {mesmoInventario && (
              <p className="text-xs text-destructive">
                Escolha dois inventários diferentes.
              </p>
            )}
          </CardContent>
        </Card>

        {!prontoParaComparar ? (
          <Card className="border border-border/80 rounded-2xl shadow-xs">
            <CardContent className="py-16 text-center">
              <GitCompare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">Escolha os dois inventários</p>
              <p className="text-sm text-muted-foreground">
                O comparativo aparece aqui depois da seleção.
              </p>
            </CardContent>
          </Card>
        ) : carregandoComparacao ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-8 w-8 animate-spin text-primary" />
            Carregando comparativo...
          </div>
        ) : error ? (
          <Card className="border border-destructive/40 bg-destructive/5 rounded-2xl">
            <CardContent className="py-10 text-center">
              <p className="font-medium mb-1 text-destructive">Não foi possível comparar</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border border-border/80 rounded-2xl shadow-2xs">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Produtos comparados
                  </p>
                  <p className="text-2xl font-bold">{resumo.total}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {resumo.emAmbos} em ambos · {resumo.iguais} sem diferença
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-border/80 rounded-2xl shadow-2xs">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Só no A
                  </p>
                  <p className="text-2xl font-bold">{resumo.soEmA}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    produtos ausentes no B
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-border/80 rounded-2xl shadow-2xs">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Só no B
                  </p>
                  <p className="text-2xl font-bold">{resumo.soEmB}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    produtos ausentes no A
                  </p>
                </CardContent>
              </Card>
              <Card className="border border-border/80 rounded-2xl shadow-2xs">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Diferença
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      resumo.valorDiferenca > 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : resumo.valorDiferenca < 0
                          ? 'text-orange-600 dark:text-orange-400'
                          : ''
                    }`}
                  >
                    {resumo.valorDiferenca > 0 ? '+' : ''}
                    {moeda(resumo.valorDiferenca)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {moeda(resumo.valorA)} → {moeda(resumo.valorB)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {resumo.somaA} → {resumo.somaB} un. (
                    {resumo.somaB - resumo.somaA >= 0 ? '+' : ''}
                    {resumo.somaB - resumo.somaA})
                  </p>
                </CardContent>
              </Card>
            </div>

            {resumo.semValor > 0 && (
              <Card className="border border-border/80 rounded-2xl">
                <CardContent className="py-3 text-xs text-muted-foreground">
                  <strong className="text-foreground">{resumo.semValor}</strong> produto(s) sem
                  valor cadastrado em Produtos — entram nas quantidades, mas contam como zero
                  nos totais em reais.
                </CardContent>
              </Card>
            )}

            {resumo.emAmbos === 0 && resumo.total > 0 && (
              <Card className="border border-amber-500/40 bg-amber-500/10 rounded-2xl">
                <CardContent className="py-3.5 text-sm">
                  <strong>Nenhum produto em comum</strong> entre os dois inventários. Isso
                  costuma indicar que são contagens parciais de faixas diferentes de produto, e
                  não recontagens do mesmo estoque — nesse caso o comparativo não é
                  significativo, e o que você quer pode ser juntar os dois na Conferência.
                </CardContent>
              </Card>
            )}

            <Card className="border border-border/80 rounded-2xl shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Diferenças por produto</CardTitle>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={exportarExcel}
                    disabled={linhasFiltradas.length === 0}
                    className="shrink-0 h-9 w-9 rounded-xl shadow-2xs"
                    title="Exportar para Excel"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <SearchFilter
                    value={busca}
                    onChange={setBusca}
                    placeholder="Buscar produto..."
                    className="max-w-none sm:max-w-sm"
                  />
                  <Select value={filtroLinha} onValueChange={setFiltroLinha}>
                    <SelectTrigger className="w-full sm:w-56 h-11 rounded-xl">
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[28%]">Produto</TableHead>
                          <TableHead className="text-right">Valor unit.</TableHead>
                          <TableHead className="text-center">Qtd A</TableHead>
                          <TableHead className="text-center">Qtd B</TableHead>
                          <TableHead className="text-center">Diferença</TableHead>
                          <TableHead className="text-right">Valor da dif.</TableHead>
                          <TableHead className="text-center">Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.length > 0 ? (
                          paginatedData.map((l) => (
                            <TableRow
                              key={l.codigo_auxiliar}
                              className={
                                l.diferenca > 0
                                  ? 'bg-blue-500/5'
                                  : l.diferenca < 0
                                    ? 'bg-orange-500/5'
                                    : ''
                              }
                            >
                              <TableCell className="font-medium">
                                <span className="font-mono text-sm">{l.codigo_auxiliar}</span>
                                {l.nome_produto !== l.codigo_auxiliar && (
                                  <span className="block text-xs text-muted-foreground truncate">
                                    {l.nome_produto}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {l.valor_unitario === 0 ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  moeda(l.valor_unitario)
                                )}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {l.quantidade_a}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {l.quantidade_b}
                              </TableCell>
                              <TableCell className="text-center">
                                <span
                                  className={`font-bold ${
                                    l.diferenca > 0
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : l.diferenca < 0
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-muted-foreground'
                                  }`}
                                >
                                  {l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {l.diferenca === 0 || l.valor_unitario === 0 ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span
                                    className={`font-semibold ${
                                      l.diferenca > 0
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-orange-600 dark:text-orange-400'
                                    }`}
                                  >
                                    {l.diferenca > 0 ? '+' : ''}
                                    {moeda(l.diferenca * l.valor_unitario)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {!l.presente_em_a ? (
                                  <Badge variant="outline" className="text-[10px] rounded-md">
                                    Só no B
                                  </Badge>
                                ) : !l.presente_em_b ? (
                                  <Badge variant="outline" className="text-[10px] rounded-md">
                                    Só no A
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Em ambos
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Minus className="h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground">
                                  Nenhum produto encontrado com os filtros aplicados
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {paginacao.totalPages > 1 && (
                  <div className="pt-4">
                    <Pagination {...paginacao} />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
