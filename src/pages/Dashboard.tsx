import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Package, TrendingUp, TrendingDown, ClipboardList, Search } from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalItens: 0,
    totalModelos: 0,
    inventariosPendentes: 0,
  });

  useEffect(() => {
    fetchEstoque();
    fetchStats();
  }, [profile]);

  const fetchEstoque = async () => {
    if (!profile) return;

    const codigoVendedor = profile.role === 'gerente' ? null : profile.codigo_vendedor;
    
    // Buscar todos os itens de pedido com seus pedidos
    let query = supabase
      .from('itens_pedido')
      .select(`
        codigo_auxiliar,
        nome_produto,
        quantidade,
        pedidos!inner (
          codigo_vendedor,
          codigo_tipo
        )
      `);

    if (codigoVendedor) {
      query = query.eq('pedidos.codigo_vendedor', codigoVendedor);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar estoque:', error);
      setLoading(false);
      return;
    }

    // Agrupar por codigo_auxiliar e calcular estoque
    const estoqueMap = new Map<string, EstoqueItem>();

    data?.forEach((item: any) => {
      const key = item.codigo_auxiliar;
      const existing = estoqueMap.get(key) || {
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        modelo: item.codigo_auxiliar.split(' ')[0] || '',
        cor: item.codigo_auxiliar.split(' ')[1] || '',
        quantidade_remessa: 0,
        quantidade_venda: 0,
        estoque_teorico: 0,
      };

      const quantidade = Number(item.quantidade) || 0;
      const codigoTipo = item.pedidos?.codigo_tipo;

      if (codigoTipo === 7) {
        existing.quantidade_remessa += quantidade;
      } else if (codigoTipo === 2) {
        existing.quantidade_venda += quantidade;
      }

      existing.estoque_teorico = existing.quantidade_remessa - existing.quantidade_venda;
      estoqueMap.set(key, existing);
    });

    setEstoque(Array.from(estoqueMap.values()).filter(e => e.estoque_teorico !== 0));
    setLoading(false);
  };

  const fetchStats = async () => {
    if (!profile) return;

    const codigoVendedor = profile.role === 'gerente' ? null : profile.codigo_vendedor;

    // Contar inventários pendentes
    let inventarioQuery = supabase
      .from('inventarios')
      .select('id', { count: 'exact' })
      .eq('status', 'pendente');

    if (codigoVendedor) {
      inventarioQuery = inventarioQuery.eq('codigo_vendedor', codigoVendedor);
    }

    const { count: inventariosPendentes } = await inventarioQuery;

    setStats({
      totalItens: estoque.reduce((acc, item) => acc + item.estoque_teorico, 0),
      totalModelos: new Set(estoque.map(e => e.modelo)).size,
      inventariosPendentes: inventariosPendentes || 0,
    });
  };

  useEffect(() => {
    if (estoque.length > 0) {
      fetchStats();
    }
  }, [estoque]);

  const filteredEstoque = estoque.filter(item =>
    item.codigo_auxiliar.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.nome_produto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {profile?.role === 'gerente' 
              ? 'Visão geral do estoque de todos os vendedores' 
              : 'Seu estoque teórico atual'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package size={16} />
                Total em Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalItens}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp size={16} />
                Modelos Diferentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalModelos}</p>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardList size={16} />
                Inventários Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.inventariosPendentes}</p>
            </CardContent>
          </Card>
        </div>

        {/* Estoque Table */}
        <Card className="border-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Estoque Teórico</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Buscar produto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 border-2"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredEstoque.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum item em estoque'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-foreground">
                      <th className="text-left py-3 px-2 font-bold">Código</th>
                      <th className="text-left py-3 px-2 font-bold hidden sm:table-cell">Produto</th>
                      <th className="text-center py-3 px-2 font-bold">
                        <TrendingUp size={14} className="inline mr-1" />
                        Remessa
                      </th>
                      <th className="text-center py-3 px-2 font-bold">
                        <TrendingDown size={14} className="inline mr-1" />
                        Venda
                      </th>
                      <th className="text-center py-3 px-2 font-bold">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEstoque.map((item) => (
                      <tr key={item.codigo_auxiliar} className="border-b border-border hover:bg-secondary/50">
                        <td className="py-3 px-2">
                          <div className="font-mono font-medium">{item.codigo_auxiliar}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">{item.nome_produto}</div>
                        </td>
                        <td className="py-3 px-2 hidden sm:table-cell text-sm">{item.nome_produto}</td>
                        <td className="py-3 px-2 text-center text-green-600 font-medium">{item.quantidade_remessa}</td>
                        <td className="py-3 px-2 text-center text-red-600 font-medium">{item.quantidade_venda}</td>
                        <td className="py-3 px-2 text-center">
                          <span className={`inline-block px-3 py-1 font-bold ${
                            item.estoque_teorico > 0 
                              ? 'bg-green-100 text-green-800' 
                              : item.estoque_teorico < 0 
                                ? 'bg-red-100 text-red-800'
                                : 'bg-secondary'
                          }`}>
                            {item.estoque_teorico}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
