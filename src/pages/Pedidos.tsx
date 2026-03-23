import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePedidosPaginatedQuery,
  useVendedoresQuery,
  usePedidoDetalhesQuery,
  Pedido,
} from '@/hooks/usePedidosQuery';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package,
  DollarSign,
  AlertTriangle,
  FileText,
  Undo2,
  Search,
  FileDown,
  Loader2,
  Check,
  FileCode,
  Store,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pagination as PaginationComponent } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { useVendedoresListQuery } from '@/hooks/useVendedoresGerenciamentoQuery';
import {
  useEstoqueRealVendedorQuery,
  useGerarNotaRetornoMutation,
} from '@/hooks/useNotaRetornoQuery';
import * as XLSX from 'xlsx';
import { gerarXmlRetornoCiclone, downloadXml } from '@/lib/gerarXmlCiclone';

// ─── Types ───────────────────────────────────────────────────

interface ItemPedido {
  id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
}

interface PedidoComItens extends Pedido {
  itens_pedido: ItemPedido[];
}

interface ItemRetornoLocal {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_atual: number;
  quantidade_retorno: number;
  valor_produto: number;
  codigo_produto: string;
}

// ─── Consultar Pedidos Tab ───────────────────────────────────

function ConsultarPedidosTab() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const { data: pedidosResult, isLoading: loading } = usePedidosPaginatedQuery({
    codigoVendedor: profile?.codigo_vendedor,
    isGerente,
    tipoFilter,
    vendedorFilter,
    searchTerm,
    page: currentPage,
    pageSize: itemsPerPage,
  });

  const pedidos = pedidosResult?.data || [];
  const totalItems = pedidosResult?.totalCount || 0;
  const totalPages = pedidosResult?.totalPages || 1;

  const { data: vendedores = [] } = useVendedoresQuery();
  const { data: itensPedido = [] } = usePedidoDetalhesQuery(selectedPedidoId);

  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleViewPedido = (pedido: Pedido) => {
    setSelectedPedidoId(pedido.id);
    setDialogOpen(true);
  };

  const selectedPedido = selectedPedidoId
    ? { ...pedidos.find((p) => p.id === selectedPedidoId)!, itens_pedido: itensPedido }
    : null;

  const totalUnidades = (itens: ItemPedido[]) =>
    itens.reduce((acc, item) => acc + Number(item.quantidade), 0);

  const parseCodigoAuxiliar = (codigo: string) => {
    const parts = codigo.split(' ');
    return { modelo: parts[0] || codigo, cor: parts.slice(1).join(' ') || '-' };
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <SearchFilter
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Buscar por número do pedido, vendedor ou NF..."
            />
            <Select value={tipoFilter} onValueChange={handleFilterChange(setTipoFilter)}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="7">Remessa</SelectItem>
                <SelectItem value="2">Venda</SelectItem>
                <SelectItem value="3">Retorno</SelectItem>
              </SelectContent>
            </Select>
            {isGerente && (
              <Select value={vendedorFilter} onValueChange={handleFilterChange(setVendedorFilter)}>
                <SelectTrigger className="w-full md:w-52">
                  <SelectValue placeholder="Vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os vendedores</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v.codigo} value={v.codigo}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pedidos ({totalItems})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando pedidos...</div>
          ) : pedidos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Data</TableHead>
                    {isGerente && <TableHead>Vendedor</TableHead>}
                    <TableHead>Tipo</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((pedido) => (
                    <TableRow key={pedido.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">#{pedido.numero_pedido}</TableCell>
                      <TableCell>
                        {format(new Date(pedido.data_emissao), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </TableCell>
                      {isGerente && (
                        <TableCell className="max-w-[200px] truncate">
                          {pedido.nome_vendedor || pedido.codigo_vendedor}
                        </TableCell>
                      )}
                      <TableCell>{getTipoBadge(pedido.codigo_tipo)}</TableCell>
                      <TableCell>
                        {pedido.numero_nota_fiscal
                          ? `${pedido.numero_nota_fiscal}${pedido.serie_nota_fiscal ? `-${pedido.serie_nota_fiscal}` : ''}`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(pedido.valor_total).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleViewPedido(pedido)}>
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && totalItems > 0 && (
            <PaginationComponent
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              startIndex={(currentPage - 1) * itemsPerPage}
              endIndex={Math.min(currentPage * itemsPerPage, totalItems)}
              onPageChange={(page) => setCurrentPage(page)}
              onItemsPerPageChange={(v) => {
                setItemsPerPage(Number(v));
                setCurrentPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialog de Detalhes */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedPedido && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  PEDIDO #{selectedPedido.numero_pedido}
                  {getTipoBadge(selectedPedido.codigo_tipo)}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Data:</span>
                    <p className="font-medium">
                      {format(new Date(selectedPedido.data_emissao), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vendedor:</span>
                    <p className="font-medium">
                      {selectedPedido.nome_vendedor || selectedPedido.codigo_vendedor}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nota Fiscal:</span>
                    <p className="font-medium">
                      {selectedPedido.numero_nota_fiscal
                        ? `${selectedPedido.numero_nota_fiscal} - Série ${selectedPedido.serie_nota_fiscal || '1'}`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <p className="font-medium">
                      {selectedPedido.codigo_tipo === 7
                        ? 'Remessa'
                        : selectedPedido.codigo_tipo === 2
                          ? 'Venda'
                          : selectedPedido.codigo_tipo === 3
                            ? 'Retorno'
                            : `Tipo ${selectedPedido.codigo_tipo}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Situação:</span>
                    <p className="font-medium">
                      {selectedPedido.situacao === 'N' ? 'Normal' : selectedPedido.situacao || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cliente:</span>
                    <p className="font-medium">{selectedPedido.codigo_cliente || '-'}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {selectedPedido.codigo_tipo === 7
                      ? 'PRODUTOS ENVIADOS'
                      : selectedPedido.codigo_tipo === 3
                        ? 'PRODUTOS RETORNADOS'
                        : 'PRODUTOS VENDIDOS'}
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código QR</TableHead>
                          <TableHead className="hidden md:table-cell">Produto</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead>Cor</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Valor Un.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPedido.itens_pedido.map((item) => {
                          const { modelo, cor } = parseCodigoAuxiliar(item.codigo_auxiliar);
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-sm">{item.codigo_auxiliar}</TableCell>
                              <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                                {item.nome_produto}
                              </TableCell>
                              <TableCell>{modelo}</TableCell>
                              <TableCell>{cor}</TableCell>
                              <TableCell className="text-right">{Number(item.quantidade)} un</TableCell>
                              <TableCell className="text-right hidden md:table-cell">
                                {Number(item.valor_produto).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold">TOTAIS</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Modelos diferentes:</span>
                      <p className="font-bold text-lg">{selectedPedido.itens_pedido.length}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total de unidades:</span>
                      <p className="font-bold text-lg">{totalUnidades(selectedPedido.itens_pedido)} un</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valor Total:</span>
                      <p className="font-bold text-lg text-primary">
                        {selectedPedido.itens_pedido
                          .reduce(
                            (acc, item) => acc + Math.abs(Number(item.quantidade)) * Number(item.valor_produto),
                            0
                          )
                          .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Nota de Retorno Tab ─────────────────────────────────────

function NotaRetornoTab() {
  const { profile } = useAuth();
  const [selectedVendedor, setSelectedVendedor] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [itensRetorno, setItensRetorno] = useState<ItemRetornoLocal[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [lojaDialogOpen, setLojaDialogOpen] = useState(false);

  const { data: vendedores = [], isLoading: loadingVendedores } = useVendedoresListQuery();
  const {
    data: estoqueReal,
    isLoading: loadingEstoque,
    isFetching: fetchingEstoque,
  } = useEstoqueRealVendedorQuery(selectedVendedor || null);
  const gerarNotaMutation = useGerarNotaRetornoMutation();

  useEffect(() => {
    if (estoqueReal && estoqueReal.length > 0) {
      setItensRetorno(estoqueReal);
    } else {
      setItensRetorno([]);
    }
  }, [estoqueReal]);

  const filteredItens = useMemo(() => {
    if (!searchTerm) return itensRetorno;
    const term = searchTerm.toLowerCase();
    return itensRetorno.filter(
      (item) =>
        item.codigo_auxiliar.toLowerCase().includes(term) ||
        item.nome_produto.toLowerCase().includes(term)
    );
  }, [itensRetorno, searchTerm]);

  const totalItems = filteredItens.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItens = filteredItens.slice(startIndex, startIndex + itemsPerPage);

  const resumo = useMemo(() => {
    const itensComRetorno = itensRetorno.filter((i) => i.quantidade_retorno > 0);
    const totalUnidades = itensComRetorno.reduce((acc, i) => acc + i.quantidade_retorno, 0);
    const valorTotal = itensComRetorno.reduce(
      (acc, i) => acc + i.quantidade_retorno * i.valor_produto,
      0
    );
    return { totalProdutos: itensComRetorno.length, totalUnidades, valorTotal };
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
          ? { ...item, quantidade_retorno: Math.max(0, Math.min(quantidade, item.quantidade_atual)) }
          : item
      )
    );
  };

  const handleZerarTudo = () => {
    setItensRetorno((prev) => prev.map((item) => ({ ...item, quantidade_retorno: item.quantidade_atual })));
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
    if (itensExport.length === 0) return;
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
    <div className="space-y-6">
      {/* Seleção do Vendedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Selecionar Vendedor</CardTitle>
          <CardDescription>Escolha o vendedor para gerar a nota de retorno do estoque</CardDescription>
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
                <Button variant="outline" size="sm" onClick={handleZerarTudo}>Retornar Tudo</Button>
                <Button variant="outline" size="sm" onClick={handleLimparTudo}>Limpar Tudo</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                    {resumo.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                  onChange={(v) => { setSearchTerm(v); setCurrentPage(1); }}
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
                            <TableCell className="font-mono text-sm">{item.codigo_auxiliar}</TableCell>
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
                                  handleQuantidadeChange(item.codigo_auxiliar, parseInt(e.target.value) || 0)
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
                    <PaginationComponent
                      currentPage={currentPage}
                      totalPages={totalPages}
                      itemsPerPage={itemsPerPage}
                      totalItems={totalItems}
                      startIndex={startIndex}
                      endIndex={Math.min(startIndex + itemsPerPage, totalItems)}
                      onPageChange={setCurrentPage}
                      onItemsPerPageChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}
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
                  <Button variant="outline" onClick={() => setLojaDialogOpen(true)}>
                    <FileCode className="h-4 w-4 mr-2" />
                    Exportar XML Ciclone
                  </Button>
                  <Button onClick={() => setConfirmDialogOpen(true)} disabled={gerarNotaMutation.isPending}>
                    {gerarNotaMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Gerar Nota de Retorno
                      </>
                    )}
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
                <p><strong>{resumo.totalProdutos}</strong> produtos</p>
                <p><strong>{resumo.totalUnidades}</strong> unidades</p>
                <p>
                  Valor:{' '}
                  <strong>
                    {resumo.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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

      {/* Dialog de Seleção de Loja */}
      <Dialog open={lojaDialogOpen} onOpenChange={setLojaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Selecionar Loja
            </DialogTitle>
            <DialogDescription>Escolha a loja para gerar o XML de retorno Ciclone.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[
              { codigo: 1, nome: 'Loja 01' },
              { codigo: 2, nome: 'Loja 02' },
            ].map((loja) => (
              <Button
                key={loja.codigo}
                variant="outline"
                className="h-24 flex flex-col gap-2 text-base"
                onClick={() => {
                  const vendedorInfo = vendedores.find((v) => v.codigo_vendedor === selectedVendedor);
                  const itensXml = itensRetorno
                    .filter((i) => i.quantidade_retorno > 0)
                    .map((item) => ({
                      codigo_auxiliar: item.codigo_auxiliar,
                      nome_produto: item.nome_produto,
                      quantidade: item.quantidade_retorno,
                      valor_unitario: item.valor_produto,
                    }));
                  const xml = gerarXmlRetornoCiclone({
                    codigoVendedor: selectedVendedor,
                    nomeVendedor: vendedorInfo?.nome || selectedVendedor,
                    codigoLoja: loja.codigo,
                    itens: itensXml,
                  });
                  const nomeArquivo = `retorno-ciclone-loja${loja.codigo}-${selectedVendedor}-${new Date().toISOString().split('T')[0]}.xml`;
                  downloadXml(xml, nomeArquivo);
                  setLojaDialogOpen(false);
                }}
              >
                <Store className="h-6 w-6" />
                {loja.nome}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Shared helper ───────────────────────────────────────────

function getTipoBadge(codigoTipo: number) {
  if (codigoTipo === 7) {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        <Package className="w-3 h-3 mr-1" />
        Remessa
      </Badge>
    );
  } else if (codigoTipo === 2) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        <DollarSign className="w-3 h-3 mr-1" />
        Venda
      </Badge>
    );
  } else if (codigoTipo === 3) {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
        <Undo2 className="w-3 h-3 mr-1" />
        Retorno
      </Badge>
    );
  } else {
    return (
      <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Tipo {codigoTipo}
      </Badge>
    );
  }
}

// ─── Main Page ───────────────────────────────────────────────

export default function Pedidos() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isGerente ? 'Pedidos & Notas' : 'Meus Pedidos'}
          </h1>
          <p className="text-muted-foreground">
            {isGerente
              ? 'Consulte pedidos e gere notas de retorno'
              : 'Acompanhe suas remessas recebidas e vendas realizadas'}
          </p>
        </div>

        {isGerente ? (
          <Tabs defaultValue="consultar" className="w-full">
            <TabsList>
              <TabsTrigger value="consultar" className="gap-2">
                <FileText className="h-4 w-4" />
                Consultar Pedidos
              </TabsTrigger>
              <TabsTrigger value="nota-retorno" className="gap-2">
                <Undo2 className="h-4 w-4" />
                Nota de Retorno
              </TabsTrigger>
            </TabsList>
            <TabsContent value="consultar">
              <ConsultarPedidosTab />
            </TabsContent>
            <TabsContent value="nota-retorno">
              <NotaRetornoTab />
            </TabsContent>
          </Tabs>
        ) : (
          <ConsultarPedidosTab />
        )}
      </div>
    </AppLayout>
  );
}
