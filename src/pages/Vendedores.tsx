import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Profile } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Users, Plus, Pencil, UserCheck, UserX } from 'lucide-react';

export default function Vendedores() {
  const [vendedores, setVendedores] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendedor, setEditingVendedor] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    codigo_vendedor: '',
    telefone: '',
  });

  useEffect(() => {
    fetchVendedores();
  }, []);

  const fetchVendedores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'vendedor')
      .order('nome');

    if (error) {
      console.error('Erro ao buscar vendedores:', error);
    } else {
      setVendedores(data as Profile[]);
    }
    setLoading(false);
  };

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
        fetchVendedores();
        setDialogOpen(false);
        resetForm();
      }
    } else {
      // Criar novo vendedor via Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Sessão expirada');
        return;
      }

      const response = await fetch(
        `https://evsneoercdzzwxmhuxid.supabase.co/functions/v1/criar-vendedor`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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
        fetchVendedores();
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
      fetchVendedores();
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
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vendedores</h1>
            <p className="text-muted-foreground">
              Gerencie os representantes comerciais
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2" size={16} />
                Novo Vendedor
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2">
              <DialogHeader>
                <DialogTitle>
                  {editingVendedor ? 'Editar Vendedor' : 'Novo Vendedor'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="border-2"
                    disabled={!!editingVendedor}
                    required
                  />
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="border-2"
                    required
                  />
                </div>
                <div>
                  <Label>Código do Vendedor</Label>
                  <Input
                    value={formData.codigo_vendedor}
                    onChange={(e) => setFormData({ ...formData, codigo_vendedor: e.target.value })}
                    className="border-2"
                    placeholder="Ex: 11"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="border-2"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <Button type="submit" className="w-full">
                  {editingVendedor ? 'Salvar Alterações' : 'Cadastrar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : vendedores.length === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <Users size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Nenhum vendedor cadastrado</h2>
              <p className="text-muted-foreground">
                Adicione vendedores para começar a gerenciar o estoque.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {vendedores.map((vendedor) => (
              <Card key={vendedor.id} className={`border-2 ${!vendedor.ativo ? 'opacity-60' : ''}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold truncate">{vendedor.nome}</h3>
                        {!vendedor.ativo && (
                          <span className="text-xs px-2 py-0.5 bg-secondary font-medium">INATIVO</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{vendedor.email}</p>
                      <div className="flex gap-4 mt-1 text-sm">
                        {vendedor.codigo_vendedor && (
                          <span className="font-mono bg-secondary px-2">
                            Cód: {vendedor.codigo_vendedor}
                          </span>
                        )}
                        {vendedor.telefone && (
                          <span className="text-muted-foreground">{vendedor.telefone}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-2"
                        onClick={() => openEdit(vendedor)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className={`border-2 ${vendedor.ativo ? 'text-destructive' : 'text-green-600'}`}
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
        )}
      </div>
    </AppLayout>
  );
}
