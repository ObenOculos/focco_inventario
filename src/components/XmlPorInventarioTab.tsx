import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { SearchFilter } from '@/components/SearchFilter';
import { Pagination } from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { FileCode, Loader2, Package, Store, ClipboardCheck, X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { gerarXmlRetornoCiclone, downloadXml, downloadXmlsAsZip } from '@/lib/gerarXmlCiclone';

const LOJAS = [
  { codigo: 1, nome: 'Loja 01' },
  { codigo: 2, nome: 'Loja 02' },
];

const STATUS_STYLES: Record<string, string> = {
  pendente: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  aprovado: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  revisao: 'bg-destructive/10 text-destructive border-destructive/30',
  baixado: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  revisao: 'Não aprovado',
  baixado: 'Baixado',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-lg border ${
        STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground border-border'
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

interface InventarioXml {
  id: string;
  codigo_vendedor: string;
  nome_vendedor: string;
  data_inventario: string;
  status: string;
  total_unidades: number;
  total_produtos: number;
  valor_total: number;
}

/**
 * Lista todos os inventários com seus totais, para servir de base ao XML.
 * Lê apenas inventarios / itens_inventario / produtos — sem pedidos e sem estoque_real.
 */
function useInventariosParaXmlQuery() {
  return useQuery({
    queryKey: ['inventarios-xml'],
    queryFn: async () => {
      const { data: invs, error } = await supabase
        .from('inventarios')
        .select(
          'id, codigo_vendedor, data_inventario, status, profiles!inventarios_user_id_fkey(nome)'
        )
        .order('data_inventario', { ascending: false });
      if (error) throw error;

      const lista = (invs || []) as unknown as Array<{
        id: string;
        codigo_vendedor: string;
        data_inventario: string;
        status: string;
        profiles: { nome: string } | null;
      }>;
      if (lista.length === 0) return [] as InventarioXml[];

      // Itens de todos os inventários, em lotes (limite de 1000 linhas por request)
      const ids = lista.map((i) => i.id);
      const itens: { inventario_id: string; codigo_auxiliar: string; quantidade_fisica: number }[] =
        [];
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
          itens.push(
            ...data.map((d) => ({
              inventario_id: d.inventario_id,
              codigo_auxiliar: d.codigo_auxiliar,
              quantidade_fisica: Number(d.quantidade_fisica) || 0,
            }))
          );
          if (data.length < BATCH) break;
          from += BATCH;
        }
      }

      // Valores para compor o total exibido no card
      const codigos = Array.from(new Set(itens.map((it) => it.codigo_auxiliar)));
      const valorMap = new Map<string, number>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, valor_produto')
          .in('codigo_auxiliar', lote);
        prods?.forEach((p) => valorMap.set(p.codigo_auxiliar, Number(p.valor_produto) || 0));
      }

      const agg = new Map<string, { unidades: number; produtos: Set<string>; valor: number }>();
      for (const it of itens) {
        if (it.quantidade_fisica <= 0) continue;
        const cur =
          agg.get(it.inventario_id) || { unidades: 0, produtos: new Set<string>(), valor: 0 };
        cur.unidades += it.quantidade_fisica;
        cur.produtos.add(it.codigo_auxiliar);
        cur.valor += it.quantidade_fisica * (valorMap.get(it.codigo_auxiliar) || 0);
        agg.set(it.inventario_id, cur);
      }

      return lista.map((inv) => {
        const a = agg.get(inv.id);
        return {
          id: inv.id,
          codigo_vendedor: inv.codigo_vendedor,
          // Achatado para que a busca do usePagination alcance o nome do vendedor
          nome_vendedor: inv.profiles?.nome || inv.codigo_vendedor,
          data_inventario: inv.data_inventario,
          status: inv.status,
          total_unidades: a?.unidades ?? 0,
          total_produtos: a?.produtos.size ?? 0,
          valor_total: a?.valor ?? 0,
        };
      });
    },
    staleTime: 60_000,
  });
}

