import { useState, useEffect, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Camera, Plus, Trash2, Send, QrCode, Check, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface InventarioItem {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
}

export default function Inventario() {
  const { profile, user } = useAuth();
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  
  // Estados para filtro e paginação
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Estados para modal de confirmação
  const [pendingProduct, setPendingProduct] = useState<{
    code: string; 
    name: string; 
    isRegistered: boolean;
    hasRemessa: boolean;
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Filtrar e paginar itens
  const filteredItems = useMemo(() => {
    if (!filterText.trim()) return items;
    const search = filterText.toLowerCase();
    return items.filter(item => 
      item.codigo_auxiliar.toLowerCase().includes(search) ||
      item.nome_produto.toLowerCase().includes(search)
    );
  }, [items, filterText]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Reset para página 1 quando filtrar
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText]);

  const startScanner = async () => {
    try {
      // Primeiro mostra o elemento, depois inicia o scanner
      setScanning(true);
      
      // Aguarda o elemento estar visível no DOM
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleQrCodeScanned(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error('Erro ao iniciar scanner:', err);
      toast.error('Não foi possível acessar a câmera. Verifique as permissões.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error('Erro ao parar scanner:', err);
      }
    }
    setScanning(false);
  };

  const handleQrCodeScanned = async (code: string) => {
    // Pausar scanner imediatamente
    if (scannerRef.current) {
      try {
        await scannerRef.current.pause(true);
      } catch (err) {
        console.error('Erro ao pausar scanner:', err);
      }
    }

    // Verificar se já existe
    if (items.some(item => item.codigo_auxiliar === code)) {
      setPendingProduct({ code, name: code, isRegistered: true, hasRemessa: true });
      setShowDuplicateDialog(true);
      return;
    }

    // Buscar informações do produto e verificar remessa em paralelo
    const [produtoResult, remessaResult] = await Promise.all([
      supabase
        .from('produtos')
        .select('nome_produto')
        .eq('codigo_auxiliar', code)
        .maybeSingle(),
      supabase
        .from('itens_pedido')
        .select('pedido_id, pedidos!inner(codigo_vendedor, codigo_tipo)')
        .eq('codigo_auxiliar', code)
        .eq('pedidos.codigo_vendedor', profile?.codigo_vendedor || '')
        .eq('pedidos.codigo_tipo', 7)
        .limit(1)
    ]);

    const isRegistered = !!produtoResult.data;
    const hasRemessa = (remessaResult.data?.length || 0) > 0;

    setPendingProduct({ 
      code, 
      name: produtoResult.data?.nome_produto || code,
      isRegistered,
      hasRemessa
    });
    setShowConfirmDialog(true);
  };

  const confirmAddProduct = () => {
    if (!pendingProduct) return;
    
    const newItem: InventarioItem = {
      codigo_auxiliar: pendingProduct.code,
      nome_produto: pendingProduct.name,
      quantidade_fisica: 1,
    };

    setItems(prev => [...prev, newItem]);
    toast.success(`Produto ${pendingProduct.code} adicionado`);
    
    setShowConfirmDialog(false);
    setPendingProduct(null);
    resumeScanner();
  };

  const cancelAddProduct = () => {
    setShowConfirmDialog(false);
    setPendingProduct(null);
    resumeScanner();
  };

  const closeDuplicateDialog = () => {
    setShowDuplicateDialog(false);
    setPendingProduct(null);
    resumeScanner();
  };

  const resumeScanner = () => {
    if (scannerRef.current && scanning) {
      try {
        scannerRef.current.resume();
      } catch (err) {
        console.error('Erro ao retomar scanner:', err);
      }
    }
  };

  const handleManualAdd = async () => {
    if (!manualCode.trim()) {
      toast.error('Digite o código do produto');
      return;
    }
    const code = manualCode.trim().toUpperCase();
    setManualCode('');
    
    // Verificar se já existe
    if (items.some(item => item.codigo_auxiliar === code)) {
      setPendingProduct({ code, name: code, isRegistered: true, hasRemessa: true });
      setShowDuplicateDialog(true);
      return;
    }

    // Buscar informações do produto e verificar remessa em paralelo
    const [produtoResult, remessaResult] = await Promise.all([
      supabase
        .from('produtos')
        .select('nome_produto')
        .eq('codigo_auxiliar', code)
        .maybeSingle(),
      supabase
        .from('itens_pedido')
        .select('pedido_id, pedidos!inner(codigo_vendedor, codigo_tipo)')
        .eq('codigo_auxiliar', code)
        .eq('pedidos.codigo_vendedor', profile?.codigo_vendedor || '')
        .eq('pedidos.codigo_tipo', 7)
        .limit(1)
    ]);

    const isRegistered = !!produtoResult.data;
    const hasRemessa = (remessaResult.data?.length || 0) > 0;

    setPendingProduct({ 
      code, 
      name: produtoResult.data?.nome_produto || code,
      isRegistered,
      hasRemessa
    });
    setShowConfirmDialog(true);
  };

  const updateQuantidade = (index: number, quantidade: number) => {
    const newItems = [...items];
    newItems[index].quantidade_fisica = Math.max(0, quantidade);
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!profile?.codigo_vendedor || !user) {
      toast.error('Você precisa ter um código de vendedor configurado');
      return;
    }

    if (items.length === 0) {
      toast.error('Adicione pelo menos um item ao inventário');
      return;
    }

    setLoading(true);

    try {
      // Criar inventário
      const { data: inventario, error: invError } = await supabase
        .from('inventarios')
        .insert({
          codigo_vendedor: profile.codigo_vendedor,
          user_id: user.id,
          observacoes,
        })
        .select()
        .single();

      if (invError) throw invError;

      // Criar itens do inventário
      const itensData = items.map(item => ({
        inventario_id: inventario.id,
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        quantidade_fisica: item.quantidade_fisica,
      }));

      const { error: itensError } = await supabase
        .from('itens_inventario')
        .insert(itensData);

      if (itensError) throw itensError;

      toast.success('Inventário enviado para conferência!');
      setItems([]);
      setObservacoes('');
    } catch (error: any) {
      console.error('Erro ao salvar inventário:', error);
      toast.error('Erro ao salvar inventário');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  if (!profile?.codigo_vendedor) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="border-2 max-w-md">
            <CardContent className="pt-6 text-center">
              <QrCode size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Código de Vendedor Necessário</h2>
              <p className="text-muted-foreground">
                Você precisa ter um código de vendedor configurado para realizar inventários.
                Entre em contato com o gerente.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Inventário</h1>
          <p className="text-muted-foreground">
            Escaneie os QR Codes ou adicione manualmente os produtos
          </p>
        </div>

        {/* Scanner */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera size={20} />
              Scanner QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              id="qr-reader" 
              className={`w-full aspect-square max-w-sm mx-auto bg-secondary ${!scanning ? 'hidden' : ''}`}
            />
            
            <div className="flex justify-center">
              {scanning ? (
                <Button variant="destructive" onClick={stopScanner}>
                  Parar Scanner
                </Button>
              ) : (
                <Button onClick={startScanner}>
                  <Camera className="mr-2" size={16} />
                  Iniciar Scanner
                </Button>
              )}
            </div>

            <div className="border-t-2 border-border pt-4">
              <Label className="font-medium">Adicionar Manualmente</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Ex: OB1215 Q01"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                  className="border-2 font-mono"
                />
                <Button onClick={handleManualAdd}>
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items */}
        {items.length > 0 && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Itens Escaneados ({items.length})</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Filtrar por código ou nome..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-9 border-2"
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paginatedItems.map((item) => {
                  const originalIndex = items.findIndex(i => i.codigo_auxiliar === item.codigo_auxiliar);
                  return (
                    <div key={item.codigo_auxiliar} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 border-2 border-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono font-medium text-sm">{item.codigo_auxiliar}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.nome_produto}</p>
                      </div>
                      <div className="flex items-center gap-2 justify-between sm:justify-end">
                        <Input
                          type="number"
                          min="0"
                          value={item.quantidade_fisica}
                          onChange={(e) => updateQuantidade(originalIndex, parseInt(e.target.value) || 0)}
                          className="w-16 sm:w-20 border-2 text-center"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removeItem(originalIndex)}
                          className="border-2 text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t-2 border-border">
                  <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="border-2"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="border-2"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {filteredItems.length === 0 && filterText && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum item encontrado para "{filterText}"
                </p>
              )}

              <div className="mt-4">
                <Label className="font-medium">Observações</Label>
                <Textarea
                  placeholder="Observações sobre o inventário..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  className="mt-2 border-2"
                />
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleSubmit}
                disabled={loading}
              >
                <Send className="mr-2" size={16} />
                {loading ? 'Enviando...' : 'Enviar para Conferência'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de Confirmação */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md shadow-none w-[calc(100%-2rem)] mx-4">
          <DialogHeader>
            <DialogTitle>Confirmar Produto</DialogTitle>
            <DialogDescription>
              Deseja adicionar este produto ao inventário?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-4 bg-secondary rounded-lg">
              <p className="font-mono font-bold text-lg">{pendingProduct?.code}</p>
              <p className="text-muted-foreground">{pendingProduct?.name}</p>
            </div>
            
            {/* Alertas */}
            {pendingProduct && !pendingProduct.isRegistered && (
              <div className="p-3 bg-[hsl(43,74%,66%)] text-[hsl(0,0%,0%)] rounded-lg border-2 border-[hsl(43,74%,50%)]">
                <p className="font-medium text-sm">⚠️ Produto não cadastrado</p>
                <p className="text-xs">Este código não está registrado no sistema.</p>
              </div>
            )}
            
            {pendingProduct && pendingProduct.isRegistered && !pendingProduct.hasRemessa && (
              <div className="p-3 bg-[hsl(43,74%,66%)] text-[hsl(0,0%,0%)] rounded-lg border-2 border-[hsl(43,74%,50%)]">
                <p className="font-medium text-sm">⚠️ Produto sem remessa</p>
                <p className="text-xs">Este produto não consta em nenhuma remessa enviada para você.</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelAddProduct}>
              <X className="mr-2" size={16} />
              Cancelar
            </Button>
            <Button onClick={confirmAddProduct}>
              <Check className="mr-2" size={16} />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Produto Duplicado */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Produto Já Adicionado</DialogTitle>
            <DialogDescription>
              Este produto já está na lista do inventário.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-destructive/10 border-2 border-destructive/20 rounded-lg">
            <p className="font-mono font-bold text-lg">{pendingProduct?.code}</p>
            <p className="text-muted-foreground">Já foi escaneado anteriormente</p>
          </div>
          <DialogFooter>
            <Button onClick={closeDuplicateDialog}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
