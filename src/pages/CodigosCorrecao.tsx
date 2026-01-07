import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowRight, Tags } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import {
  useCodigosCorrecaoQuery,
  useInvalidateCodigosCorrecao,
  CodigoCorrecao,
} from '@/hooks/useCodigosCorrecaoQuery';

export default function CodigosCorrecao() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CodigoCorrecao | null>(null);
  const [deletingItem, setDeletingItem] = useState<CodigoCorrecao | null>(null);
  const [formData, setFormData] = useState({
    cod_errado: '',
    cod_auxiliar_correto: '',
  });

  const { data: codigos = [], isLoading: loading, isFetching } = useCodigosCorrecaoQuery();
  const invalidateCodigos = useInvalidateCodigosCorrecao();

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    startIndex,
    endIndex,
    paginatedData: paginatedCodigos,
    totalItems,
    onPageChange,
    onItemsPerPageChange,
  } = usePagination({
    data: codigos,
    searchTerm,
    searchFields: ['cod_errado', 'cod_auxiliar_correto'],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingItem) {
      const { error } = await supabase
        .from('codigos_correcao')
        .update({
          cod_errado: formData.cod_errado.trim().toUpperCase(),
          cod_auxiliar_correto: formData.cod_auxiliar_correto.trim().toUpperCase(),
        })
        .eq('id', editingItem.id);

      if (error) {
        if (error.code === '23505') {
          toast.error('Este código errado já está cadastrado');
        } else {
          toast.error('Erro ao atualizar mapeamento');
          console.error(error);
        }
      } else {
        toast.success('Mapeamento atualizado!');
        invalidateCodigos();
        setDialogOpen(false);
        resetForm();
      }
    } else {
      const { error } = await supabase.from('codigos_correcao').insert({
        cod_errado: formData.cod_errado.trim().toUpperCase(),
        cod_auxiliar_correto: formData.cod_auxiliar_correto.trim().toUpperCase(),
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('Este código errado já está cadastrado');
        } else {
          toast.error('Erro ao criar mapeamento');
          console.error(error);
        }
      } else {
        toast.success('Mapeamento criado!');
        invalidateCodigos();
        setDialogOpen(false);
        resetForm();
      }
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    const { error } = await supabase
      .from('codigos_correcao')
      .delete()
      .eq('id', deletingItem.id);

    if (error) {
      toast.error('Erro ao excluir mapeamento');
      console.error(error);
    } else {
      toast.success('Mapeamento excluído!');
      invalidateCodigos();
    }
    setDeleteDialogOpen(false);
    setDeletingItem(null);
  };

  const openEdit = (item: CodigoCorrecao) => {
    setEditingItem(item);
    setFormData({
      cod_errado: item.cod_errado,
      cod_auxiliar_correto: item.cod_auxiliar_correto,
    });
    setDialogOpen(true);
  };

  const openDelete = (item: CodigoCorrecao) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setEditingItem(null);
    setFormData({ cod_errado: '', cod_auxiliar_correto: '' });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Códigos de Correção</h1>
              <p className="text-muted-foreground">
                Gerencie os mapeamentos de etiquetas com código errado
              </p>
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
              <Button>
                <Plus className="mr-2" size={16} />
                Novo Mapeamento
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Editar Mapeamento' : 'Novo Mapeamento'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="cod_errado">Código Errado (da etiqueta)</Label>
                  <Input
                    id="cod_errado"
                    value={formData.cod_errado}
                    onChange={(e) =>
                      setFormData({ ...formData, cod_errado: e.target.value })
                    }
                    className="border-2 uppercase"
                    placeholder="Ex: OB1105 PRETO F"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cod_auxiliar_correto">Código Correto</Label>
                  <Input
                    id="cod_auxiliar_correto"
                    value={formData.cod_auxiliar_correto}
                    onChange={(e) =>
                      setFormData({ ...formData, cod_auxiliar_correto: e.target.value })
                    }
                    className="border-2 uppercase"
                    placeholder="Ex: OB1105 C1"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  {editingItem ? 'Salvar Alterações' : 'Cadastrar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <SearchFilter
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar código..."
        />

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : totalItems === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <Tags size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">
                {searchTerm ? 'Nenhum código encontrado' : 'Nenhum mapeamento cadastrado'}
              </h2>
              <p className="text-muted-foreground">
                {searchTerm
                  ? 'Tente outro termo de busca'
                  : 'Adicione mapeamentos para corrigir etiquetas com código errado automaticamente.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4">
              {paginatedCodigos.map((item) => (
                <Card key={item.id} className="border-2">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono bg-destructive/10 text-destructive px-2 py-1 text-sm">
                            {item.cod_errado}
                          </span>
                          <ArrowRight size={16} className="text-muted-foreground flex-shrink-0" />
                          <span className="font-mono bg-primary/10 text-primary px-2 py-1 text-sm">
                            {item.cod_auxiliar_correto}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-2"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-2 text-destructive"
                          onClick={() => openDelete(item)}
                        >
                          <Trash2 size={16} />
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-2">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o mapeamento{' '}
              <span className="font-mono font-bold">{deletingItem?.cod_errado}</span>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
