import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/app';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Users, Plus, Pencil, UserCheck, UserX } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import {
  useVendedoresListQuery,
  useInvalidateVendedores,
} from '@/hooks/useVendedoresGerenciamentoQuery';

export default function Vendedores() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    codigo_vendedor: '',
    telefone: '',
  });

  const { data: vendedores = [], isLoading: loading, isFetching } = useVendedoresListQuery();
  const invalidateVendedores = useInvalidateVendedores();

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedVendedores,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({
    data: vendedores,
    searchTerm,
    searchFields: ['nome', 'email', 'codigo_vendedor'],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingVendedor) {
      // Atualizar vendedor existente
      const { error } = await supabase
        .from('profiles')
        .update({
          nome: formData.nome,
          codigo_vendedor: formData.codigo_vendedor,
          telefone: formData.telefone,
        })
        .eq('id', editingVendedor.id);

      if (error) {
        toast.error('Erro ao atualizar vendedor');
        console.error(error);
      } else {
        toast.success('Vendedor atualizado!');
        invalidateVendedores();
        setDialogOpen(false);
        resetForm();
      }
    } else {
      // Criar novo vendedor via Edge Function
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error('Sessão expirada');
        return;
      }

      const response = await fetch(
        `https://evsneoercdzzwxmhuxid.supabase.co/functions/v1/criar-vendedor`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Erro ao criar vendedor');
        console.error(result.error);
      } else {
        toast.success('Vendedor criado! Um email foi enviado para definir a senha.');
        invalidateVendedores();
        setDialogOpen(false);
        resetForm();
      }
    }
  };

  const toggleAtivo = async (vendedor: Profile) => {
    const { error } = await supabase
      .from('profiles')
      .update({ ativo: !vendedor.ativo })
      .eq('id', vendedor.id);

    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(vendedor.ativo ? 'Vendedor desativado' : 'Vendedor ativado');
      invalidateVendedores();
    }
  };

  const openEdit = (vendedor: Profile) => {
    setEditingVendedor(vendedor);
    setFormData({
      email: vendedor.email,
      nome: vendedor.nome,
      codigo_vendedor: vendedor.codigo_vendedor || '',
      telefone: vendedor.telefone || '',
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingVendedor(null);
    setFormData({ email: '', nome: '', codigo_vendedor: '', telefone: '' });
  };

  return (
    <AppLayout>
      <div className="space-y-6 antialiased">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Vendedores</h1>
              <p className="text-sm text-muted-foreground mt-1 font-medium">Gerencie os representantes comerciais e seus códigos de sistema</p>
            </div>
            <RefetchIndicator isFetching={isFetching && !loading} />
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-xs font-semibold">
                <Plus className="mr-2" size={16} />
                Novo Vendedor
              </Button>
            </DialogTrigger>
            <DialogContent className="border border-border/80 rounded-2xl shadow-lg sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold tracking-tight">{editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div>
                  <Label htmlFor="vendedor-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Email</Label>
                  <Input
                    id="vendedor-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    disabled={!!editingVendedor}
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendedor-nome" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nome</Label>
                  <Input
                    id="vendedor-nome"
                    name="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendedor-codigo" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Código do Vendedor</Label>
                  {/* Campo livre também na criação. Antes era um select alimentado pelos
                      codigo_vendedor distintos da tabela pedidos; com pedidos vazia, a lista
                      vinha sempre sem opções e não havia como cadastrar o código. */}
                  <Input
                    id="vendedor-codigo"
                    name="codigo_vendedor"
                    value={formData.codigo_vendedor}
                    onChange={(e) =>
                      setFormData({ ...formData, codigo_vendedor: e.target.value })
                    }
                    className="h-11 rounded-xl border-input font-mono shadow-2xs"
                    placeholder="Ex: 11"
                  />
                </div>
                <div>
                  <Label htmlFor="vendedor-telefone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Telefone</Label>
                  <Input
                    id="vendedor-telefone"
                    name="telefone"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="h-11 rounded-xl border-input focus-visible:ring-primary shadow-2xs"
                    placeholder="(00) 00000-0000"
                    autoComplete="tel"
                  />
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-semibold shadow-xs transition-all mt-4">
                  {editingVendedor ? 'Salvar Alterações' : 'Cadastrar Vendedor'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <SearchFilter
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar vendedor por nome, email ou código..."
        />

        {loading ? (
          <div className="text-center py-12 text-muted-foreground font-medium">Carregando vendedores...</div>
        ) : totalItems === 0 ? (
          <Card className="border border-border/80 rounded-2xl shadow-xs">
            <CardContent className="py-12 text-center">
              <Users size={48} className="mx-auto mb-4 text-muted-foreground/60" />
              <h2 className="text-xl font-bold mb-2">
                {searchTerm ? 'Nenhum vendedor encontrado' : 'Nenhum vendedor cadastrado'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {searchTerm
                  ? 'Tente outro termo de busca'
                  : 'Adicione vendedores para começar a gerenciar o estoque.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3.5">
              {paginatedVendedores.map((vendedor) => (
                <Card
                  key={vendedor.id}
                  className={`border border-border/80 rounded-2xl shadow-xs transition-shadow hover:shadow-md ${!vendedor.ativo ? 'opacity-60 bg-muted/20' : ''}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-base truncate tracking-tight">{vendedor.nome}</h3>
                          {!vendedor.ativo && (
                            <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground font-semibold rounded-md uppercase tracking-wider">
                              Inativo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{vendedor.email}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {vendedor.codigo_vendedor && (
                            <span className="font-mono bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-md">
                              Cód: {vendedor.codigo_vendedor}
                            </span>
                          )}
                          {vendedor.telefone && (
                            <span className="text-muted-foreground font-medium">{vendedor.telefone}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-xl h-9 w-9 shadow-2xs"
                          onClick={() => openEdit(vendedor)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className={`rounded-xl h-9 w-9 shadow-2xs ${vendedor.ativo ? 'text-destructive hover:bg-destructive/10' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'}`}
                          onClick={() => toggleAtivo(vendedor)}
                        >
                          {vendedor.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={onPageChange}
              onItemsPerPageChange={onItemsPerPageChange}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
