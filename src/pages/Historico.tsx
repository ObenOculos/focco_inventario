import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useInventariosQuery } from '@/hooks/useInventariosQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, ChevronDown, ChevronUp, FileDown } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import { ListaCardsSkeleton } from '@/components/skeletons/CardSkeleton';

import * as XLSX from 'xlsx';

type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
};

export default function Historico() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: inventarios = [], isLoading: loading } = useInventariosQuery(
    profile?.codigo_vendedor
  );

  // Cor e rótulo do status agora vêm de `StatusInventarioBadge`, usado também em
  // Vendedores. O `Record<InventoryStatus, …>` que garantia cobertura do enum foi
  // preservado lá dentro.

  const handleExportExcel = (inventario: InventarioComItens) => {
    const dataExport = inventario.itens_inventario.map((item) => ({
      'Código Auxiliar': item.codigo_auxiliar,
      Produto: item.nome_produto || '',
      'Quantidade Física': item.quantidade_fisica,
    }));

    const ws = XLSX.utils.json_to_sheet(dataExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');

    const dataFormatada = format(new Date(inventario.data_inventario), 'yyyy-MM-dd');
    XLSX.writeFile(wb, `inventario_${dataFormatada}.xlsx`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Histórico de Inventários"
          description="Acompanhe seus inventários anteriores e seus status de conferência"
        />

        {loading ? (
          <ListaCardsSkeleton />
        ) : inventarios.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList size={48} className="mx-auto mb-4 text-muted-foreground/60" />
              <h2 className="text-xl font-bold mb-2">Nenhum inventário encontrado</h2>
              <p className="text-muted-foreground text-sm">Você ainda não realizou nenhum inventário.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {inventarios.map((inventario) => (
              <Card key={inventario.id} className="transition-shadow hover:shadow-md">
                <CardHeader
                  className="cursor-pointer py-4 sm:py-5"
                  onClick={() => setExpandedId(expandedId === inventario.id ? null : inventario.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
                        {format(new Date(inventario.data_inventario), "dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 font-medium">
                        {inventario.itens_inventario.reduce(
                          (sum, item) => sum + item.quantidade_fisica,
                          0
                        )}{' '}
                        itens contados • às {format(new Date(inventario.data_inventario), 'HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 self-start sm:self-auto">
                      <StatusInventarioBadge status={inventario.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl h-9 shadow-2xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportExcel(inventario);
                        }}
                        title="Exportar Excel"
                      >
                        <FileDown size={16} />
                      </Button>
                      {inventario.status === 'revisao' && (
                        <Button
                          size="sm"
                          className="rounded-xl h-9 font-semibold"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/inventario/${inventario.id}`);
                          }}
                        >
                          Editar
                        </Button>
                      )}
                      <div className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                        {expandedId === inventario.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {expandedId === inventario.id && (
                  <CardContent className="border-t border-border/80 pt-5 space-y-4">
                    {inventario.observacoes && (
                      <div className="p-3.5 bg-muted/50 rounded-xl border border-border/60">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Suas observações:</p>
                        <p className="text-sm text-foreground">{inventario.observacoes}</p>
                      </div>
                    )}

                    {inventario.observacoes_gerente && (
                      <div className="p-3.5 bg-warning-subtle border border-warning/30 rounded-xl">
                        <p className="text-xs font-semibold text-warning-strong uppercase tracking-wider mb-1">
                          Observações do gerente:
                        </p>
                        <p className="text-sm text-warning-strong font-medium">{inventario.observacoes_gerente}</p>
                      </div>
                    )}

                    <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="text-left py-2.5 px-4 font-semibold">Código</th>
                            <th className="text-left py-2.5 px-4 font-semibold hidden sm:table-cell">
                              Produto
                            </th>
                            <th className="text-center py-2.5 px-4 font-semibold">Qtd</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventario.itens_inventario.map((item) => (
                            <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-sm">{item.codigo_auxiliar}</td>
                              <td className="py-2.5 px-4 text-sm hidden sm:table-cell font-medium">
                                {item.nome_produto}
                              </td>
                              <td className="py-2.5 px-4 text-center font-bold">
                                {item.quantidade_fisica}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
