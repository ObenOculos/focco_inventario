import { useEffect, useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Produto } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Package, Plus, QrCode, Search, Download } from 'lucide-react';
import QRCode from 'qrcode';

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [formData, setFormData] = useState({
    codigo_produto: '',
    codigo_auxiliar: '',
    nome_produto: '',
    valor_produto: '',
  });

  useEffect(() => {
    fetchProdutos();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const fetchProdutos = async () => {
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('codigo_auxiliar');

    if (error) {
      console.error('Erro ao buscar produtos:', error);
    } else {
      setProdutos(data as Produto[]);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const [modelo, cor] = formData.codigo_auxiliar.split(' ');
    
    const { error } = await supabase
      .from('produtos')
      .insert({
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
      fetchProdutos();
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

  const filteredProdutos = produtos.filter(p =>
    p.codigo_auxiliar.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.nome_produto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProdutos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProdutos = filteredProdutos.slice(startIndex, endIndex);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
            <p className="text-muted-foreground">
              Gerencie os produtos e gere QR Codes
            </p>
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
                  <Label>Código do Produto</Label>
                  <Input
                    value={formData.codigo_produto}
                    onChange={(e) => setFormData({ ...formData, codigo_produto: e.target.value })}
                    className="border-2 font-mono"
                    placeholder="Ex: OB1215"
                    required
                  />
                </div>
                <div>
                  <Label>Código Auxiliar (QR Code)</Label>
                  <Input
                    value={formData.codigo_auxiliar}
                    onChange={(e) => setFormData({ ...formData, codigo_auxiliar: e.target.value.toUpperCase() })}
                    className="border-2 font-mono"
                    placeholder="Ex: OB1215 Q01"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Formato: MODELO COR (separados por espaço)
                  </p>
                </div>
                <div>
                  <Label>Nome do Produto</Label>
                  <Input
                    value={formData.nome_produto}
                    onChange={(e) => setFormData({ ...formData, nome_produto: e.target.value })}
                    className="border-2"
                    placeholder="Ex: ORX OB1215 O51-P19-H144"
                    required
                  />
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
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
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-2"
          />
        </div>

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
        ) : filteredProdutos.length === 0 ? (
          <Card className="border-2">
            <CardContent className="py-12 text-center">
              <Package size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
              </h2>
              <p className="text-muted-foreground">
                {searchTerm ? 'Tente outro termo de busca' : 'Cadastre produtos ou importe via Excel'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedProdutos.map((produto) => (
              <Card key={produto.id} className="border-2">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono font-bold">{produto.codigo_auxiliar}</p>
                      <p className="text-sm text-muted-foreground truncate">{produto.nome_produto}</p>
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
            {filteredProdutos.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Itens por página:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">12</SelectItem>
                      <SelectItem value="24">24</SelectItem>
                      <SelectItem value="48">48</SelectItem>
                      <SelectItem value="96">96</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {filteredProdutos.length > itemsPerPage && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNum)}
                              isActive={currentPage === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