export function XmlPorInventarioTab() {
  const { data: inventarios = [], isLoading, isFetching } = useInventariosParaXmlQuery();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');

  const [xmlInv, setXmlInv] = useState<InventarioXml | null>(null);
  const [xmlTabela, setXmlTabela] = useState<'venda' | 'remessa'>('venda');
  const [xmlSegmentos, setXmlSegmentos] = useState<number>(1);
  const [xmlLoading, setXmlLoading] = useState(false);

  const vendedoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    inventarios.forEach((i) => {
      if (!map.has(i.codigo_vendedor)) map.set(i.codigo_vendedor, i.nome_vendedor);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [inventarios]);

  const statusDisponiveis = useMemo(() => {
    const counts = new Map<string, number>();
    inventarios.forEach((i) => counts.set(i.status, (counts.get(i.status) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [inventarios]);

  // Facetas aplicadas antes da paginação; a busca textual fica a cargo do usePagination
  const facetados = useMemo(() => {
    return inventarios.filter((i) => {
      if (statusFilter !== 'todos' && i.status !== statusFilter) return false;
      if (vendedorFilter !== 'todos' && i.codigo_vendedor !== vendedorFilter) return false;
      return true;
    });
  }, [inventarios, statusFilter, vendedorFilter]);

  const { paginatedData, ...paginationProps } = usePagination({
    data: facetados,
    searchTerm,
    searchFields: ['nome_vendedor', 'codigo_vendedor'],
    itemsPerPage: 12,
  });

  const filtrosAtivos =
    searchTerm.trim() !== '' || statusFilter !== 'todos' || vendedorFilter !== 'todos';

  const limparFiltros = () => {
    setSearchTerm('');
    setStatusFilter('todos');
    setVendedorFilter('todos');
  };

  const handleGerarXml = async (loja: { codigo: number; nome: string }) => {
    if (!xmlInv) return;
    setXmlLoading(true);
    try {
      // Itens do inventário selecionado (paginado)
      const itensInv: {
        codigo_auxiliar: string;
        quantidade_fisica: number;
        nome_produto: string | null;
      }[] = [];
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
        itensInv.push(
          ...data.map((d) => ({
            codigo_auxiliar: d.codigo_auxiliar,
            quantidade_fisica: Number(d.quantidade_fisica) || 0,
            nome_produto: d.nome_produto,
          }))
        );
        if (data.length < BATCH) break;
        from += BATCH;
      }

      const itensValidos = itensInv.filter((i) => i.quantidade_fisica > 0);
      if (itensValidos.length === 0) {
        toast.error('Inventário sem itens com quantidade para gerar XML.');
        return;
      }

      // Preços e nomes na tabela produtos
      const codigos = Array.from(new Set(itensValidos.map((i) => i.codigo_auxiliar)));
      const prodMap = new Map<
        string,
        { nome_produto: string; valor_produto: number; valor_remessa: number }
      >();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: prods } = await supabase
          .from('produtos')
          .select('codigo_auxiliar, nome_produto, valor_produto, valor_remessa')
          .in('codigo_auxiliar', lote);
        prods?.forEach((p) =>
          prodMap.set(p.codigo_auxiliar, {
            nome_produto: p.nome_produto,
            valor_produto: Number(p.valor_produto) || 0,
            valor_remessa: Number(p.valor_remessa) || 0,
          })
        );
      }

      const itensXml = itensValidos.map((it) => {
        const p = prodMap.get(it.codigo_auxiliar);
        return {
          codigo_auxiliar: it.codigo_auxiliar,
          nome_produto: p?.nome_produto || it.nome_produto || it.codigo_auxiliar,
          quantidade: it.quantidade_fisica,
          valor_unitario: xmlTabela === 'remessa' ? p?.valor_remessa || 0 : p?.valor_produto || 0,
        };
      });

      const requested = Math.max(1, Math.min(10, xmlSegmentos));
      const effectiveSegmentos = Math.min(requested, itensXml.length);
      if (effectiveSegmentos < requested) {
        toast.warning(`Só há ${itensXml.length} item(ns). Gerando ${effectiveSegmentos} pedido(s).`);
      }

      const buckets: (typeof itensXml)[] = Array.from({ length: effectiveSegmentos }, () => []);
      itensXml.forEach((item, idx) => buckets[idx % effectiveSegmentos].push(item));

      const dataIso = new Date().toISOString().split('T')[0];
      const arquivos = buckets.map((bucket, i) => {
        const xml = gerarXmlRetornoCiclone({
          codigoVendedor: xmlInv.codigo_vendedor,
          nomeVendedor: xmlInv.nome_vendedor,
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
      toast.error('Falha ao gerar XML.', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    } finally {
      setXmlLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            XML Ciclone a partir de Inventário
            <RefetchIndicator isFetching={isFetching && !isLoading} />
          </CardTitle>
          <CardDescription>
            As quantidades vêm da contagem do inventário e os valores unitários da tabela de
            produtos. Gerar o XML apenas produz o arquivo — não altera o inventário nem registra
            nada no sistema, então pode ser gerado quantas vezes for necessário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <SearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Buscar por vendedor ou código..."
              className="max-w-none lg:max-w-sm"
            />

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-52 h-11 rounded-xl">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status ({inventarios.length})</SelectItem>
                {statusDisponiveis.map(([status, count]) => (
                  <SelectItem key={status} value={status}>
                    {STATUS_LABELS[status] ?? status} ({count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger className="w-full lg:w-72 h-11 rounded-xl">
                <SelectValue placeholder="Vendedor" />
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

            {filtrosAtivos && (
              <Button variant="ghost" onClick={limparFiltros} className="h-11 rounded-xl">
                <X className="h-4 w-4 mr-1.5" />
                Limpar
              </Button>
            )}
          </div>

          {filtrosAtivos && (
            <p className="text-xs text-muted-foreground">
              {paginationProps.totalItems} de {inventarios.length} inventários correspondem aos
              filtros.
            </p>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando inventários...</span>
        </div>
      ) : paginationProps.totalItems === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="font-medium mb-1">
              {inventarios.length === 0
                ? 'Nenhum inventário registrado.'
                : 'Nenhum inventário corresponde aos filtros.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {inventarios.length === 0
                ? 'Inventários salvos pelos vendedores aparecem aqui.'
                : 'Ajuste ou limpe os filtros para ver outros inventários.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedData.map((inv) => {
              const semItens = inv.total_unidades === 0;
              return (
                <Card
                  key={inv.id}
                  className="border border-border/80 rounded-2xl shadow-xs hover:shadow-md transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{inv.nome_vendedor}</CardTitle>
                        <p className="font-mono text-xs text-muted-foreground pt-0.5">
                          {inv.codigo_vendedor}
                        </p>
                      </div>
                      <StatusBadge status={inv.status} />
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
                        {inv.valor_total.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </strong>
                    </div>
                    <Button
                      className="w-full"
                      size="sm"
                      disabled={semItens}
                      onClick={() => setXmlInv(inv)}
                    >
                      <FileCode className="h-4 w-4 mr-2" />
                      {semItens ? 'Sem itens contados' : 'Exportar XML Ciclone'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {paginationProps.totalPages > 1 && <Pagination {...paginationProps} />}
        </>
      )}

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
              Inventário de <strong>{xmlInv?.nome_vendedor}</strong>
              {xmlInv && ` · ${format(new Date(xmlInv.data_inventario), 'dd/MM/yyyy')}`}. Escolha
              tabela de preço, segmentação e a loja.
            </DialogDescription>
          </DialogHeader>

          {xmlInv && xmlInv.status !== 'aprovado' && (
            <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-300">
                Este inventário está como{' '}
                <strong>{STATUS_LABELS[xmlInv.status] ?? xmlInv.status}</strong>, não aprovado. As
                quantidades podem ainda mudar na conferência.
              </p>
            </div>
          )}

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
              <strong>
                {xmlTabela === 'venda' ? 'de venda (valor_produto)' : 'de remessa (valor_remessa)'}
              </strong>
              .
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
            {LOJAS.map((loja) => (
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
