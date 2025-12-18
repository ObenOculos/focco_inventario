import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePedidosPaginatedQuery,
  useVendedoresQuery,
  usePedidoDetalhesQuery,
  Pedido,
} from '@/hooks/usePedidosQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, DollarSign, AlertTriangle, FileText, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pagination as PaginationComponent } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';

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

export default function Pedidos() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Paginação no servidor com filtros
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

  // Reset page when filters change
  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleViewPedido = (pedido: Pedido) => {
    setSelectedPedidoId(pedido.id);
    setDialogOpen(true);
  };

  const selectedPedido = selectedPedidoId
    ? { ...pedidos.find((p) => p.id === selectedPedidoId)!, itens_pedido: itensPedido }
    : null;

  const getTipoBadge = (codigoTipo: number) => {
    if (codigoTipo === 7) {
      return (
        <Badge
          variant="secondary"
          className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
        >
          <Package className="w-3 h-3 mr-1" />
          Remessa
        </Badge>
      );
    } else if (codigoTipo === 2) {
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        >
          <DollarSign className="w-3 h-3 mr-1" />
          Venda
        </Badge>
      );
    } else if (codigoTipo === 3) {
      return (
        <Badge
          variant="secondary"
          className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
        >
          <Undo2 className="w-3 h-3 mr-1" />
          Retorno
        </Badge>
      );
    } else {
      return (
        <Badge
          variant="secondary"
          className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          Tipo {codigoTipo}
        </Badge>
      );
    }
  };

  const totalUnidades = (itens: ItemPedido[]) => {
    return itens.reduce((acc, item) => acc + Number(item.quantidade), 0);
  };

  const parseCodigoAuxiliar = (codigo: string) => {
    const parts = codigo.split(' ');
    return {
      modelo: parts[0] || codigo,
      cor: parts.slice(1).join(' ') || '-',
    };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isGerente ? 'Gestão de Pedidos' : 'Meus Pedidos'}
          </h1>
          <p className="text-muted-foreground">
            {isGerente
              ? 'Visualize e gerencie todos os pedidos do sistema'
              : 'Acompanhe suas remessas recebidas e vendas realizadas'}
          </p>
        </div>

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
                <Select
                  value={vendedorFilter}
                  onValueChange={handleFilterChange(setVendedorFilter)}
                >
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
                          {format(new Date(pedido.data_emissao), 'dd/MM/yyyy HH:mm', {
                            locale: ptBR,
                          })}
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewPedido(pedido)}
                          >
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
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </CardContent>
        </Card>

        {/* Dialog de Detalhes do Pedido */}
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
                  {/* Informações do Pedido */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Data:</span>
                      <p className="font-medium">
                        {format(new Date(selectedPedido.data_emissao), 'dd/MM/yyyy HH:mm:ss', {
                          locale: ptBR,
                        })}
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
                        {selectedPedido.situacao === 'N'
                          ? 'Normal'
                          : selectedPedido.situacao || '-'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cliente:</span>
                      <p className="font-medium">{selectedPedido.codigo_cliente || '-'}</p>
                    </div>
                  </div>

                  {/* Tabela de Produtos */}
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
                            <TableHead className="text-right hidden md:table-cell">
                              Valor Un.
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedPedido.itens_pedido.map((item) => {
                            const { modelo, cor } = parseCodigoAuxiliar(item.codigo_auxiliar);
                            return (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">
                                  {item.codigo_auxiliar}
                                </TableCell>
                                <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                                  {item.nome_produto}
                                </TableCell>
                                <TableCell>{modelo}</TableCell>
                                <TableCell>{cor}</TableCell>
                                <TableCell className="text-right">
                                  {Number(item.quantidade)} un
                                </TableCell>
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

                  {/* Totais */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold">TOTAIS</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Modelos diferentes:</span>
                        <p className="font-bold text-lg">{selectedPedido.itens_pedido.length}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total de unidades:</span>
                        <p className="font-bold text-lg">
                          {totalUnidades(selectedPedido.itens_pedido)} un
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valor Total:</span>
                        <p className="font-bold text-lg text-primary">
                          {selectedPedido.itens_pedido
                            .reduce(
                              (acc, item) =>
                                acc +
                                Math.abs(Number(item.quantidade)) * Number(item.valor_produto),
                              0,
                            )
                            .toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
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
    </AppLayout>
  );
}
