import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Camera, Plus, Trash2, Send, QrCode, Search, Check, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { usePagination } from '@/hooks/usePagination';
import { useIsMobile } from '@/hooks/use-mobile';
import { Pagination } from '@/components/Pagination';

interface InventarioItem {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
}

export default function Inventario() {
  const { profile, user } = useAuth();
  const { inventarioId } = useParams<{ inventarioId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<InventarioItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false); // Loading para envio
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de confirmação removido: produtos não cadastrados agora são adicionados automaticamente

  // Estado para informações do inventário sendo editado
  const [inventarioInfo, setInventarioInfo] = useState<{
    data_inventario: string;
    status: string;
  } | null>(null);

  // Estado para edição de inventário existente
  const [editingInventarioId, setEditingInventarioId] = useState<string | null>(null);
  const [observacoesGerente, setObservacoesGerente] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<'all' | 'oben' | 'power' | 'outros'>('all');

  const filteredItemsByBrand = useMemo(() => {
    if (brandFilter === 'all') {
      return items;
    }
    return items.filter((item) => {
      const code = item.codigo_auxiliar.toUpperCase();
      if (brandFilter === 'oben') {
        return code.startsWith('OB');
      }
      if (brandFilter === 'power') {
        return code.startsWith('PW');
      }
      if (brandFilter === 'outros') {
        return !code.startsWith('OB') && !code.startsWith('PW');
      }
      return true; // Should not happen
    });
  }, [items, brandFilter]);

  // Filtrar e paginar itens
  const {
    paginatedData: paginatedItems,
    totalItems,
    ...paginationProps
  } = usePagination({
    data: filteredItemsByBrand,
    searchTerm,
    searchFields: ['codigo_auxiliar', 'nome_produto'],
    itemsPerPage: 10,
  });

  const isMobile = useIsMobile();
  
  const totalQuantity = useMemo(() => items.reduce((acc, item) => acc + item.quantidade_fisica, 0), [items]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      items.length > 0 && currentLocation.pathname !== nextLocation.pathname && !loading
  );

  const saveDraft = () => {
    localStorage.setItem('inventario_items_draft', JSON.stringify(items));
    localStorage.setItem('inventario_observacoes_draft', observacoes);
    if (editingInventarioId) {
      localStorage.setItem('inventario_editing_id_draft', editingInventarioId);
    }
    toast.success('Rascunho salvo localmente.');
  };

  const clearDraft = () => {
    localStorage.removeItem('inventario_items_draft');
    localStorage.removeItem('inventario_observacoes_draft');
    localStorage.removeItem('inventario_editing_id_draft');
  };

  const loadDraft = () => {
    const savedItems = localStorage.getItem('inventario_items_draft');
    const savedObs = localStorage.getItem('inventario_observacoes_draft');
    const savedEditId = localStorage.getItem('inventario_editing_id_draft');

    if (savedItems) {
      try {
        const parsedItems = JSON.parse(savedItems);
        if (parsedItems.length > 0) {
          setItems(parsedItems);
          if (savedObs) setObservacoes(savedObs);
          if (savedEditId) setEditingInventarioId(savedEditId);
          toast.info('Rascunho carregado automaticamente.');
          return true;
        }
      } catch (e) {
        console.error('Erro ao carregar rascunho:', e);
      }
    }
    return false;
  };

  const handleBlockerSave = () => {
    saveDraft();
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  const handleBlockerDiscard = () => {
    clearDraft();
    setItems([]);
    setObservacoes('');
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  const startScanner = async () => {
    try {
      setScanning(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleCodeScanned(decodedText),
        () => {}
      );
    } catch (err) {
      console.error('Erro ao iniciar scanner:', err);
      toast.error('Não foi possível acessar a câmera.');
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

  const handleCodeScanned = async (code: string) => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.pause(true);
      } catch (err) {
        console.error('Erro ao pausar scanner:', err);
      }
    }

    processCode(code);
  };

  const handleManualAdd = () => {
    if (!manualCode.trim()) {
      toast.error('Digite o código do produto');
      return;
    }
    const code = manualCode.trim().toUpperCase();
    setManualCode('');
    processCode(code);
  };

  const processCode = async (code: string) => {
    // Verificar se o item já existe na lista
    const existingItemIndex = items.findIndex((item) => item.codigo_auxiliar === code);

    if (existingItemIndex !== -1) {
      const existingItem = items[existingItemIndex];
      incrementItemQuantity(existingItem.codigo_auxiliar);
      toast.success(`'${existingItem.nome_produto}' incrementado.`);
      resumeScanner();
      return;
    }

    // Se for um item novo, buscar informações do produto
    const { data: produtoData } = await supabase
      .from('produtos')
      .select('nome_produto')
      .eq('codigo_auxiliar', code)
      .maybeSingle();

    // Adiciona o produto: usa o nome cadastrado quando existir, caso contrário um rótulo indicando não cadastrado
    const nomeProduto = produtoData?.nome_produto ?? `Produto não cadastrado (${code})`;
    const newItem: InventarioItem = {
      codigo_auxiliar: code,
      nome_produto: nomeProduto,
      quantidade_fisica: 1,
    };
    setItems((prev) => [newItem, ...prev]);
    toast.success(`Produto ${code} adicionado`);
    resumeScanner();
    return;
  };

  const incrementItemQuantity = (codigo_auxiliar: string) => {
    setItems((prevItems) => {
      const itemIndex = prevItems.findIndex((i) => i.codigo_auxiliar === codigo_auxiliar);
      if (itemIndex === -1) return prevItems;

      const updatedItems = [...prevItems];
      const item = updatedItems[itemIndex];

      // Incrementa a quantidade
      updatedItems[itemIndex] = { ...item, quantidade_fisica: item.quantidade_fisica + 1 };

      // Move o item para o topo da lista
      const [movedItem] = updatedItems.splice(itemIndex, 1);
      updatedItems.unshift(movedItem);

      return updatedItems;
    });
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

  const updateQuantidade = (codigo_auxiliar: string, quantidade: number) => {
    setItems((prevItems) => {
      const itemIndex = prevItems.findIndex((i) => i.codigo_auxiliar === codigo_auxiliar);
      if (itemIndex === -1) return prevItems;

      const newItems = [...prevItems];
      newItems[itemIndex].quantidade_fisica = Math.max(0, quantidade);
      return newItems;
    });
  };

  const removeItem = (codigo_auxiliar: string) => {
    setItems(items.filter((item) => item.codigo_auxiliar !== codigo_auxiliar));
  };

  const handleSubmit = async () => {
    if (!profile?.codigo_vendedor || !user) {
      toast.error('Você precisa ter um código de vendedor configurado');
      return;
    }

    // Correção 1: Enviar TODOS os itens escaneados, inclusive com quantidade = 0
    // Isso permite diferenciar "contou e tem 0" de "não contou"
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item para enviar o inventário');
      return;
    }

    // Correção 5: Verificar se já existe inventário pendente/revisão (apenas para novos)
    if (!editingInventarioId) {
      const { data: existingInventario } = await supabase
        .from('inventarios')
        .select('id, status')
        .eq('codigo_vendedor', profile.codigo_vendedor)
        .in('status', ['pendente', 'revisao'])
        .maybeSingle();

      if (existingInventario) {
        const statusText = existingInventario.status === 'revisao' ? 'em revisão' : 'pendente';
        toast.error(`Você já possui um inventário ${statusText}. Edite-o ou aguarde a aprovação.`);
        return;
      }
    }

    setLoading(true);

    try {
      if (editingInventarioId) {
        // Atualizar inventário existente
        const { error: invError } = await supabase
          .from('inventarios')
          .update({
            observacoes,
            status: 'pendente',
          })
          .eq('id', editingInventarioId);

        if (invError) throw invError;

        // Remover itens antigos
        const { error: deleteError } = await supabase
          .from('itens_inventario')
          .delete()
          .eq('inventario_id', editingInventarioId);

        if (deleteError) throw deleteError;

        // Inserir itens atualizados (todos os itens, inclusive com quantidade 0)
        const itensData = items.map((item) => ({
          inventario_id: editingInventarioId,
          codigo_auxiliar: item.codigo_auxiliar,
          nome_produto: item.nome_produto,
          quantidade_fisica: item.quantidade_fisica,
        }));

        const { error: itensError } = await supabase.from('itens_inventario').insert(itensData);

        if (itensError) throw itensError;

        toast.success('Inventário atualizado e reenviado para conferência!');
      } else {
        // Criar novo inventário
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

        // Inserir todos os itens (inclusive com quantidade 0)
        const itensData = items.map((item) => ({
          inventario_id: inventario.id,
          codigo_auxiliar: item.codigo_auxiliar,
          nome_produto: item.nome_produto,
          quantidade_fisica: item.quantidade_fisica,
        }));

        const { error: itensError } = await supabase.from('itens_inventario').insert(itensData);

        if (itensError) throw itensError;

        toast.success(editingInventarioId ? 'Inventário atualizado e reenviado!' : 'Inventário enviado para conferência!');
      }

      // Invalidar cache para atualizar lista de inventários
      await queryClient.invalidateQueries({ queryKey: ['inventarios'] });

      // Limpar estado e rascunho após sucesso
      clearDraft();
      setItems([]);
      setObservacoes('');
      setEditingInventarioId(null);
      setObservacoesGerente('');
      setInventarioInfo(null);
    } catch (error: any) {
      console.error('Erro ao salvar inventário:', error);
      toast.error('Erro ao salvar inventário');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.codigo_vendedor) {
      if (inventarioId) {
        loadExistingInventario();
      } else {
        loadDraft();
      }
    }
  }, [profile?.codigo_vendedor, inventarioId]);

  const loadExistingInventario = async () => {
    if (!profile?.codigo_vendedor || !inventarioId) return;

    try {
      // Carregar inventário específico pelo ID
      const { data, error } = await supabase
        .from('inventarios')
        .select('*, itens_inventario(*)')
        .eq('id', inventarioId)
        .eq('codigo_vendedor', profile.codigo_vendedor) // Garantir que pertence ao vendedor
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"

      if (data) {
        setEditingInventarioId(data.id);
        setObservacoes(data.observacoes || '');
        setObservacoesGerente(data.observacoes_gerente || '');
        setInventarioInfo({
          data_inventario: data.data_inventario,
          status: data.status,
        });

        const loadedItems: InventarioItem[] = data.itens_inventario.map((item) => ({
          codigo_auxiliar: item.codigo_auxiliar,
          nome_produto: item.nome_produto || '',
          quantidade_fisica: item.quantidade_fisica,
        }));

        setItems(loadedItems);
        toast.info('Inventário carregado para edição.');
      } else {
        // Inventário não encontrado ou não pertence ao usuário
        toast.error('Inventário não encontrado ou você não tem permissão para editá-lo.');
        navigate('/historico');
      }
    } catch (error: any) {
      console.error('Erro ao carregar inventário existente:', error);
      toast.error('Erro ao carregar inventário existente');
      navigate('/historico');
    }
  };

  if (!profile?.codigo_vendedor) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="border-2 max-w-md">
            <CardContent className="pt-6 text-center">
              <QrCode size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Código de Vendedor Necessário</h2>
              <p className="text-muted-foreground">
                Você precisa ter um código de vendedor configurado para realizar inventários. Entre
                em contato com o gerente.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {editingInventarioId ? 'Editar Inventário' : 'Novo Inventário'}
          </h1>
          <p className="text-muted-foreground">
            {editingInventarioId
              ? 'Edite os itens do seu inventário e reenvie para conferência.'
              : 'Use o scanner ou a adição manual para começar a montar seu inventário.'}
          </p>
          {inventarioInfo && (
            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-800">
                Editando Inventário de{' '}
                {format(new Date(inventarioInfo.data_inventario), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </h3>
              <p className="text-sm text-blue-700 mt-1">
                Status atual:{' '}
                {inventarioInfo.status === 'revisao' ? 'Não aprovado' : inventarioInfo.status}
              </p>
            </div>
          )}
        </div>

        {/* Scanner */}
        <Card className="border-2 overflow-hidden">
          <CardContent className="p-6">
            {isMobile ? (
              <Tabs defaultValue="scanner" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="scanner">
                    <Camera className="mr-2 h-4 w-4" />
                    Scanner
                  </TabsTrigger>
                  <TabsTrigger value="manual">
                    <Plus className="mr-2 h-4 w-4" />
                    Manual
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="scanner">
                  <div className="text-center pt-4">
                    <p className="text-sm text-muted-foreground mb-4">
                      Aponte a câmera para o código de barras ou QR code.
                    </p>
                    {scanning ? (
                      <Button variant="destructive" onClick={stopScanner} className="w-full">
                        Parar Scanner
                      </Button>
                    ) : (
                      <Button onClick={startScanner} className="w-full">
                        <Camera className="mr-2 h-4 w-4" />
                        Iniciar Scanner
                      </Button>
                    )}
                    <div
                      id="qr-reader"
                      className={`w-full aspect-square max-w-sm mx-auto bg-secondary mt-4 rounded-lg ${
                        !scanning ? 'hidden' : ''
                      }`}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="manual">
                  <div className="pt-4">
                    <p className="text-sm text-muted-foreground mb-4 text-center">
                      Digite o código do produto manualmente.
                    </p>
                    <div className="flex w-full items-center gap-2">
                      <Input
                        id="manual-code"
                        name="manual_code"
                        placeholder="Digite o código aqui..."
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
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-6 items-start">
                  {/* Camera Scanner Section */}
                  <div className="flex flex-col items-center text-center h-full">
                    <div className="flex-1">
                      <Camera size={40} className="text-primary mb-3 mx-auto" />
                      <h3 className="font-semibold text-lg mb-1">Scanner pela Câmera</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Use a câmera para ler códigos de forma automática e rápida.
                      </p>
                    </div>
                    {scanning ? (
                      <Button variant="destructive" onClick={stopScanner} className="w-full">
                        Parar Scanner
                      </Button>
                    ) : (
                      <Button onClick={startScanner} className="w-full">
                        <Camera className="mr-2" size={16} />
                        Iniciar Scanner
                      </Button>
                    )}
                  </div>

                  {/* Manual Add Section */}
                  <div className="flex flex-col items-center text-center h-full md:border-l-2 md:pl-6">
                    <div className="flex-1">
                      <Plus size={40} className="text-primary mb-3 mx-auto" />
                      <h3 className="font-semibold text-lg mb-1">Adição Manual</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Digite o código do produto se a câmera não funcionar.
                      </p>
                    </div>
                    <div className="flex gap-2 w-full">
                      <Input
                        id="manual-code"
                        name="manual_code"
                        placeholder="Digite o código aqui..."
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
                </div>
                <div
                  id="qr-reader"
                  className={`w-full aspect-square max-w-sm mx-auto bg-secondary mt-6 rounded-lg ${
                    !scanning ? 'hidden' : ''
                  }`}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Itens do Inventário ({totalQuantity})</CardTitle>
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={16}
              />
              <Input
                id="inventario-search"
                name="search"
                placeholder="Filtrar por código ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 border-2"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant={brandFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setBrandFilter('all')}
                size={isMobile ? 'sm' : 'default'}
              >
                Todos
              </Button>
              <Button
                variant={brandFilter === 'oben' ? 'default' : 'outline'}
                onClick={() => setBrandFilter('oben')}
                size={isMobile ? 'sm' : 'default'}
              >
                Oben
              </Button>
              <Button
                variant={brandFilter === 'power' ? 'default' : 'outline'}
                onClick={() => setBrandFilter('power')}
                size={isMobile ? 'sm' : 'default'}
              >
                Power
              </Button>
              <Button
                variant={brandFilter === 'outros' ? 'default' : 'outline'}
                onClick={() => setBrandFilter('outros')}
                size={isMobile ? 'sm' : 'default'}
              >
                Outros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {paginatedItems.length === 0 ? (
              <div className="border-2 rounded-lg p-8 text-center text-muted-foreground">
                {searchTerm
                  ? `Nenhum item encontrado para "${searchTerm}"`
                  : 'Nenhum item adicionado ainda.'}
              </div>
            ) : (
              <div className="space-y-0">
                <table className="w-full">
                  <tbody>
                    {paginatedItems.map((item) => (
                      <tr key={item.codigo_auxiliar} className="border-b">
                        <td className="py-3 pr-2 align-middle">
                          <p className="font-mono font-medium text-sm">{item.codigo_auxiliar}</p>
                        </td>
                        <td className="py-3 pl-2 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Input
                              id={`qty-${item.codigo_auxiliar}`}
                              name={`quantidade_${item.codigo_auxiliar}`}
                              type="number"
                              min="0"
                              value={item.quantidade_fisica}
                              onChange={(e) =>
                                updateQuantidade(
                                  item.codigo_auxiliar,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-20 border-2 text-center shrink-0 font-mono"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.codigo_auxiliar)}
                              className="text-destructive hover:bg-destructive/10 shrink-0"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {paginationProps.totalPages > 1 && (
              <div className="mt-4">
                <Pagination {...paginationProps} totalItems={totalItems} />
              </div>
            )}

            <div className="mt-6 pt-6 border-t-2">
              {observacoesGerente && (
                <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                  <Label className="font-medium text-yellow-800">Observações do Gerente</Label>
                  <p className="text-yellow-700 mt-1">{observacoesGerente}</p>
                </div>
              )}
              <Label htmlFor="inventario-observacoes" className="font-medium">
                Observações
              </Label>
              <Textarea
                id="inventario-observacoes"
                name="observacoes"
                placeholder="Observações sobre o inventário..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="mt-2 border-2"
              />
            </div>

            <Button className="w-full mt-4" onClick={handleSubmit} disabled={loading}>
              <Send className="mr-2" size={16} />
              {loading
                ? 'Enviando...'
                : editingInventarioId
                  ? 'Reenviar para Conferência'
                  : 'Enviar para Conferência'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventário em andamento</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem itens não salvos. Deseja sair e apagar tudo ou salvar como rascunho?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlockerDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair e apagar
            </AlertDialogAction>
            <AlertDialogAction onClick={handleBlockerSave}>Salvar como rascunho</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
