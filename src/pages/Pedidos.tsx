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
import { XmlPorExcelTab } from '@/components/pedidos/XmlPorExcelTab';
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
  useGerarNotaRetornoDeInventarioMutation,
} from '@/hooks/useNotaRetornoQuery';
import * as XLSX from 'xlsx';
import { gerarXmlRetornoCiclone, downloadXml, downloadXmlsAsZip } from '@/lib/gerarXmlCiclone';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  valor_remessa: number;
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

// ─── Nota de Retorno Tab (a partir de inventários aprovados) ─

interface InventarioAprovado {
  id: string;
  codigo_vendedor: string;
  data_inventario: string;
  status: string;
  updated_at: string;
  observacoes: string | null;
  profiles: { nome: string } | null;
  total_unidades: number;
  total_produtos: number;
  valor_total: number;
}

function useInventariosAprovadosPendentes() {
  return useQuery({
    queryKey: ['inventarios-aprovados-pendentes-retorno'],
    queryFn: async () => {
      const { data: invs, error } = await supabase
        .from('inventarios')
        .select('id, codigo_vendedor, data_inventario, status, updated_at, observacoes, profiles!inventarios_user_id_fkey(nome)')
        .eq('status', 'aprovado' as never)
        .order('data_inventario', { ascending: false });
      if (error) throw error;
      const lista = (invs || []) as unknown as Array<Omit<InventarioAprovado, 'total_unidades' | 'total_produtos' | 'valor_total'>>;
      if (lista.length === 0) return [] as InventarioAprovado[];

      // Carrega itens em lotes
      const ids = lista.map((i) => i.id);
      const itens: { inventario_id: string; codigo_auxiliar: string; quantidade_fisica: number }[] = [];
      const BATCH = 1000;
      for (let i = 0; i < ids.length; i += 50) {
        const lote = ids.slice(i, i + 50);
        let from = 0;
        while (true) {
          const { data, error: e } = await supabase
            .from('itens_inventario')
            .select('inventario_id, codigo_auxiliar, quantidade_fisica')
            .in('inventario_id', lote)
            .range(from, from + BATCH - 1);
          if (e) throw e;
          if (!data || data.length === 0) break;
          itens.push(...data.map((d) => ({
            inventario_id: d.inventario_id,
            codigo_auxiliar: d.codigo_auxiliar,
            quantidade_fisica: Number(d.quantidade_fisica) || 0,
          })));
          if (data.length < BATCH) break;
          from += BATCH;
        }
      }

      // Carrega valores de produtos
      const codigos = Array.from(new Set(itens.map((it) => it.codigo_auxiliar)));
      const valorMap = new Map<string, number>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('produtos').select('codigo_auxiliar, valor_produto').in('codigo_auxiliar', lote);
        prods?.forEach((p) => valorMap.set(p.codigo_auxiliar, Number(p.valor_produto) || 0));
      }

      // Agrega por inventário
      const agg = new Map<string, { unidades: number; produtos: Set<string>; valor: number }>();
      for (const it of itens) {
        if (it.quantidade_fisica <= 0) continue;
        const cur = agg.get(it.inventario_id) || { unidades: 0, produtos: new Set<string>(), valor: 0 };
        cur.unidades += it.quantidade_fisica;
        cur.produtos.add(it.codigo_auxiliar);
        cur.valor += it.quantidade_fisica * (valorMap.get(it.codigo_auxiliar) || 0);
        agg.set(it.inventario_id, cur);
      }

      return lista.map((inv) => {
        const a = agg.get(inv.id);
        return {
          ...inv,
          total_unidades: a?.unidades ?? 0,
          total_produtos: a?.produtos.size ?? 0,
          valor_total: a?.valor ?? 0,
        };
      }).filter((i) => i.total_unidades > 0);
    },
    staleTime: 60_000,
  });
}

