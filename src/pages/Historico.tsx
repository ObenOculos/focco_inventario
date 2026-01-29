import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useInventariosQuery } from '@/hooks/useInventariosQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardList, ChevronDown, ChevronUp, FileDown } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { InventoryStatus } from '@/types/app';
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

  const getStatusBadge = (status: InventoryStatus) => {
    const styles = {
      pendente: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      aprovado: 'bg-green-100 text-green-800 border-green-300',
      revisao: 'bg-red-100 text-red-800 border-red-300',
    };

    const labels = {
      pendente: 'Pendente',
      aprovado: 'Aprovado',
      revisao: 'Não aprovado',
    };

    return (
      <span className={`px-3 py-1 text-xs font-bold border-2 ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Inventários</h1>
          <p className="text-muted-foreground">
            Acompanhe seus inventários anteriores e seus status
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : inventarios.length === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <ClipboardList size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Nenhum inventário encontrado</h2>
              <p className="text-muted-foreground">Você ainda não realizou nenhum inventário.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {inventarios.map((inventario) => (
              <Card key={inventario.id} className="border-2">
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expandedId === inventario.id ? null : inventario.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {format(new Date(inventario.data_inventario), "dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {inventario.itens_inventario.reduce(
                          (sum, item) => sum + item.quantidade_fisica,
                          0
                        )}{' '}
                        itens • {format(new Date(inventario.data_inventario), 'HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(inventario.status)}
                      <Button
                        size="sm"
                        variant="outline"
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
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/inventario/${inventario.id}`);
                          }}
                        >
                          Editar
                        </Button>
                      )}
                      {expandedId === inventario.id ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {expandedId === inventario.id && (
                  <CardContent className="border-t-2 border-border">
                    {inventario.observacoes && (
                      <div className="mb-4 p-3 bg-secondary">
                        <p className="text-sm font-medium">Suas observações:</p>
                        <p className="text-sm text-muted-foreground">{inventario.observacoes}</p>
                      </div>
                    )}

                    {inventario.observacoes_gerente && (
                      <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200">
                        <p className="text-sm font-medium text-yellow-800">
                          Observações do gerente:
                        </p>
                        <p className="text-sm text-yellow-700">{inventario.observacoes_gerente}</p>
                      </div>
                    )}

                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-foreground">
                          <th className="text-left py-2 text-sm font-bold">Código</th>
                          <th className="text-left py-2 text-sm font-bold hidden sm:table-cell">
                            Produto
                          </th>
                          <th className="text-center py-2 text-sm font-bold">Qtd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventario.itens_inventario.map((item) => (
                          <tr key={item.id} className="border-b border-border">
                            <td className="py-2 font-mono text-sm">{item.codigo_auxiliar}</td>
                            <td className="py-2 text-sm hidden sm:table-cell">
                              {item.nome_produto}
                            </td>
                            <td className="py-2 text-center font-medium">
                              {item.quantidade_fisica}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
