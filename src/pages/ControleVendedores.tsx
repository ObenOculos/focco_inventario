import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { VendedorEstoqueCard } from '@/components/VendedorEstoqueCard';
import { calcularEstoqueTeorico } from '@/lib/estoque';
import { EstoqueItem } from '@/types/database';
import { SearchFilter } from '@/components/SearchFilter';
import { Users, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VendedorEstoque {
  codigo_vendedor: string;
  nome_vendedor: string;
  totalRemessas: number;
  totalVendas: number;
  estoqueAtual: number;
  itens: EstoqueItem[];
  pedidosRecentes: any[];
}

export default function ControleVendedores() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<VendedorEstoque[]>([]);
  const [filteredVendedores, setFilteredVendedores] = useState<VendedorEstoque[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (profile?.role === 'gerente') {
      fetchVendedoresEstoque();
    }
  }, [profile]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredVendedores(vendedores);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredVendedores(
        vendedores.filter(
          (v) =>
            v.nome_vendedor.toLowerCase().includes(lower) ||
            v.codigo_vendedor.toLowerCase().includes(lower)
        )
      );
    }
  }, [searchTerm, vendedores]);

  const fetchVendedoresEstoque = async () => {
    setLoading(true);
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('codigo_vendedor, nome')
      .eq('role', 'vendedor')
      .not('codigo_vendedor', 'is', null);

    if (profilesError || !profiles) {
      console.error('Erro ao buscar vendedores:', profilesError);
      setLoading(false);
      return;
    }

    const vendedoresData: VendedorEstoque[] = [];

    for (const vendedor of profiles) {
      const estoqueMap = await calcularEstoqueTeorico(vendedor.codigo_vendedor!);
      const itensArray = Array.from(estoqueMap.values());

      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('numero_pedido, data_emissao, codigo_tipo, situacao, valor_total')
        .eq('codigo_vendedor', vendedor.codigo_vendedor)
        .order('data_emissao', { ascending: false })
        .limit(10);

      const totalRemessas = itensArray.reduce((sum, item) => sum + item.quantidade_remessa, 0);
      const totalVendas = itensArray.reduce((sum, item) => sum + item.quantidade_venda, 0);
      const estoqueAtual = itensArray.reduce((sum, item) => sum + item.estoque_teorico, 0);

      vendedoresData.push({
        codigo_vendedor: vendedor.codigo_vendedor!,
        nome_vendedor: vendedor.nome,
        totalRemessas,
        totalVendas,
        estoqueAtual,
        itens: itensArray.sort((a, b) => b.estoque_teorico - a.estoque_teorico),
        pedidosRecentes: pedidos || [],
      });
    }

    vendedoresData.sort((a, b) => {
      if (a.estoqueAtual < 0 && b.estoqueAtual >= 0) return -1;
      if (a.estoqueAtual >= 0 && b.estoqueAtual < 0) return 1;
      return Math.abs(b.estoqueAtual) - Math.abs(a.estoqueAtual);
    });

    setVendedores(vendedoresData);
    setFilteredVendedores(vendedoresData);
    setLoading(false);
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

  const vendedoresComEstoqueNegativo = vendedores.filter(v => v.estoqueAtual < 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="text-primary" />
            Controle de Vendedores
          </h1>
          <p className="text-muted-foreground text-base">
            Visualize remessas, vendas, pedidos e itens em estoque de cada vendedor
          </p>
        </div>

        {/* Alertas */}
        {vendedoresComEstoqueNegativo.length > 0 && (
          <Alert variant="destructive" className="border-2">
            <AlertTriangle className="h-5 w-5" />
            <AlertDescription className="text-base">
              <strong>{vendedoresComEstoqueNegativo.length} vendedor(es)</strong> com estoque negativo:{' '}
              {vendedoresComEstoqueNegativo.map(v => v.nome_vendedor).join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats e Busca */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Total de Vendedores</p>
              <p className="text-2xl font-bold">{vendedores.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Com Estoque Negativo</p>
              <p className="text-2xl font-bold text-destructive">{vendedoresComEstoqueNegativo.length}</p>
            </div>
          </div>
          
          <SearchFilter
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nome ou código..."
          />
        </div>

        {/* Lista de Vendedores */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando dados dos vendedores...</p>
          </div>
        ) : filteredVendedores.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm ? 'Nenhum vendedor encontrado com esse termo.' : 'Nenhum vendedor cadastrado.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredVendedores.map((vendedor) => (
              <VendedorEstoqueCard
                key={vendedor.codigo_vendedor}
                codigo_vendedor={vendedor.codigo_vendedor}
                nome_vendedor={vendedor.nome_vendedor}
                totalRemessas={vendedor.totalRemessas}
                totalVendas={vendedor.totalVendas}
                estoqueAtual={vendedor.estoqueAtual}
                itens={vendedor.itens}
                pedidosRecentes={vendedor.pedidosRecentes}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
