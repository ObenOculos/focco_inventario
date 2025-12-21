import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Produto } from '@/types/app';
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
import { Package, Plus, QrCode, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { useProdutosQuery, useInvalidateProdutos } from '@/hooks/useProdutosQuery';

export default function Produtos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [formData, setFormData] = useState({
    codigo_produto: '',
    codigo_auxiliar: '',
    nome_produto: '',
    valor_produto: '',
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page on new search
    }, 300); // 300ms debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const {
    data,
    isLoading: loading,
    isFetching,
  } = useProdutosQuery(currentPage, itemsPerPage, debouncedSearchTerm);
  const invalidateProdutos = useInvalidateProdutos();

  const produtos = data?.data ?? [];
  const totalItems = data?.count ?? 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage - 1, totalItems - 1);

  const onPageChange = (page: number) => {
    setCurrentPage(page);
  };

  const onItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const [modelo, cor] = formData.codigo_auxiliar.split(' ');

    const { error } = await supabase.from('produtos').insert({
      codigo_produto: formData.codigo_produto,
      codigo_auxiliar: formData.codigo_auxiliar.toUpperCase(),
      nome_produto: formData.nome_produto,
      modelo: modelo || formData.codigo_produto,
      cor: cor || '',
      valor_produto: parseFloat(formData.valor_produto) || 0,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('Código auxiliar já existe');
      } else {
        toast.error('Erro ao cadastrar produto');
        console.error(error);
      }
    } else {
      toast.success('Produto cadastrado!');
      invalidateProdutos();
      setDialogOpen(false);
      setFormData({ codigo_produto: '', codigo_auxiliar: '', nome_produto: '', valor_produto: '' });
    }
  };

  const generateQRCode = async (produto: Produto) => {
    try {
      const url = await QRCode.toDataURL(produto.codigo_auxiliar, {
        width: 300,
        margin: 2,
      });
      setQrCodeUrl(url);
      setSelectedProduto(produto);
      setQrDialogOpen(true);
    } catch (err) {
      toast.error('Erro ao gerar QR Code');
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeUrl || !selectedProduto) return;

    const link = document.createElement('a');
    link.download = `qr-${selectedProduto.codigo_auxiliar.replace(' ', '-')}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
              <p className="text-muted-foreground">Gerencie os produtos e gere QR Codes</p>
            </div>
            <RefetchIndicator isFetching={isFetching && !loading} />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2" size={16} />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="border-2">
              <DialogHeader>
                <DialogTitle>Cadastrar Produto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="produto-codigo">Código do Produto</Label>
                  <Input
                    id="produto-codigo"
                    name="codigo_produto"
                    value={formData.codigo_produto}
                    onChange={(e) => setFormData({ ...formData, codigo_produto: e.target.value })}
                    className="border-2 font-mono"
                    placeholder="Ex: OB1215"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="produto-codigo-auxiliar">Código Auxiliar (QR Code)</Label>
                  <Input
                    id="produto-codigo-auxiliar"
                    name="codigo_auxiliar"
                    value={formData.codigo_auxiliar}
                    onChange={(e) =>
                      setFormData({ ...formData, codigo_auxiliar: e.target.value.toUpperCase() })
                    }
                    className="border-2 font-mono"
                    placeholder="Ex: OB1215 Q01"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formato: MODELO COR (separados por espaço)
                  </p>
                </div>
                <div>
                  <Label htmlFor="produto-nome">Nome do Produto</Label>
                  <Input
                    id="produto-nome"
                    name="nome_produto"
                    value={formData.nome_produto}
                    onChange={(e) => setFormData({ ...formData, nome_produto: e.target.value })}
                    className="border-2"
                    placeholder="Ex: ORX OB1215 O51-P19-H144"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="produto-valor">Valor (R$)</Label>
                  <Input
                    id="produto-valor"
                    name="valor_produto"
                    type="number"
                    step="0.01"
                    value={formData.valor_produto}
                    onChange={(e) => setFormData({ ...formData, valor_produto: e.target.value })}
                    className="border-2"
                    placeholder="0.00"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Cadastrar Produto
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto..." />

        {/* QR Code Dialog */}
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="border-2 max-w-sm">
            <DialogHeader>
              <DialogTitle>QR Code</DialogTitle>
            </DialogHeader>
            {selectedProduto && (
              <div className="text-center">
                <img src={qrCodeUrl} alt="QR Code" className="mx-auto border-2 border-foreground" />
                <p className="font-mono font-bold mt-4">{selectedProduto.codigo_auxiliar}</p>
                <p className="text-sm text-muted-foreground">{selectedProduto.nome_produto}</p>
                <Button onClick={downloadQRCode} className="mt-4 w-full">
                  <Download className="mr-2" size={16} />
                  Baixar QR Code
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : totalItems === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
              </h2>
              <p className="text-muted-foreground">
                {searchTerm
                  ? 'Tente outro termo de busca'
                  : 'Cadastre produtos ou importe via Excel'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {produtos.map((produto) => (
                <Card key={produto.id} className="border-2">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-bold">{produto.codigo_auxiliar}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {produto.nome_produto}
                        </p>
                        <p className="text-sm mt-1">
                          R$ {Number(produto.valor_produto).toFixed(2)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-2 flex-shrink-0"
                        onClick={() => generateQRCode(produto)}
                      >
                        <QrCode size={16} />
                      </Button>
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
