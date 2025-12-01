import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  Package, 
  TrendingUp, 
  TrendingDown,
  FileText
} from 'lucide-react';
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
  const [expanded, setExpanded] = useState(false);
  const [showItens, setShowItens] = useState(false);
  const [showPedidos, setShowPedidos] = useState(false);

  return (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold truncate">
              {nome_vendedor}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{codigo_vendedor}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="ml-2"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumo sempre visível */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp size={14} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">Remessas</span>
            </div>
            <p className="text-xl font-bold text-blue-800 dark:text-blue-200">{totalRemessas}</p>
          </div>
          <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown size={14} className="text-green-600 dark:text-green-400" />
              <span className="text-xs text-green-700 dark:text-green-300 font-medium">Vendas</span>
            </div>
            <p className="text-xl font-bold text-green-800 dark:text-green-200">{totalVendas}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-1 mb-1">
              <Package size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Estoque</span>
            </div>
            <p className={`text-xl font-bold ${estoqueAtual < 0 ? 'text-destructive' : ''}`}>
              {estoqueAtual}
            </p>
          </div>
        </div>

        {/* Detalhes expandidos */}
        {expanded && (
          <div className="space-y-3 pt-3 border-t">
            {/* Toggle Itens */}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowItens(!showItens)}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <Package size={14} />
                  Itens em Estoque ({itens.length})
                </span>
                {showItens ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
              
              {showItens && itens.length > 0 && (
                <ScrollArea className="h-[200px] mt-2 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Código</TableHead>
                        <TableHead className="text-xs text-right">Remessas</TableHead>
                        <TableHead className="text-xs text-right">Vendas</TableHead>
                        <TableHead className="text-xs text-right">Estoque</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item) => (
                        <TableRow key={item.codigo_auxiliar}>
                          <TableCell className="text-xs font-medium">
                            {item.codigo_auxiliar}
                          </TableCell>
                          <TableCell className="text-xs text-right text-blue-600 dark:text-blue-400">
                            {item.quantidade_remessa}
                          </TableCell>
                          <TableCell className="text-xs text-right text-green-600 dark:text-green-400">
                            {item.quantidade_venda}
                          </TableCell>
                          <TableCell className={`text-xs text-right font-semibold ${
                            item.estoque_teorico < 0 ? 'text-destructive' : ''
                          }`}>
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
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} />
                  Pedidos Recentes ({pedidosRecentes.length})
                </span>
                {showPedidos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
              
              {showPedidos && pedidosRecentes.length > 0 && (
                <ScrollArea className="h-[200px] mt-2 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Pedido</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pedidosRecentes.map((pedido) => (
                        <TableRow key={pedido.numero_pedido}>
                          <TableCell className="text-xs font-medium">
                            {pedido.numero_pedido}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(pedido.data_emissao).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge 
                              variant="secondary" 
                              className={pedido.codigo_tipo === 7 
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' 
                                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
                              }
                            >
                              {pedido.codigo_tipo === 7 ? 'Remessa' : 'Venda'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            R$ {pedido.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
