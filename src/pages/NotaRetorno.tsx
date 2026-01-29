import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Undo2, Package, Search, FileDown, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useVendedoresListQuery } from '@/hooks/useVendedoresGerenciamentoQuery';
import {
  useEstoqueRealVendedorQuery,
  useGerarNotaRetornoMutation,
} from '@/hooks/useNotaRetornoQuery';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import * as XLSX from 'xlsx';

interface ItemRetornoLocal {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_atual: number;
  quantidade_retorno: number;
  valor_produto: number;
}

export default function NotaRetorno() {
  const { profile } = useAuth();
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [itensRetorno, setItensRetorno] = useState<ItemRetornoLocal[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const { data: vendedores = [], isLoading: loadingVendedores } = useVendedoresListQuery();
  const {
    data: estoqueReal,
    isLoading: loadingEstoque,
    isFetching: fetchingEstoque,
  } = useEstoqueRealVendedorQuery(selectedVendedor || null);
  const gerarNotaMutation = useGerarNotaRetornoMutation();

  // Atualiza itens quando estoque é carregado
  useEffect(() => {
    if (estoqueReal && estoqueReal.length > 0) {
      setItensRetorno(estoqueReal);
    } else {
      setItensRetorno([]);
    }
  }, [estoqueReal]);

  // Filtra itens
  const filteredItens = useMemo(() => {
    if (!searchTerm) return itensRetorno;
    const term = searchTerm.toLowerCase();
    return itensRetorno.filter(
      (item) =>
        item.codigo_auxiliar.toLowerCase().includes(term) ||
        item.nome_produto.toLowerCase().includes(term)
    );
  }, [itensRetorno, searchTerm]);

  // Paginação
  const totalItems = filteredItens.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItens = filteredItens.slice(startIndex, startIndex + itemsPerPage);

  // Resumo
  const resumo = useMemo(() => {
    const itensComRetorno = itensRetorno.filter((i) => i.quantidade_retorno > 0);
    const totalUnidades = itensComRetorno.reduce((acc, i) => acc + i.quantidade_retorno, 0);
    const valorTotal = itensComRetorno.reduce(
      (acc, i) => acc + i.quantidade_retorno * i.valor_produto,
      0
    );
    return {
      totalProdutos: itensComRetorno.length,
      totalUnidades,
      valorTotal,
    };
  }, [itensRetorno]);

  const handleVendedorChange = (value: string) => {
    setSelectedVendedor(value);
    setCurrentPage(1);
    setSearchTerm('');
  };

  const handleQuantidadeChange = (codigoAuxiliar: string, quantidade: number) => {
    setItensRetorno((prev) =>
      prev.map((item) =>
        item.codigo_auxiliar === codigoAuxiliar
          ? {
              ...item,
              quantidade_retorno: Math.max(0, Math.min(quantidade, item.quantidade_atual)),
            }
          : item
      )
    );
  };

  const handleZerarTudo = () => {
    setItensRetorno((prev) =>
      prev.map((item) => ({ ...item, quantidade_retorno: item.quantidade_atual }))
    );
  };

  const handleLimparTudo = () => {
    setItensRetorno((prev) => prev.map((item) => ({ ...item, quantidade_retorno: 0 })));
  };

  const handleExportExcel = () => {
    const vendedorInfo = vendedores.find((v) => v.codigo_vendedor === selectedVendedor);
    const itensExport = itensRetorno
      .filter((i) => i.quantidade_retorno > 0)
      .map((item) => ({
        'Código QR': item.codigo_auxiliar,
        Produto: item.nome_produto,
        'Estoque Atual': item.quantidade_atual,
        'Qtd Retorno': item.quantidade_retorno,
        'Valor Unitário': item.valor_produto,
        'Valor Total': item.quantidade_retorno * item.valor_produto,
      }));

    if (itensExport.length === 0) {
      return;
    }

    const ws = XLSX.utils.json_to_sheet(itensExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nota de Retorno');

    const nomeArquivo = `nota-retorno-${vendedorInfo?.nome || selectedVendedor}-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

  const handleGerarNota = async () => {
    const itensParaRetorno = itensRetorno
      .filter((i) => i.quantidade_retorno > 0)
      .map((item) => ({
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        quantidade: item.quantidade_retorno,
        valor_produto: item.valor_produto,
      }));

    await gerarNotaMutation.mutateAsync({
      codigo_vendedor: selectedVendedor,
      itens: itensParaRetorno,
    });

    setConfirmDialogOpen(false);
    setSelectedVendedor('');
    setItensRetorno([]);
  };

  const vendedorSelecionado = vendedores.find((v) => v.codigo_vendedor === selectedVendedor);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Undo2 className="h-6 w-6" />
            Nota de Retorno
          </h1>
          <p className="text-muted-foreground">
            Gere uma nota de retorno para zerar o estoque do vendedor
          </p>
        </div>

        {/* Seleção do Vendedor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Selecionar Vendedor</CardTitle>
            <CardDescription>
              Escolha o vendedor para gerar a nota de retorno do estoque
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={selectedVendedor} onValueChange={handleVendedorChange}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Selecione um vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.codigo_vendedor || ''}>
                      {v.nome} ({v.codigo_vendedor})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedVendedor && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleZerarTudo}>
                    Retornar Tudo
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleLimparTudo}>
                    Limpar Tudo
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Conteúdo Principal */}
        {selectedVendedor && (
          <>
            {/* Resumo */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Package className="h-8 w-8 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Produtos</p>
                      <p className="text-2xl font-bold">{resumo.totalProdutos}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Undo2 className="h-8 w-8 text-destructive" />
                    <div>
                      <p className="text-sm text-muted-foreground">Unidades p/ Retorno</p>
                      <p className="text-2xl font-bold">{resumo.totalUnidades}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      {resumo.valorTotal.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Itens */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Itens do Estoque
                    <RefetchIndicator isFetching={fetchingEstoque && !loadingEstoque} />
                  </CardTitle>
                  <SearchFilter
                    value={searchTerm}
                    onChange={(v) => {
                      setSearchTerm(v);
                      setCurrentPage(1);
                    }}
                    placeholder="Buscar produto..."
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loadingEstoque ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Carregando estoque...</span>
                  </div>
                ) : itensRetorno.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum item com estoque real encontrado para este vendedor.</p>
                    <p className="text-sm">O vendedor precisa ter um inventário aprovado.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código QR</TableHead>
                            <TableHead className="hidden md:table-cell">Produto</TableHead>
                            <TableHead className="text-right">Est. Atual</TableHead>
                            <TableHead className="text-right">Qtd Retorno</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedItens.map((item) => (
                            <TableRow key={item.codigo_auxiliar}>
                              <TableCell className="font-mono text-sm">
                                {item.codigo_auxiliar}
                              </TableCell>
                              <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                                {item.nome_produto}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{item.quantidade_atual}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={item.quantidade_atual}
                                  value={item.quantidade_retorno}
                                  onChange={(e) =>
                                    handleQuantidadeChange(
                                      item.codigo_auxiliar,
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 text-right ml-auto"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {totalPages > 1 && (
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        itemsPerPage={itemsPerPage}
                        totalItems={totalItems}
                        startIndex={startIndex}
                        endIndex={Math.min(startIndex + itemsPerPage, totalItems)}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(v) => {
                          setItemsPerPage(Number(v));
                          setCurrentPage(1);
                        }}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Ações */}
            {resumo.totalProdutos > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row justify-end gap-3">
                    <Button variant="outline" onClick={handleExportExcel}>
                      <FileDown className="h-4 w-4 mr-2" />
                      Exportar Excel
                    </Button>
                    <Button onClick={() => setConfirmDialogOpen(true)}>
                      <Check className="h-4 w-4 mr-2" />
                      Gerar Nota de Retorno
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Dialog de Confirmação */}
        <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Nota de Retorno</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Você está prestes a gerar uma nota de retorno para{' '}
                  <strong>{vendedorSelecionado?.nome}</strong>.
                </p>
                <div className="bg-muted p-3 rounded-lg mt-2">
                  <p>
                    <strong>{resumo.totalProdutos}</strong> produtos
                  </p>
                  <p>
                    <strong>{resumo.totalUnidades}</strong> unidades
                  </p>
                  <p>
                    Valor:{' '}
                    <strong>
                      {resumo.valorTotal.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </strong>
                  </p>
                </div>
                <p className="text-destructive font-medium mt-2">
                  Esta ação irá zerar o estoque teórico deste vendedor para os itens selecionados.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleGerarNota} disabled={gerarNotaMutation.isPending}>
                {gerarNotaMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Confirmar'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
