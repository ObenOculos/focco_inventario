import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Calendar, User, Download } from 'lucide-react';
import { SearchFilter } from '@/components/SearchFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { HistoricoSkeleton } from '@/components/skeletons/PageSkeleton';

interface VendedorProfile {
  id: string;
  codigo_vendedor: string;
  nome: string;
}

interface EstoqueRealItem {
  id: string;
  codigo_auxiliar: string;
  quantidade_real: number;
  data_atualizacao: string;
  inventario_id: string | null;
  codigo_vendedor: string;
}

interface HistoricoGroup {
  data_atualizacao: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  inventario_id: string | null;
  itens: EstoqueRealItem[];
  total_itens: number;
  total_quantidade: number;
}

export default function HistoricoEstoqueReal() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [historico, setHistorico] = useState<HistoricoGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos');
  const [vendedores, setVendedores] = useState<VendedorProfile[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    const fetchVendedores = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      if (!error && data) {
        setVendedores(data as VendedorProfile[]);
      }
    };

    if (isGerente) {
      fetchVendedores();
    }
  }, [isGerente]);

  useEffect(() => {
    const fetchHistorico = async () => {
      if (!profile) return;
      setLoading(true);

      let query = supabase
        .from('estoque_real')
        .select('*')
        .order('data_atualizacao', { ascending: false })
        .order('codigo_auxiliar', { ascending: true });

      if (!isGerente && profile.codigo_vendedor) {
        query = query.eq('codigo_vendedor', profile.codigo_vendedor);
      } else if (isGerente && selectedVendor !== 'todos') {
        query = query.eq('codigo_vendedor', selectedVendor);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar histórico:', error);
        setHistorico([]);
        setLoading(false);
        return;
      }

      // Group by data_atualizacao + codigo_vendedor
      const grouped = new Map<string, HistoricoGroup>();
      
      for (const item of (data || []) as EstoqueRealItem[]) {
        const key = `${item.data_atualizacao}_${item.codigo_vendedor}`;
        
        if (!grouped.has(key)) {
          const vendedor = vendedores.find(v => v.codigo_vendedor === item.codigo_vendedor);
          grouped.set(key, {
            data_atualizacao: item.data_atualizacao,
            codigo_vendedor: item.codigo_vendedor,
            nome_vendedor: vendedor?.nome || item.codigo_vendedor,
            inventario_id: item.inventario_id,
            itens: [],
            total_itens: 0,
            total_quantidade: 0,
          });
        }

        const group = grouped.get(key)!;
        group.itens.push(item);
        group.total_itens += 1;
        group.total_quantidade += item.quantidade_real;
      }

      setHistorico(Array.from(grouped.values()));
      setLoading(false);
    };

    fetchHistorico();
  }, [profile, isGerente, selectedVendor, vendedores]);

  const historicoFiltrado = useMemo(() => {
    let filtered = historico;
    
    // Filtro por período
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(group => new Date(group.data_atualizacao) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(group => new Date(group.data_atualizacao) <= end);
    }
    
    // Filtro por texto
    if (!searchTerm) return filtered;
    
    const term = searchTerm.toLowerCase();
    return filtered.map(group => ({
      ...group,
      itens: group.itens.filter(item => 
        item.codigo_auxiliar.toLowerCase().includes(term)
      )
    })).filter(group => group.itens.length > 0);
  }, [historico, searchTerm, startDate, endDate]);

  const totalRegistros = historico.reduce((acc, g) => acc + g.total_itens, 0);
  const totalAtualizacoes = historico.length;

  const handleExportExcel = () => {
    if (historicoFiltrado.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há dados para exportar.",
        variant: "destructive"
      });
      return;
    }

    const exportData = historicoFiltrado.flatMap(group => 
      group.itens.map(item => ({
        'Data Atualização': new Date(item.data_atualizacao).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        'Código Vendedor': item.codigo_vendedor,
        'Nome Vendedor': group.nome_vendedor,
        'Código Auxiliar': item.codigo_auxiliar,
        'Quantidade Real': item.quantidade_real
      }))
    );

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico Estoque Real');

    const vendorName = selectedVendor !== 'todos' 
      ? vendedores.find(v => v.codigo_vendedor === selectedVendor)?.nome || selectedVendor
      : 'todos';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `historico_estoque_real_${vendorName}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, fileName);

    toast({
      title: "Exportação concluída",
      description: `Arquivo ${fileName} baixado com sucesso.`
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Estoque Real</h1>
          <p className="text-muted-foreground">
            Visualize todas as atualizações do estoque real ao longo do tempo
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar size={16} />
                Total de Atualizações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalAtualizacoes}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Total de Registros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalRegistros}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Package size={20} />
                Histórico de Atualizações
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportExcel}
                disabled={historicoFiltrado.length === 0}
              >
                <Download size={16} className="mr-2" />
                Exportar Excel
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
              <SearchFilter
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Buscar por código..."
              />
              {isGerente && (
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Vendedores</SelectItem>
                    {vendedores.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.codigo_vendedor}>
                        {vendor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Data inicial"
                />
                <span className="text-muted-foreground">até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Data final"
                />
                {(startDate || endDate) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <HistoricoSkeleton />
            ) : historicoFiltrado.length === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum registro encontrado' : 'Nenhum histórico de estoque real'}
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {historicoFiltrado.map((group, index) => (
                  <AccordionItem 
                    key={`${group.data_atualizacao}_${group.codigo_vendedor}`} 
                    value={`item-${index}`}
                    className="border-2 rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-left w-full">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-muted-foreground" />
                          <span className="font-bold">
                            {new Date(group.data_atualizacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        {isGerente && (
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-muted-foreground" />
                            <span>{group.nome_vendedor}</span>
                            <Badge variant="outline">{group.codigo_vendedor}</Badge>
                          </div>
                        )}
                        <div className="flex gap-4 ml-auto">
                          <Badge variant="secondary">
                            {group.itens.length} itens
                          </Badge>
                          <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">
                            Total: {group.total_quantidade}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="border-t pt-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[60%]">Código</TableHead>
                              <TableHead className="text-right">Quantidade</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.itens.slice(0, 50).map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono font-bold">
                                  {item.codigo_auxiliar}
                                </TableCell>
                                <TableCell className="text-right font-bold text-purple-600">
                                  {item.quantidade_real}
                                </TableCell>
                              </TableRow>
                            ))}
                            {group.itens.length > 50 && (
                              <TableRow>
                                <TableCell colSpan={2} className="text-center text-muted-foreground">
                                  ... e mais {group.itens.length - 50} itens
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
