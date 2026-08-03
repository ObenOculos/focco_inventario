import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Package, TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ItemEstoque {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_remessa: number;
  quantidade_venda: number;
  estoque_teorico: number;
}

interface Pedido {
  numero_pedido: string;
  data_emissao: string;
  codigo_tipo: number;
  situacao: string;
  valor_total: number;
}

interface VendedorEstoqueCardProps {
  codigo_vendedor: string;
  nome_vendedor: string;
  totalRemessas: number;
  totalVendas: number;
  estoqueAtual: number;
  itens: ItemEstoque[];
  pedidosRecentes: Pedido[];
}

export function VendedorEstoqueCard({
  codigo_vendedor,
  nome_vendedor,
  totalRemessas,
  totalVendas,
  estoqueAtual,
  itens,
  pedidosRecentes,
}: VendedorEstoqueCardProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [showItens, setShowItens] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);

  return (
    <Card className="border border-border/80 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate tracking-tight">{nome_vendedor}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{codigo_vendedor}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="ml-2 rounded-lg">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumo sempre visível */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="p-3 border border-blue-500/20 rounded-xl bg-blue-500/5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp size={14} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold uppercase tracking-wider text-[10px]">Remessas</span>
            </div>
            <p className="text-xl font-bold tracking-tight text-blue-700 dark:text-blue-300">{totalRemessas}</p>
          </div>
          <div className="p-3 border border-emerald-500/20 rounded-xl bg-emerald-500/5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold uppercase tracking-wider text-[10px]">Vendas</span>
            </div>
            <p className="text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{totalVendas}</p>
          </div>
          <div className="p-3 border border-border/70 rounded-xl bg-card">
            <div className="flex items-center gap-1 mb-1">
              <Package size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Estoque</span>
            </div>
            <p className={`text-xl font-bold tracking-tight ${estoqueAtual < 0 ? 'text-destructive' : ''}`}>
              {estoqueAtual}
            </p>
          </div>
        </div>

        {/* Detalhes expandidos */}
        {expanded && (
          <div className="space-y-3 pt-3 border-t border-border/80">
            {/* Toggle Itens */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowItens(!showItens)}
                className="w-full justify-between rounded-xl shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <Package size={14} />
                  {!isMobile && 'Itens em Estoque'}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">{itens.length}</Badge>
                  {showItens ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </Button>

              {showItens && itens.length > 0 && (
                <ScrollArea className="h-[200px] mt-2 border border-border/80 rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs font-semibold">Código</TableHead>
                        <TableHead className="text-xs text-right font-semibold">Remessas</TableHead>
                        <TableHead className="text-xs text-right font-semibold">Vendas</TableHead>
                        <TableHead className="text-xs text-right font-semibold">Estoque</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item) => (
                        <TableRow key={item.codigo_auxiliar} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-mono font-medium">
                            {item.codigo_auxiliar}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium text-blue-600 dark:text-blue-400">
                            {item.quantidade_remessa}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {item.quantidade_venda}
                          </TableCell>
                          <TableCell
                            className={`text-xs text-right font-bold ${
                              item.estoque_teorico < 0 ? 'text-destructive' : ''
                            }`}
                          >
                            {item.estoque_teorico}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>

            {/* Toggle Pedidos */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPedidos(!showPedidos)}
                className="w-full justify-between rounded-xl shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} />
                  {!isMobile && 'Pedidos Recentes'}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">{pedidosRecentes.length}</Badge>
                  {showPedidos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </Button>

              {showPedidos && pedidosRecentes.length > 0 && (
                <ScrollArea className="h-[200px] mt-2 border border-border/80 rounded-xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs font-semibold">Pedido</TableHead>
                        <TableHead className="text-xs font-semibold">Data</TableHead>
                        <TableHead className="text-xs font-semibold">Tipo</TableHead>
                        <TableHead className="text-xs text-right font-semibold">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosRecentes.map((pedido) => (
                        <TableRow key={pedido.numero_pedido} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-mono font-medium">
                            {pedido.numero_pedido}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(pedido.data_emissao).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="secondary"
                              className={
                                pedido.codigo_tipo === 7
                                  ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-md'
                                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-md'
                              }
                            >
                              {pedido.codigo_tipo === 7 ? 'Remessa' : 'Venda'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium">
                            R${' '}
                            {pedido.valor_total.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
