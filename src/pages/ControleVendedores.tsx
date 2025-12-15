import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, List, Package, FileDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { TableWithFiltersSkeleton } from '@/components/skeletons/TableSkeleton';

interface Movimentacao {
  id: string;
  nome_vendedor: string;
  codigo_vendedor: string;
  codigo_tipo: number;
  codigo_auxiliar: string;
  quantidade: number;
  data_emissao: string;
  numero_pedido: string | null;
  numero_nota_fiscal: string | null;
}

interface Vendedor {
    codigo_vendedor: string;
    nome: string;
}

export default function ControleVendedores() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendedor, setSelectedVendedor] = useState('todos');
  const [selectedTipo, setSelectedTipo] = useState('todos');

  // Aplicar filtros
  const filteredMovimentacoes = useMemo(() => {
    return movimentacoes.filter(item => {
      const vendedorMatch = selectedVendedor === 'todos' || item.codigo_vendedor === selectedVendedor;
      
      let tipoMatch = true;
      if (selectedTipo === 'remessa') {
        tipoMatch = [7, 99].includes(item.codigo_tipo);
      } else if (selectedTipo === 'venda') {
        tipoMatch = item.codigo_tipo === 2;
      }

      return vendedorMatch && tipoMatch;
    });
  }, [movimentacoes, selectedVendedor, selectedTipo]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({
    data: filteredMovimentacoes,
    searchTerm,
    searchFields: ['nome_vendedor', 'codigo_auxiliar', 'numero_pedido', 'numero_nota_fiscal'],
  });

  useEffect(() => {
    if (profile?.role === 'gerente') {
      fetchMovimentacoes();
      fetchVendedores();
    }
  }, [profile]);

  const fetchVendedores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .eq('role', 'vendedor')
      .not('codigo_vendedor', 'is', null)
      .order('nome');

    if (error) {
        console.error('Erro ao buscar vendedores:', error);
    } else {
        setVendedores(data);
    }
  }

  const fetchMovimentacoes = async () => {
    setLoading(true);
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('itens_pedido')
            .select(`
                id,
                quantidade,
                codigo_auxiliar,
                pedidos (
                    codigo_tipo,
                    nome_vendedor,
                    codigo_vendedor,
                    data_emissao,
                    numero_pedido,
                    numero_nota_fiscal
                )
            `)
            .order('data_emissao', { referencedTable: 'pedidos', ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Erro ao buscar movimentações:', error);
            hasMore = false;
            setMovimentacoes([]);
            setLoading(false);
            return;
        }

        if (data) {
            allData = [...allData, ...data];
        }

        if (!data || data.length < pageSize) {
            hasMore = false;
        }
        else {
            page++;
        }
    }

    const flattenedData = allData.map(item => ({
        id: item.id,
        quantidade: item.quantidade,
        codigo_auxiliar: item.codigo_auxiliar,
        // @ts-ignore
        codigo_tipo: item.pedidos?.codigo_tipo,
        // @ts-ignore
        nome_vendedor: item.pedidos?.nome_vendedor,
        // @ts-ignore
        codigo_vendedor: item.pedidos?.codigo_vendedor,
        // @ts-ignore
        data_emissao: item.pedidos?.data_emissao,
        // @ts-ignore
        numero_pedido: item.pedidos?.numero_pedido || null,
        // @ts-ignore
        numero_nota_fiscal: item.pedidos?.numero_nota_fiscal || null,
    }));

    // Aggregate data
    const aggregatedMap = new Map<string, Movimentacao>();

    flattenedData.forEach(item => {
        if (!item.codigo_vendedor || !item.data_emissao) return;

        const dateKey = new Date(item.data_emissao).toISOString().split('T')[0];
        const key = `${item.codigo_vendedor}-${item.codigo_tipo}-${item.codigo_auxiliar}-${dateKey}-${item.numero_pedido || ''}-${item.numero_nota_fiscal || ''}`;
        
        const existing = aggregatedMap.get(key);
        
        if (existing) {
            existing.quantidade += item.quantidade;
        } else {
            aggregatedMap.set(key, { ...item, id: key });
        }
    });

    const aggregatedData = Array.from(aggregatedMap.values());

    setMovimentacoes(aggregatedData);
    setLoading(false);
  };

  // Calculate the sum of quantities
  const sumOfQuantities = useMemo(() => {
    return filteredMovimentacoes.reduce((sum, mov) => sum + mov.quantidade, 0);
  }, [filteredMovimentacoes]);

  const handleExport = () => {
    const dataToExport = filteredMovimentacoes.map(item => ({
      'Vendedor': item.nome_vendedor,
      'Cód. Tipo': item.codigo_tipo,
      'Num. Pedido': item.numero_pedido || '-',
      'Nota Fiscal': item.numero_nota_fiscal || '-',
      'Produto (Cód. Aux.)': item.codigo_auxiliar,
      'Quantidade': item.quantidade,
      'Data': new Date(item.data_emissao).toLocaleDateString('pt-BR'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimentacoes');
    XLSX.writeFile(workbook, 'movimentacoes_vendedores.xlsx');
  };

  if (profile?.role !== 'gerente') {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito a gerentes.
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }
  
          // Removed getTipoLabel as it's no longer used for display
  
    
  
          return (
  
            <AppLayout>
  
              <div className="space-y-6">
  
                <div>
  
                  <h1 className="text-2xl font-bold tracking-tight">Controle de Vendedores</h1>
  
                  <p className="text-muted-foreground">
  
                    Listagem de todas as movimentações de produtos por vendedor.
  
                  </p>
  
                </div>
  
    
  
                <Card className="border-2">
  
                  <CardHeader>
  
                    <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  
                        <span className="flex items-center gap-2">
  
                            <List size={20} />
  
                            Movimentações
  
                        </span>
  
                        <Badge variant="secondary" className="text-lg px-3 py-1">
  
                            {sumOfQuantities}
  
                        </Badge>
  
                    </CardTitle>
  
                  </CardHeader>
  
                  <CardContent className="space-y-4">
  
                    <div className="flex flex-col md:flex-row gap-4">
  
                        <SearchFilter
  
                        value={searchTerm}
  
                        onChange={setSearchTerm}
  
                        placeholder="Buscar por vendedor ou produto..."
  
                        />
  
                        <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
  
                            <SelectTrigger className="w-full md:w-48">
  
                                <SelectValue placeholder="Filtrar por vendedor" />
  
                            </SelectTrigger>
  
                            <SelectContent>
  
                                <SelectItem value="todos">Todos os Vendedores</SelectItem>
  
                                {vendedores.map(v => (
  
                                    <SelectItem key={v.codigo_vendedor} value={v.codigo_vendedor}>{v.nome}</SelectItem>
  
                                ))}
  
                            </SelectContent>
  
                        </Select>
  
                        <Select value={selectedTipo} onValueChange={setSelectedTipo}>
  
                            <SelectTrigger className="w-full md:w-48">
  
                                <SelectValue placeholder="Filtrar por tipo" />
  
                            </SelectTrigger>
  
                            <SelectContent>
  
                                <SelectItem value="todos">Todos os Tipos</SelectItem>
  
                                <SelectItem value="remessa">Remessa</SelectItem>
  
                                <SelectItem value="venda">Venda</SelectItem>
  
                            </SelectContent>
  
                        </Select>
  
                        <Button onClick={handleExport} className="w-full md:w-auto flex items-center gap-2">
                            <FileDown size={16} />
                            Exportar
                        </Button>
                    </div>
  
    
  
                    {loading ? (
                      <TableWithFiltersSkeleton columns={7} rows={8} />
                    ) : sumOfQuantities === 0 ? (
  
                      <div className="text-center py-8">
  
                        <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
  
                        <p className="text-muted-foreground">
  
                            {searchTerm || selectedVendedor !== 'todos' || selectedTipo !== 'todos'
  
                                ? 'Nenhuma movimentação encontrada para os filtros aplicados.'
  
                                : 'Nenhuma movimentação encontrada.'
  
                            }
  
                        </p>
  
                      </div>
  
                    ) : (
  
                      <>
  
                        <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Cód. Tipo</TableHead>
                        <TableHead>Num. Pedido</TableHead>
                        <TableHead>Nota Fiscal</TableHead>
                        <TableHead>Produto (Cód. Aux.)</TableHead>
                        <TableHead className="text-center">Quantidade</TableHead>
                        <TableHead className="text-right">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.nome_vendedor}</TableCell>
                          <TableCell>{item.codigo_tipo}</TableCell>
                          <TableCell>{item.numero_pedido || '-'}</TableCell>
                          <TableCell>{item.numero_nota_fiscal || '-'}</TableCell>
                          <TableCell>{item.codigo_auxiliar}</TableCell>
                          <TableCell className="text-center font-bold">{item.quantidade}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {new Date(item.data_emissao).toLocaleDateString('pt-BR')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  itemsPerPage={itemsPerPage}
                  totalItems={totalItems}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  onPageChange={onPageChange}
                  onItemsPerPageChange={onItemsPerPageChange}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