function NotaRetornoTab() {
  const { data: inventarios = [], isLoading, isFetching } = useInventariosAprovadosPendentes();
  const gerarNotaMutation = useGerarNotaRetornoDeInventarioMutation();
  const [confirmInv, setConfirmInv] = useState<InventarioAprovado | null>(null);
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [xmlInv, setXmlInv] = useState<InventarioAprovado | null>(null);
  const [xmlTabela, setXmlTabela] = useState<'venda' | 'remessa'>('venda');
  const [xmlSegmentos, setXmlSegmentos] = useState<number>(1);
  const [xmlLoading, setXmlLoading] = useState(false);

  const handleGerarXml = async (loja: { codigo: number; nome: string }) => {
    if (!xmlInv) return;
    setXmlLoading(true);
    try {
      // Carrega itens do inventário (paginado)
      const itensInv: { codigo_auxiliar: string; quantidade_fisica: number; nome_produto: string | null }[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('itens_inventario')
          .select('codigo_auxiliar, quantidade_fisica, nome_produto')
          .eq('inventario_id', xmlInv.id)
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        itensInv.push(...data.map((d) => ({
          codigo_auxiliar: d.codigo_auxiliar,
          quantidade_fisica: Number(d.quantidade_fisica) || 0,
          nome_produto: d.nome_produto,
        })));
        if (data.length < BATCH) break;
        from += BATCH;
      }

      const itensValidos = itensInv.filter((i) => i.quantidade_fisica > 0);
      if (itensValidos.length === 0) {
        toast.error('Inventário sem itens com quantidade para gerar XML.');
        return;
      }

      // Busca preços e nomes na tabela produtos
      const codigos = Array.from(new Set(itensValidos.map((i) => i.codigo_auxiliar)));
      const prodMap = new Map<string, { nome_produto: string; valor_produto: number; valor_remessa: number }>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, nome_produto, valor_produto, valor_remessa')
          .in('codigo_auxiliar', lote);
        prods?.forEach((p) => prodMap.set(p.codigo_auxiliar, {
          nome_produto: p.nome_produto,
          valor_produto: Number(p.valor_produto) || 0,
          valor_remessa: Number(p.valor_remessa) || 0,
        }));
      }

      const itensXml = itensValidos.map((it) => {
        const p = prodMap.get(it.codigo_auxiliar);
        return {
          codigo_auxiliar: it.codigo_auxiliar,
          nome_produto: p?.nome_produto || it.nome_produto || it.codigo_auxiliar,
          quantidade: it.quantidade_fisica,
          valor_unitario: xmlTabela === 'remessa' ? (p?.valor_remessa || 0) : (p?.valor_produto || 0),
        };
      });

      const requested = Math.max(1, Math.min(10, xmlSegmentos));
      const effectiveSegmentos = Math.min(requested, itensXml.length);
      if (effectiveSegmentos < requested) {
        toast.warning(`Só há ${itensXml.length} item(ns). Gerando ${effectiveSegmentos} pedido(s).`);
      }

      const buckets: typeof itensXml[] = Array.from({ length: effectiveSegmentos }, () => []);
      itensXml.forEach((item, idx) => buckets[idx % effectiveSegmentos].push(item));

      const dataIso = new Date().toISOString().split('T')[0];
      const nomeVendedor = xmlInv.profiles?.nome || xmlInv.codigo_vendedor;
      const arquivos = buckets.map((bucket, i) => {
        const xml = gerarXmlRetornoCiclone({
          codigoVendedor: xmlInv.codigo_vendedor,
          nomeVendedor,
          codigoLoja: loja.codigo,
          itens: bucket,
          sequencia: effectiveSegmentos > 1 ? i + 1 : undefined,
        });
        const sufixo = effectiveSegmentos > 1 ? `-parte${i + 1}-de-${effectiveSegmentos}` : '';
        const nome = `retorno-ciclone-${xmlTabela}-loja${loja.codigo}-${xmlInv.codigo_vendedor}${sufixo}-${dataIso}.xml`;
        return { nome, conteudo: xml };
      });

      if (effectiveSegmentos > 1) {
        const zipName = `retorno-ciclone-${xmlTabela}-loja${loja.codigo}-${xmlInv.codigo_vendedor}-${effectiveSegmentos}partes-${dataIso}.zip`;
        await downloadXmlsAsZip(arquivos, zipName);
        toast.success(`ZIP gerado com ${effectiveSegmentos} XMLs.`);
      } else {
        downloadXml(arquivos[0].conteudo, arquivos[0].nome);
        toast.success('XML gerado com sucesso.');
      }
      setXmlInv(null);
      setXmlSegmentos(1);
    } catch (err) {
      console.error(err);
      toast.error('Falha ao gerar XML.', { description: err instanceof Error ? err.message : 'Erro desconhecido' });
    } finally {
      setXmlLoading(false);
    }
  };

  const vendedoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    inventarios.forEach((i) => {
      if (!map.has(i.codigo_vendedor)) {
        map.set(i.codigo_vendedor, i.profiles?.nome || i.codigo_vendedor);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [inventarios]);

  const filtered = useMemo(() => {
    if (vendedorFilter === 'todos') return inventarios;
    return inventarios.filter((i) => i.codigo_vendedor === vendedorFilter);
  }, [inventarios, vendedorFilter]);

  const handleGerar = async () => {
    if (!confirmInv) return;
    await gerarNotaMutation.mutateAsync({
      inventario_id: confirmInv.id,
      codigo_vendedor: confirmInv.codigo_vendedor,
      observacoes: `Retorno do inventário de ${format(new Date(confirmInv.data_inventario), 'dd/MM/yyyy')}`,
    });
    setConfirmInv(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Gerar Nota de Retorno a partir de Inventário Aprovado
            <RefetchIndicator isFetching={isFetching && !isLoading} />
          </CardTitle>
          <CardDescription>
            Cada inventário aprovado abaixo pode virar uma nota de retorno. Ao gerar, o
            inventário é marcado como <strong>baixado</strong> e some desta lista.
            Para consultar notas já emitidas, use a aba <strong>Consultar Pedidos</strong>{' '}
            (filtro <strong>Tipo: Retorno</strong>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Filtrar por vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedoresUnicos.map(([codigo, nome]) => (
                  <SelectItem key={codigo} value={codigo}>
                    {nome} ({codigo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando inventários...</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Check className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-70" />
            <p className="font-medium mb-1">Nenhum inventário aprovado pendente de retorno.</p>
            <p className="text-sm text-muted-foreground">
              Inventários aprovados aparecem aqui até serem baixados em uma nota.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((inv) => (
            <Card key={inv.id} className="border-2 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{inv.profiles?.nome || inv.codigo_vendedor}</CardTitle>
                    <p className="font-mono text-xs text-muted-foreground pt-0.5">
                      {inv.codigo_vendedor}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-green-600 text-green-700 text-[10px]">
                    Aprovado
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Package size={14} />
                    {inv.total_produtos} produtos · {inv.total_unidades} un.
                  </span>
                  <span className="text-xs">
                    {format(new Date(inv.data_inventario), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Valor:{' '}
                  <strong>
                    {inv.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => setConfirmInv(inv)}
                  disabled={gerarNotaMutation.isPending}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Gerar Nota de Retorno
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="sm"
                  onClick={() => setXmlInv(inv)}
                >
                  <FileCode className="h-4 w-4 mr-2" />
                  Exportar XML Ciclone
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!confirmInv} onOpenChange={(o) => !o && setConfirmInv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Nota de Retorno</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Gerar nota de retorno para{' '}
                  <strong>{confirmInv?.profiles?.nome || confirmInv?.codigo_vendedor}</strong> a partir do
                  inventário de{' '}
                  <strong>
                    {confirmInv && format(new Date(confirmInv.data_inventario), 'dd/MM/yyyy')}
                  </strong>
                  ?
                </p>
                {confirmInv && (
                  <div className="bg-muted p-3 rounded-lg text-sm">
                    <p><strong>{confirmInv.total_produtos}</strong> produtos</p>
                    <p><strong>{confirmInv.total_unidades}</strong> unidades</p>
                    <p>
                      Valor:{' '}
                      <strong>
                        {confirmInv.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </strong>
                    </p>
                  </div>
                )}
                <p className="text-destructive font-medium">
                  O inventário será marcado como <strong>baixado</strong> e o estoque real desses
                  itens irá a zero.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={gerarNotaMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGerar} disabled={gerarNotaMutation.isPending}>
              {gerarNotaMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
              ) : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog XML Ciclone */}
      <Dialog
        open={!!xmlInv}
        onOpenChange={(open) => {
          if (!open && !xmlLoading) {
            setXmlInv(null);
            setXmlSegmentos(1);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Gerar XML Ciclone
            </DialogTitle>
            <DialogDescription>
              Inventário de{' '}
              <strong>{xmlInv?.profiles?.nome || xmlInv?.codigo_vendedor}</strong>
              {xmlInv && ` · ${format(new Date(xmlInv.data_inventario), 'dd/MM/yyyy')}`}
              . Escolha tabela de preço, segmentação e a loja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Tabela de Preço</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={xmlTabela === 'venda' ? 'default' : 'outline'}
                onClick={() => setXmlTabela('venda')}
              >
                Venda
              </Button>
              <Button
                type="button"
                variant={xmlTabela === 'remessa' ? 'default' : 'outline'}
                onClick={() => setXmlTabela('remessa')}
              >
                Remessa
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Valores unitários virão da tabela{' '}
              <strong>{xmlTabela === 'venda' ? 'de venda (valor_produto)' : 'de remessa (valor_remessa)'}</strong>.
            </p>
          </div>

          <div className="space-y-2 py-2">
            <p className="text-sm font-medium">Segmentar em quantos pedidos?</p>
            <Select value={String(xmlSegmentos)} onValueChange={(v) => setXmlSegmentos(Number(v))}>
              <SelectTrigger id="segmentos-xml">
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
            <p className="text-xs text-muted-foreground">
              Itens distribuídos em <strong>{xmlSegmentos}</strong>{' '}
              {xmlSegmentos === 1 ? 'pedido' : 'pedidos'}. Cada segmento gera um arquivo separado.
            </p>
          </div>

          <p className="text-sm font-medium pt-2">Loja</p>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[
              { codigo: 1, nome: 'Loja 01' },
              { codigo: 2, nome: 'Loja 02' },
            ].map((loja) => (
              <Button
                key={loja.codigo}
                variant="outline"
                className="h-24 flex flex-col gap-2 text-base"
                disabled={xmlLoading}
                onClick={() => handleGerarXml(loja)}
              >
                {xmlLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Store className="h-6 w-6" />
                )}
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
                Gerar Nota de Retorno
              </TabsTrigger>
              <TabsTrigger value="xml-excel" className="gap-2">
                <FileCode className="h-4 w-4" />
                XML por Excel
              </TabsTrigger>
            </TabsList>
            <TabsContent value="consultar">
              <ConsultarPedidosTab />
            </TabsContent>
            <TabsContent value="nota-retorno">
              <NotaRetornoTab />
            </TabsContent>
            <TabsContent value="xml-excel">
              <XmlPorExcelTab />
            </TabsContent>
          </Tabs>
        ) : (
          <ConsultarPedidosTab />
        )}
      </div>
    </AppLayout>
  );
}
