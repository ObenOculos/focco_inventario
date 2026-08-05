import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageLoader } from '@/components/PageLoader';
import { StatusInventarioBadge, rotuloStatusInventario } from '@/components/StatusInventarioBadge';
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
import { Pagination } from '@/components/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useFiltroAno } from '@/hooks/useFiltroAno';
import { FileCode, Loader2, Package, Store, X, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { gerarXmlRetornoCiclone, downloadXml, downloadXmlsAsZip } from '@/lib/gerarXmlCiclone';

const LOJAS = [
  { codigo: 1, nome: 'Loja 01' },
  { codigo: 2, nome: 'Loja 02' },
];

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

      // Valores para compor o total exibido na lista
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
        const cur = agg.get(it.inventario_id) || {
          unidades: 0,
          produtos: new Set<string>(),
          valor: 0,
        };
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

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Geração de XML Ciclone a partir de um inventário.
 *
 * Estruturada nos mesmos dois blocos de Comparar Inventários — **escopo** em cima
 * (ano · vendedor · status) e **resultado** embaixo (contagem no cabeçalho, lista no corpo).
 * A separação não é estética: ano, vendedor e status definem *o que entra na lista*,
 * enquanto a busca filtra *o que já entrou*. Antes os quatro dividiam a mesma barra.
 *
 * A listagem continua em cartões: nesta tela cada inventário é um alvo de ação — escolher
 * um e gerar o arquivo — e não uma linha para comparar com as vizinhas. Os cartões agora
 * moram DENTRO do cartão de resultado, em vez de flutuarem soltos na página.
 */
export function XmlPorInventarioTab() {
  const { data: inventarios = [], isLoading, isFetching } = useInventariosParaXmlQuery();

  const { anos, ano, setAno, itensDoAno } = useFiltroAno(inventarios);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');

  const [xmlInv, setXmlInv] = useState<InventarioXml | null>(null);
  const [xmlTabela, setXmlTabela] = useState<'venda' | 'remessa'>('venda');
  const [xmlSegmentos, setXmlSegmentos] = useState<number>(1);
  const [xmlLoading, setXmlLoading] = useState(false);

  // Vendedores e status são apurados DENTRO do ano: oferecer opção que não existe no
  // recorte atual leva o usuário a um resultado vazio sem explicação.
  const vendedoresUnicos = useMemo(() => {
    const map = new Map<string, string>();
    itensDoAno.forEach((i) => {
      if (!map.has(i.codigo_vendedor)) map.set(i.codigo_vendedor, i.nome_vendedor);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [itensDoAno]);

  const statusDisponiveis = useMemo(() => {
    const counts = new Map<string, number>();
    itensDoAno.forEach((i) => counts.set(i.status, (counts.get(i.status) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [itensDoAno]);

  // Facetas aplicadas antes da paginação; a busca textual fica a cargo do usePagination
  const facetados = useMemo(
    () =>
      itensDoAno.filter((i) => {
        if (statusFilter !== 'todos' && i.status !== statusFilter) return false;
        if (vendedorFilter !== 'todos' && i.codigo_vendedor !== vendedorFilter) return false;
        return true;
      }),
    [itensDoAno, statusFilter, vendedorFilter]
  );

  // Sem busca textual: o campo procurava por nome e código de vendedor, exatamente o que o
  // select de Vendedor logo acima resolve — e com precisão, em vez de por correspondência
  // parcial. Dois controles para o mesmo recorte só dividem a atenção.
  const { paginatedData, ...paginationProps } = usePagination({
    data: facetados,
    itemsPerPage: 12,
  });

  const filtrosAtivos = statusFilter !== 'todos' || vendedorFilter !== 'todos';

  const limparFiltros = () => {
    setStatusFilter('todos');
    setVendedorFilter('todos');
  };

  // Trocar de ano zera os recortes de dentro dele — o vendedor escolhido pode não ter
  // inventário no ano novo, e o status pode não ocorrer lá.
  const trocarAno = (novo: string) => {
    setAno(novo);
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
        toast.warning(
          `Só há ${itensXml.length} item(ns). Gerando ${effectiveSegmentos} pedido(s).`
        );
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
      {/* ── Escopo ───────────────────────────────────────────────────────────────
          Sem título nem descrição: o <h1> da página e o rótulo da aba já dizem o que
          é a tela, e o card de filtros não precisa se apresentar. A ressalva de que
          gerar não altera nada foi para o diálogo, onde é lida na hora de gerar. */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid items-end gap-3 lg:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ano
              </Label>
              <Select value={ano} onValueChange={trocarAno} disabled={isLoading}>
                <SelectTrigger className="w-full lg:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anos.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendedor
              </Label>
              <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
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

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status ({itensDoAno.length})</SelectItem>
                  {statusDisponiveis.map(([status, count]) => (
                    <SelectItem key={status} value={status}>
                      {rotuloStatusInventario(status)} ({count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filtrosAtivos && (
              <Button variant="ghost" onClick={limparFiltros} className="w-full lg:w-auto">
                <X className="h-4 w-4" />
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Resultado ────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <Card>
          <PageLoader inline label="Carregando inventários" />
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <CardTitle>
                {paginationProps.totalItems}{' '}
                {paginationProps.totalItems === 1 ? 'inventário' : 'inventários'}
              </CardTitle>
              {filtrosAtivos && (
                <span className="text-xs font-normal text-muted-foreground">
                  de {itensDoAno.length}
                </span>
              )}
              <RefetchIndicator isFetching={isFetching && !isLoading} />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {paginationProps.totalItems === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Package className="size-7" />
                </div>
                <p className="text-base font-semibold">
                  {inventarios.length === 0
                    ? 'Nenhum inventário registrado'
                    : 'Nenhum inventário no recorte atual'}
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {inventarios.length === 0
                    ? 'Inventários salvos pelos vendedores aparecem aqui.'
                    : `Não há inventário em ${ano === 'todos' ? 'nenhum ano' : ano} com esses filtros.`}
                </p>
                {filtrosAtivos && (
                  <Button variant="ghost" size="sm" onClick={limparFiltros} className="mt-3">
                    Limpar filtros
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Cartões, e não tabela: aqui cada inventário é um alvo de ação — a leitura
                    é "escolher um e gerar", não "comparar números entre linhas". O botão de
                    largura total dentro do cartão é o ponto da tela. */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedData.map((inv) => {
                    const semItens = inv.total_unidades === 0;
                    return (
                      <div
                        key={inv.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/80 p-4 transition-colors hover:border-primary/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{inv.nome_vendedor}</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {inv.codigo_vendedor}
                            </p>
                          </div>
                          <StatusInventarioBadge status={inv.status} />
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Package size={14} />
                            <span className="tabular-nums">
                              {inv.total_produtos} produtos · {inv.total_unidades} un.
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {format(new Date(inv.data_inventario), 'dd/MM/yyyy')}
                          </span>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Valor:{' '}
                          <strong className="tabular-nums text-foreground">
                            {moeda(inv.valor_total)}
                          </strong>
                        </div>

                        <Button
                          className="mt-auto w-full"
                          size="sm"
                          disabled={semItens}
                          onClick={() => setXmlInv(inv)}
                        >
                          <FileCode className="h-4 w-4" />
                          {semItens ? 'Sem itens contados' : 'Gerar XML Ciclone'}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {paginationProps.totalPages > 1 && <Pagination {...paginationProps} />}
              </>
            )}
          </CardContent>
        </Card>
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
              {xmlInv && ` · ${format(new Date(xmlInv.data_inventario), 'dd/MM/yyyy')}`}. Gerar
              apenas produz o arquivo — não altera o inventário nem registra nada, então pode
              ser repetido quantas vezes precisar.
            </DialogDescription>
          </DialogHeader>

          {xmlInv && xmlInv.status !== 'aprovado' && (
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-subtle p-3 text-xs">
              <TriangleAlert className="h-4 w-4 shrink-0 text-warning-strong" />
              <p className="text-warning-strong">
                Este inventário está como <strong>{rotuloStatusInventario(xmlInv.status)}</strong>,
                não aprovado. As quantidades podem ainda mudar na conferência.
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

          <p className="pt-2 text-sm font-medium">Loja</p>
          <div className="grid grid-cols-2 gap-3 py-2">
            {LOJAS.map((loja) => (
              <Button
                key={loja.codigo}
                variant="outline"
                className="flex h-20 flex-col gap-2"
                disabled={xmlLoading}
                onClick={() => handleGerarXml(loja)}
              >
                {xmlLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Store className="h-5 w-5" />
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
