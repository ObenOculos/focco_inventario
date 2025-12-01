import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { EstoqueItem } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Package, Search, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function EstoqueTeorico() {
  const { profile } = useAuth();
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [produtosNegativos, setProdutosNegativos] = useState<EstoqueItem[]>([]);

  const isGerente = profile?.role === 'gerente';

  useEffect(() => {
    if (profile) {
      fetchEstoque();
    }
  }, [profile]);

  const fetchEstoque = async () => {
    if (!profile) return;

    const codigoVendedor = isGerente ? null : profile.codigo_vendedor;
    
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

    const estoqueArray = Array.from(estoqueMap.values()).filter(e => e.estoque_teorico !== 0);
    setEstoque(estoqueArray);
    setProdutosNegativos(estoqueArray.filter(e => e.estoque_teorico < 0));
    setLoading(false);
  };

  const filteredEstoque = estoque.filter(item =>
    item.codigo_auxiliar.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.nome_produto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItens = estoque.reduce((acc, item) => acc + item.estoque_teorico, 0);
  const totalModelos = new Set(estoque.map(e => e.modelo)).size;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque Teórico</h1>
          <p className="text-muted-foreground">
            {isGerente 
              ? 'Visualize o estoque teórico de todos os vendedores' 
              : 'Seu estoque teórico baseado em remessas e vendas'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>

        {/* Lista de estoque */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <Package size={20} />
                Produtos em Estoque
              </span>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {filteredEstoque.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Buscar por código ou produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 border-2"
              />
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredEstoque.length === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto em estoque'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEstoque.map((item) => (
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
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Remessas</p>
                          <p className="font-bold text-blue-600">{item.quantidade_remessa}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Vendas</p>
                          <p className="font-bold text-green-600">{item.quantidade_venda}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Saldo</p>
                          <p className={`font-bold text-lg ${
                            item.estoque_teorico < 0 
                              ? 'text-destructive' 
                              : 'text-foreground'
                          }`}>
                            {item.estoque_teorico}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
