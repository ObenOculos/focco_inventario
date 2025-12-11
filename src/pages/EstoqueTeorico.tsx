import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/app';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { calcularEstoqueTeorico, buscarEstoqueReal } from '@/lib/estoque';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VendedorProfile {
  id: string;
  codigo_vendedor: string;
  nome: string;
}

export default function EstoqueTeorico() {
  const { profile } = useAuth();
  const [estoqueBase, setEstoqueBase] = useState<EstoqueItem[]>([]);
  const [estoqueReal, setEstoqueReal] = useState<Map<string, { quantidade_real: number; data_atualizacao: string; inventario_id: string }>>(new Map());
  const [ajustesRealizados, setAjustesRealizados] = useState<Set<string>>(new Set()); // códigos que tiveram ajustes
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [saldoFilter, setSaldoFilter] = useState<string>('todos');
  const [selectedVendor, setSelectedVendor] = useState<string>('todos'); // 'todos' para todos os vendedores, ou codigo_vendedor
  const [vendedores, setVendedores] = useState<VendedorProfile[]>([]);

  const isGerente = profile?.role === 'gerente';

  const produtosNegativos = useMemo(
    () => estoqueBase.filter(e => e.estoque_teorico < 0),
    [estoqueBase]
  );
  // Aplicar filtros de tipo e saldo
  const estoque = useMemo(() => {
    let filtered = estoqueBase;

    // Filtro por tipo de movimento
    if (tipoFilter === 'remessa') {
      filtered = filtered.filter(e => e.quantidade_remessa > 0);
    } else if (tipoFilter === 'venda') {
      filtered = filtered.filter(e => e.quantidade_venda > 0);
    }

    // Filtro por saldo
    if (saldoFilter === 'positivo') {
      filtered = filtered.filter(e => e.estoque_teorico > 0);
    } else if (saldoFilter === 'negativo') {
      filtered = filtered.filter(e => e.estoque_teorico < 0);
    }

    return filtered;
  }, [estoqueBase, tipoFilter, saldoFilter]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedEstoque,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({
    data: estoque,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
  });

  useEffect(() => {
    const fetchVendedores = async () => {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, nome, codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      if (error) {
        console.error("Erro ao buscar vendedores:", error);
      } else if (profilesData) {
        setVendedores(profilesData);
      }
    };

    if (isGerente && vendedores.length === 0) {
      fetchVendedores();
    }
  }, [isGerente, vendedores.length]);

  useEffect(() => {
    const fetchAjustesRealizados = async (vendorCode?: string) => {
      let query = supabase
        .from('movimentacoes_estoque')
        .select('codigo_auxiliar')
        .in('tipo_movimentacao', ['ajuste_entrada', 'ajuste_saida']);

      if (vendorCode && vendorCode !== 'todos') {
        query = query.eq('codigo_vendedor', vendorCode);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Erro ao buscar ajustes:", error);
        return new Set<string>();
      }

      return new Set(data.map(item => item.codigo_auxiliar));
    };

    const fetchEstoqueForSingleVendor = async (vendorCode: string) => {
      const [estoqueMap, estoqueRealMap, ajustesSet] = await Promise.all([
        calcularEstoqueTeorico(vendorCode),
        buscarEstoqueReal(vendorCode),
        fetchAjustesRealizados(vendorCode)
      ]);
      const estoqueArray = Array.from(estoqueMap.values());
      setEstoqueBase(estoqueArray);
      setEstoqueReal(estoqueRealMap);
      setAjustesRealizados(ajustesSet);
    };

    const fetchAndConsolidateAllEstoque = async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('codigo_vendedor')
        .eq('role', 'vendedor')
        .not('codigo_vendedor', 'is', null);

      if (error || !profiles) {
        console.error("Erro ao buscar códigos de vendedores:", error);
        setEstoqueBase([]);
        setEstoqueReal(new Map());
        setAjustesRealizados(new Set());
        return;
      }

      const allEstoque = new Map<string, EstoqueItem>();
      const allEstoqueReal = new Map<string, { quantidade_real: number; data_atualizacao: string; inventario_id: string }>();
      const allAjustes = new Set<string>();
      
      for (const p of profiles) {
        if (p.codigo_vendedor) {
          const [vendedorEstoque, vendedorEstoqueReal, ajustesSet] = await Promise.all([
            calcularEstoqueTeorico(p.codigo_vendedor),
            buscarEstoqueReal(p.codigo_vendedor),
            fetchAjustesRealizados(p.codigo_vendedor)
          ]);
          
          for (const [key, item] of vendedorEstoque.entries()) {
            const existing = allEstoque.get(key);
            if (existing) {
              existing.quantidade_remessa += item.quantidade_remessa;
              existing.quantidade_venda += item.quantidade_venda;
              existing.estoque_teorico += item.estoque_teorico;
            } else {
              allEstoque.set(key, { ...item });
            }
          }
          
          // Consolidar estoque real
          for (const [key, item] of vendedorEstoqueReal.entries()) {
            const existing = allEstoqueReal.get(key);
            if (existing) {
              existing.quantidade_real += item.quantidade_real;
            } else {
              allEstoqueReal.set(key, { ...item });
            }
          }

          // Consolidar ajustes
          ajustesSet.forEach(codigo => allAjustes.add(codigo));
        }
      }
      const estoqueArray = Array.from(allEstoque.values());
      setEstoqueBase(estoqueArray);
      setEstoqueReal(allEstoqueReal);
      setAjustesRealizados(allAjustes);
    };

    const loadData = async () => {
      if (!profile) return;
      setLoading(true);
      const vendorCode = isGerente ? selectedVendor : profile.codigo_vendedor;

      if (isGerente && vendorCode === 'todos') {
        await fetchAndConsolidateAllEstoque();
      } else if (vendorCode) {
        await fetchEstoqueForSingleVendor(vendorCode);
      } else {
        setEstoqueBase([]);
      }
      setLoading(false);
    };

    loadData();
  }, [profile, isGerente, selectedVendor]);

  const totalItens = estoque.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalModelos = new Set(estoque.map(e => e.modelo)).size;
  const totalPositivo = estoque
    .filter((item) => item.estoque_teorico > 0)
    .reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalNegativo = estoque
    .filter((item) => item.estoque_teorico < 0)
    .reduce((acc, item) => acc + item.estoque_teorico, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque (Teórico x Real)</h1>
          <p className="text-muted-foreground">
            {isGerente 
              ? 'Compare o estoque teórico com o real de todos os vendedores' 
              : 'Compare seu estoque teórico com o real baseado em inventários'}
          </p>
        </div>

        {/* Alerta de produtos negativos */}
        {produtosNegativos.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive rounded-lg">
            <AlertTriangle className="text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">
                {produtosNegativos.length} produto(s) com estoque negativo
              </p>
              <p className="text-sm text-muted-foreground">
                Verifique divergências de inventário
              </p>
            </div>
            <Link to="/pedidos">
              <Button variant="outline" size="sm">Ver detalhes</Button>
            </Link>
          </div>
        )}

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Total em Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalItens}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Modelos Diferentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalModelos}</p>
            </CardContent>
          </Card>
          
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpCircle size={16} className="text-green-600" />
                Total Positivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{totalPositivo}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownCircle size={16} className="text-destructive" />
                Total Negativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{totalNegativo}</p>
            </CardContent>
          </Card>
        </div>

        {/* Lista de estoque */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Package size={20} />
                Comparação: Teórico x Real
              </span>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {totalItems}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-4">
              <SearchFilter
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Buscar por código ou produto..."
              />
              {isGerente && (
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger className="w-full md:w-44">
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
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="remessa">Com Remessa</SelectItem>
                  <SelectItem value="venda">Com Venda</SelectItem>
                </SelectContent>
              </Select>
              <Select value={saldoFilter} onValueChange={setSaldoFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Saldo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os saldos</SelectItem>
                  <SelectItem value="positivo">Saldo Positivo</SelectItem>
                  <SelectItem value="negativo">Saldo Negativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : totalItems === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto em estoque'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedEstoque.map((item) => (
                  <div 
                    key={item.codigo_auxiliar}
                    className={`p-4 border-2 rounded-lg ${
                      item.estoque_teorico < 0 
                        ? 'border-destructive bg-destructive/5' 
                        : 'border-border'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-sm">
                            {item.codigo_auxiliar}
                          </span>
                          {item.estoque_teorico < 0 && (
                            <AlertTriangle className="text-destructive shrink-0" size={16} />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {item.nome_produto}
                        </p>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Remessas</p>
                          <p className="font-bold text-blue-600">{item.quantidade_remessa}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Vendas</p>
                          <p className="font-bold text-green-600">{item.quantidade_venda}</p>
                        </div>
                        <div className="text-center border-l-2 border-border pl-4">
                          <p className="text-xs text-muted-foreground font-medium">Estoque Real</p>
                          <p className={`font-bold text-xl ${estoqueReal.has(item.codigo_auxiliar) ? 'text-purple-600' : 'text-muted-foreground'}`}>
                            {estoqueReal.get(item.codigo_auxiliar)?.quantidade_real ?? '-'}
                          </p>
                          {estoqueReal.has(item.codigo_auxiliar) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Atualizado
                            </p>
                          )}
                        </div>
                        <div className="text-center border-l-2 border-border pl-4">
                          <p className="text-xs text-muted-foreground font-medium">Saldo Teórico</p>
                          <p className={`font-bold text-xl ${
                            item.estoque_teorico < 0 
                              ? 'text-destructive' 
                              : 'text-foreground'
                          }`}>
                            {item.estoque_teorico}
                          </p>
                        </div>
                        {estoqueReal.has(item.codigo_auxiliar) && (() => {
                          const real = estoqueReal.get(item.codigo_auxiliar)!.quantidade_real;
                          const diff = item.estoque_teorico - real;
                          
                          // Mostrar "OK" se houve ajustes realizados para este produto
                          if (ajustesRealizados.has(item.codigo_auxiliar)) return (
                            <div className="text-center border-l-2 border-border pl-4">
                              <p className="text-xs text-muted-foreground font-medium">Status</p>
                              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-sm px-2 py-1">
                                ✓ Ajustado
                              </Badge>
                            </div>
                          );
                          
                          // Se não houve ajustes, mostrar a diferença
                          return (
                            <div className="text-center border-l-2 border-border pl-4">
                              <p className="text-xs text-muted-foreground font-medium">Diferença</p>
                              <Badge 
                                variant="outline" 
                                className={`text-sm px-2 py-1 font-bold ${
                                  diff > 0 
                                    ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' 
                                    : 'bg-destructive/10 text-destructive border-destructive/30'
                                }`}
                              >
                                {diff > 0 ? '+' : ''}{diff}
                              </Badge>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  ))}
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  itemsPerPage={itemsPerPage}
                  totalItems={totalItems}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}