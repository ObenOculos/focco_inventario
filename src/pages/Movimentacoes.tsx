import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useMovimentacoesQuery, useCreateMovimentacao } from '@/hooks/useMovimentacoesQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';

interface Movimentacao {
  id: string;
  codigo_vendedor: string;
  codigo_auxiliar: string;
  nome_produto: string | null;
  tipo_movimentacao: number;
  quantidade: number;
  motivo: string | null;
  observacoes: string | null;
  data_movimentacao: string;
  created_at: string;
}

const TIPOS_MOVIMENTACAO = {
  3: { label: 'Devolução Cliente', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  4: { label: 'Devolução Empresa', icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  5: { label: 'Perda/Avaria', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  6: { label: 'Ajuste', icon: RefreshCw, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
};

export default function Movimentacoes() {
  const { profile } = useAuth();
  const isGerente = profile?.role === 'gerente';

  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    codigo_auxiliar: '',
    nome_produto: '',
    tipo_movimentacao: '',
    quantidade: '',
    motivo: '',
    observacoes: '',
  });

  const { data: movimentacoes = [], isLoading: loading } = useMovimentacoesQuery(profile?.codigo_vendedor, isGerente);
  const createMovimentacao = useCreateMovimentacao();

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedMovimentacoes,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({
    data: movimentacoes,
    itemsPerPage: 20,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto', 'motivo'],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.codigo_vendedor || !profile.id) {
      toast.error('Código de vendedor não encontrado');
      return;
    }

    const quantidade = parseFloat(formData.quantidade);
    const tipo = parseInt(formData.tipo_movimentacao);

    // Tipo 3 (Devolução Cliente) = entrada, sempre positivo
    // Tipos 4 e 5 (Devolução Empresa, Perda) = saída, sempre negativo
    // Tipo 6 (Ajuste) = mantém o sinal informado pelo usuário
    let quantidadeAjustada = quantidade;
    if (tipo === 3 && quantidade < 0) {
      quantidadeAjustada = Math.abs(quantidade);
    } else if ((tipo === 4 || tipo === 5) && quantidade > 0) {
      quantidadeAjustada = -quantidade;
    }

    createMovimentacao.mutate({
      user_id: profile.id,
      codigo_vendedor: profile.codigo_vendedor,
      codigo_auxiliar: formData.codigo_auxiliar.toUpperCase(),
      nome_produto: formData.nome_produto,
      tipo_movimentacao: tipo,
      quantidade: quantidadeAjustada,
      motivo: formData.motivo,
      observacoes: formData.observacoes || null,
    }, {
      onSuccess: () => {
        setDialogOpen(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setFormData({
      codigo_auxiliar: '',
      nome_produto: '',
      tipo_movimentacao: '',
      quantidade: '',
      motivo: '',
      observacoes: '',
    });
  };

  const getTipoInfo = (tipo: number) => {
    return TIPOS_MOVIMENTACAO[tipo as keyof typeof TIPOS_MOVIMENTACAO] || {
      label: 'Desconhecido',
      icon: RefreshCw,
      color: 'text-gray-600',
      bg: 'bg-gray-50 border-gray-200',
    };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Movimentações de Estoque</h1>
            <p className="text-muted-foreground">
              Registre devoluções, perdas e ajustes de estoque
            </p>
          </div>
          
          {isGerente && (
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2" size={16} />
                  Nova Movimentação
                </Button>
              </DialogTrigger>
              <DialogContent className="border-2">
                <DialogHeader>
                  <DialogTitle>Registrar Movimentação</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Código Auxiliar (QR Code)</Label>
                    <Input
                      value={formData.codigo_auxiliar}
                      onChange={(e) => setFormData({ ...formData, codigo_auxiliar: e.target.value.toUpperCase() })}
                      className="border-2 font-mono"
                      placeholder="Ex: OB1215 Q01"
                      required
                    />
                  </div>
                  <div>
                    <Label>Nome do Produto</Label>
                    <Input
                      value={formData.nome_produto}
                      onChange={(e) => setFormData({ ...formData, nome_produto: e.target.value })}
                      className="border-2"
                      placeholder="Ex: Óculos Ray-Ban..."
                    />
                  </div>
                  <div>
                    <Label>Tipo de Movimentação</Label>
                    <Select
                      value={formData.tipo_movimentacao}
                      onValueChange={(value) => setFormData({ ...formData, tipo_movimentacao: value })}
                    >
                      <SelectTrigger className="border-2">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-2 z-50">
                        <SelectItem value="3">🔵 Devolução de Cliente (Entrada)</SelectItem>
                        <SelectItem value="4">🟠 Devolução para Empresa (Saída)</SelectItem>
                        <SelectItem value="5">🔴 Perda/Avaria (Saída)</SelectItem>
                        <SelectItem value="6">🟣 Ajuste de Estoque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      step="1"
                      value={formData.quantidade}
                      onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                      className="border-2"
                      placeholder="Digite a quantidade"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.tipo_movimentacao === '4' || formData.tipo_movimentacao === '5'
                        ? 'Será registrado como saída (negativo)'
                        : formData.tipo_movimentacao === '3'
                        ? 'Será registrado como entrada (positivo)'
                        : 'Para ajustes: positivo=entrada, negativo=saída'}
                    </p>
                  </div>
                  <div>
                    <Label>Motivo</Label>
                    <Input
                      value={formData.motivo}
                      onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                      className="border-2"
                      placeholder="Breve explicação do motivo"
                      required
                    />
                  </div>
                  <div>
                    <Label>Observações (Opcional)</Label>
                    <Textarea
                      value={formData.observacoes}
                      onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                      className="border-2"
                      placeholder="Detalhes adicionais..."
                      rows={3}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Registrar Movimentação
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <SearchFilter
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por código, produto ou motivo..."
        />

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : totalItems === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <RefreshCw size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">
                {searchTerm ? 'Nenhuma movimentação encontrada' : 'Nenhuma movimentação registrada'}
              </h2>
              <p className="text-muted-foreground">
                {searchTerm 
                  ? 'Tente outro termo de busca' 
                  : isGerente 
                    ? 'Registre devoluções, perdas ou ajustes de estoque'
                    : 'Nenhuma movimentação no seu estoque ainda'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3">
              {paginatedMovimentacoes.map((mov) => {
                const tipoInfo = getTipoInfo(mov.tipo_movimentacao);
                const Icon = tipoInfo.icon;

                return (
                  <Card key={mov.id} className={`border-2 ${tipoInfo.bg}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className={`${tipoInfo.bg} border-2 font-bold`}>
                              <Icon size={14} className={`mr-1 ${tipoInfo.color}`} />
                              {tipoInfo.label}
                            </Badge>
                            <span className="font-mono font-bold">{mov.codigo_auxiliar}</span>
                          </div>
                          {mov.nome_produto && (
                            <p className="text-sm text-muted-foreground mb-1">{mov.nome_produto}</p>
                          )}
                          <p className="text-sm font-medium mb-1">
                            <strong>Motivo:</strong> {mov.motivo}
                          </p>
                          {mov.observacoes && (
                            <p className="text-sm text-muted-foreground mb-1">
                              {mov.observacoes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(mov.data_movimentacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            {isGerente && ` • Vendedor: ${mov.codigo_vendedor}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-3xl font-bold ${mov.quantidade > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {mov.quantidade > 0 ? '+' : ''}{mov.quantidade}
                          </p>
                          <p className="text-xs text-muted-foreground">unidades</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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
      </div>
    </AppLayout>
  );
}
