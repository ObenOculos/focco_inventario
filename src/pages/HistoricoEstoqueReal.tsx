import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Calendar, User, Download } from 'lucide-react';
import { SearchFilter } from '@/components/SearchFilter';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { HistoricoSkeleton } from '@/components/skeletons/PageSkeleton';
import { useHistoricoEstoqueRealQuery } from '@/hooks/useHistoricoEstoqueRealQuery';
import { useVendedoresQuery } from '@/hooks/useEstoqueTeoricoQuery';
import { RefetchIndicator } from '@/components/RefetchIndicator';

export default function HistoricoEstoqueReal() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const isGerente = profile?.role === 'gerente';

  const { data: vendedores = [] } = useVendedoresQuery(isGerente);
  const {
    data: historico = [],
    isLoading: loading,
    isFetching,
  } = useHistoricoEstoqueRealQuery(isGerente, selectedVendor, profile?.codigo_vendedor, vendedores);

  const historicoFiltrado = useMemo(() => {
    let filtered = historico;

    // Filtro por período
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((group) => new Date(group.data_atualizacao) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((group) => new Date(group.data_atualizacao) <= end);
    }

    // Filtro por texto
    if (!searchTerm) return filtered;

    const term = searchTerm.toLowerCase();
    return filtered
      .map((group) => ({
        ...group,
        itens: group.itens.filter((item) => item.codigo_auxiliar.toLowerCase().includes(term)),
      }))
      .filter((group) => group.itens.length > 0);
  }, [historico, searchTerm, startDate, endDate]);

  const totalRegistros = historico.reduce((acc, g) => acc + g.total_itens, 0);
  const totalAtualizacoes = historico.length;

  const handleExportExcel = () => {
    if (historicoFiltrado.length === 0) {
      toast.warning('Sem dados para exportar');
      return;
    }

    const exportData = historicoFiltrado.flatMap((group) =>
      group.itens.map((item) => ({
        'Data Atualização': new Date(item.data_atualizacao).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        'Código Vendedor': item.codigo_vendedor,
        'Nome Vendedor': group.nome_vendedor,
        'Código Auxiliar': item.codigo_auxiliar,
        'Quantidade Real': item.quantidade_real,
      }))
    );

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico Estoque Real');

    const vendorName =
      selectedVendor !== 'todos'
        ? vendedores.find((v) => v.codigo_vendedor === selectedVendor)?.nome || selectedVendor
        : 'todos';
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `historico_estoque_real_${vendorName}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Arquivo exportado: ${fileName}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6 antialiased">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Histórico de Estoque Real</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium">
              Visualize todas as atualizações do estoque físico registradas ao longo do tempo
            </p>
          </div>
          <RefetchIndicator isFetching={isFetching && !loading} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border border-border/80 rounded-2xl shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Calendar size={14} />
                </div>
                Total de Atualizações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight text-foreground">{totalAtualizacoes}</p>
            </CardContent>
          </Card>

          <Card className="border border-border/80 rounded-2xl shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Package size={14} />
                </div>
                Total de Registros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight text-foreground">{totalRegistros}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-border/80 rounded-2xl shadow-xs">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-base sm:text-lg font-semibold tracking-tight">
              <span className="flex items-center gap-2">
                <Package size={20} className="text-primary" />
                Histórico de Atualizações
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl shadow-2xs h-9 px-3.5"
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
                  <SelectTrigger className="w-full md:w-48 h-11 rounded-xl border-input shadow-2xs">
                    <SelectValue placeholder="Vendedor" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-border/80">
                    <SelectItem value="todos">Todos os Vendedores</SelectItem>
                    {vendedores.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.codigo_vendedor}>
                        {vendor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex flex-col sm:flex-row gap-2 items-center w-full sm:w-auto">
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full flex h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Data inicial"
                />
                <span className="text-xs text-muted-foreground font-medium hidden sm:inline">até</span>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full flex h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  placeholder="Data final"
                />
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg text-xs"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            {loading ? (
              <HistoricoSkeleton />
            ) : historicoFiltrado.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground/60" />
                <p className="text-sm font-medium">
                  {searchTerm ? 'Nenhum registro encontrado' : 'Nenhum histórico de estoque real'}
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-3">
                {historicoFiltrado.map((group, index) => (
                  <AccordionItem
                    key={`${group.data_atualizacao}_${group.codigo_vendedor}`}
                    value={`item-${index}`}
                    className="border border-border/80 rounded-xl px-4 shadow-2xs"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-left w-full">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-muted-foreground" />
                          <span className="font-semibold text-sm">
                            {new Date(group.data_atualizacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {isGerente && (
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-muted-foreground" />
                            <span className="text-sm font-medium">{group.nome_vendedor}</span>
                            <Badge variant="outline" className="rounded-md font-mono text-xs">{group.codigo_vendedor}</Badge>
                          </div>
                        )}
                        <div className="flex gap-2.5 self-start md:ml-auto md:self-center">
                          <Badge variant="secondary" className="rounded-md text-xs">{group.itens.length} itens</Badge>
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 rounded-md text-xs">
                            Total: {group.total_quantidade}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="border-t border-border/80 pt-4">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              <TableHead className="w-[60%] font-semibold">Código</TableHead>
                              <TableHead className="text-right font-semibold">Quantidade</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.itens.slice(0, 50).map((item) => (
                              <TableRow key={item.id} className="hover:bg-muted/30">
                                <TableCell className="font-mono font-medium text-sm">
                                  {item.codigo_auxiliar}
                                </TableCell>
                                <TableCell className="text-right font-bold text-purple-600 dark:text-purple-400 text-sm">
                                  {item.quantidade_real}
                                </TableCell>
                              </TableRow>
                            ))}
                            {group.itens.length > 50 && (
                              <TableRow>
                                <TableCell
                                  colSpan={2}
                                  className="text-center text-xs text-muted-foreground py-3"
                                >
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
