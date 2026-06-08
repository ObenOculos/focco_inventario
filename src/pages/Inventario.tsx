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
import { Camera, Plus, Trash2, Send, QrCode, Search, Check, X, RefreshCcw, Download, Upload, MoreVertical } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { usePagination } from '@/hooks/usePagination';
import { useIsMobile } from '@/hooks/use-mobile';
import { Pagination } from '@/components/Pagination';
import { useCodigosCorrecaoQuery } from '@/hooks/useCodigosCorrecaoQuery';
import type { Json } from '@/integrations/supabase/types';

const PENDING_SYNC_KEY = 'inventario_pending_sync';
const NEW_ID_DRAFT_KEY = 'inventario_new_id_draft';

const isNetworkError = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? '';
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('fetch');
};
import { ImportInventarioModal, ImportedInventarioItem } from '@/components/ImportInventarioModal';
import { ExportInventarioModal } from '@/components/ExportInventarioModal';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Espelho síncrono de `items` para decisões fora do ciclo de render (evita race em scans rápidos)
  const itemsRef = useRef<InventarioItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Estado para modal de produto não cadastrado
  const [produtoNaoCadastrado, setProdutoNaoCadastrado] = useState<{
    codigo: string;
    open: boolean;
  } | null>(null);

  // Estado para informações do inventário sendo editado
  const [inventarioInfo, setInventarioInfo] = useState<{
    data_inventario: string;
    status: string;
  } | null>(null);

  // Estado para edição de inventário existente
  const [editingInventarioId, setEditingInventarioId] = useState<string | null>(null);
  const [observacoesGerente, setObservacoesGerente] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<'all' | 'oben' | 'power' | 'outros'>('all');
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const { data: codigosCorrecao = [] } = useCodigosCorrecaoQuery();

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

  // Search com suporte a códigos de correção (errado → correto)
  const searchedItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return filteredItemsByBrand;

    // Códigos corretos cujo "errado" bate com o termo digitado
    const matchingCorrectCodes = new Set(
      codigosCorrecao
        .filter((c) => c.cod_errado.toLowerCase().includes(term))
        .map((c) => c.cod_auxiliar_correto.toLowerCase())
    );

    return filteredItemsByBrand.filter((item) => {
      const codigo = item.codigo_auxiliar.toLowerCase();
      const nome = (item.nome_produto || '').toLowerCase();
      return (
        codigo.includes(term) ||
        nome.includes(term) ||
        matchingCorrectCodes.has(codigo)
      );
    });
  }, [filteredItemsByBrand, searchTerm, codigosCorrecao]);

  // Filtrar e paginar itens
  const {
    paginatedData: paginatedItems,
    totalItems,
    ...paginationProps
  } = usePagination({
    data: searchedItems,
    itemsPerPage: 10,
  });

  const isMobile = useIsMobile();

  const totalQuantity = useMemo(
    () => searchedItems.reduce((acc, item) => acc + item.quantidade_fisica, 0),
    [searchedItems]
  );
  const totalAllQuantity = useMemo(
    () => items.reduce((acc, item) => acc + item.quantidade_fisica, 0),
    [items]
  );
  const isFiltering = brandFilter !== 'all' || searchTerm.trim() !== '';

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      items.length > 0 && currentLocation.pathname !== nextLocation.pathname && !loading
  );

  const persistDraft = (
    currentItems: InventarioItem[],
    currentObs: string,
    currentEditId: string | null
  ) => {
    localStorage.setItem('inventario_items_draft', JSON.stringify(currentItems));
    localStorage.setItem('inventario_observacoes_draft', currentObs);
    if (currentEditId) {
      localStorage.setItem('inventario_editing_id_draft', currentEditId);
    } else {
      localStorage.removeItem('inventario_editing_id_draft');
    }
  };

  const saveDraft = () => {
    persistDraft(items, observacoes, editingInventarioId);
    toast.success('Rascunho salvo localmente.');
  };

  const clearDraft = () => {
    localStorage.removeItem('inventario_items_draft');
    localStorage.removeItem('inventario_observacoes_draft');
    localStorage.removeItem('inventario_editing_id_draft');
    localStorage.removeItem(NEW_ID_DRAFT_KEY);
  };

  // Id estável para um inventário NOVO, persistido no rascunho. Garante que
  // retentativas (ex.: após queda de conexão) usem sempre o mesmo id e o RPC
  // seja idempotente — nunca cria inventários duplicados.
  const getOrCreateNewInventarioId = (): string => {
    const existing = localStorage.getItem(NEW_ID_DRAFT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(NEW_ID_DRAFT_KEY, id);
    return id;
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

  useEffect(() => {
    if (isLoaded) {
      persistDraft(items, observacoes, editingInventarioId);
    }
  }, [items, observacoes, editingInventarioId, isLoaded]);

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

  const getCodigoCorrigido = async (
    codigo: string
  ): Promise<{ codigoFinal: string; foiCorrigido: boolean }> => {
    const { data } = await supabase
      .from('codigos_correcao')
      .select('cod_auxiliar_correto')
      .eq('cod_errado', codigo)
      .maybeSingle();

    if (data) {
      return { codigoFinal: data.cod_auxiliar_correto, foiCorrigido: true };
    }

    return { codigoFinal: codigo, foiCorrigido: false };
  };

  const processCode = async (rawCode: string) => {
    // Normaliza o código (trim + upper) para casar com a captura manual e os
    // produtos cadastrados, evitando duplicatas por diferença de caixa.
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      resumeScanner();
      return;
    }

    // 1. Verificar se o código precisa ser corrigido
    const { codigoFinal, foiCorrigido } = await getCodigoCorrigido(code);

    if (foiCorrigido) {
      toast.info(`Código corrigido: ${code} → ${codigoFinal}`);
    }

    // 2. Caminho rápido: se já está na lista, apenas incrementa (a mutação real
    //    ocorre dentro de incrementOrAddItem via functional update, garantindo
    //    atomicidade mesmo em scans simultâneos).
    const existingItem = itemsRef.current.find((item) => item.codigo_auxiliar === codigoFinal);
    if (existingItem) {
      incrementOrAddItem(codigoFinal, existingItem.nome_produto);
      toast.success(`'${existingItem.nome_produto}' incrementado.`);
      resumeScanner();
      return;
    }

    // 3. Item potencialmente novo: validar produto no banco
    const { data: produtoData } = await supabase
      .from('produtos')
      .select('nome_produto')
      .eq('codigo_auxiliar', codigoFinal)
      .maybeSingle();

    // Se produto NÃO existe no banco, bloquear e mostrar modal
    if (!produtoData) {
      setProdutoNaoCadastrado({ codigo: codigoFinal, open: true });
      resumeScanner();
      return;
    }

    // Produto existe: adiciona (ou incrementa, caso outro scan tenha chegado
    // antes — o functional update reconcilia e nunca cria linha duplicada).
    incrementOrAddItem(codigoFinal, produtoData.nome_produto);
    toast.success(`Produto ${codigoFinal} adicionado`);
    resumeScanner();
  };

  // Incrementa o item se já existir ou adiciona um novo no topo — tudo dentro de
  // um functional update, de modo que chamadas concorrentes nunca produzam dois
  // itens com o mesmo codigo_auxiliar (origem do erro de SKU duplicado).
  const incrementOrAddItem = (codigo_auxiliar: string, nome_produto: string) => {
    setItems((prevItems) => {
      const itemIndex = prevItems.findIndex((i) => i.codigo_auxiliar === codigo_auxiliar);

      if (itemIndex === -1) {
        return [{ codigo_auxiliar, nome_produto, quantidade_fisica: 1 }, ...prevItems];
      }

      const updatedItems = [...prevItems];
      const item = updatedItems[itemIndex];
      updatedItems[itemIndex] = { ...item, quantidade_fisica: item.quantidade_fisica + 1 };

      // Move o item incrementado para o topo da lista
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

  const handleClearAll = () => {
    setItems([]);
    setObservacoes('');
    clearDraft();
    setShowClearAllDialog(false);
    toast.success('Todos os itens foram removidos.');
  };

  // Exportação agora é feita via ExportInventarioModal (JSON ou Excel)

  const handleImportItems = (importedItems: ImportedInventarioItem[], obs?: string) => {
    setItems((prev) => {
      const map = new Map<string, InventarioItem>();
      prev.forEach((it) => map.set(it.codigo_auxiliar, { ...it }));
      importedItems.forEach((it) => {
        const existing = map.get(it.codigo_auxiliar);
        if (existing) {
          existing.quantidade_fisica += it.quantidade_fisica;
        } else {
          map.set(it.codigo_auxiliar, { ...it });
        }
      });
      return Array.from(map.values());
    });
    if (obs && !observacoes) setObservacoes(obs);
  };

  const resetAfterSave = () => {
    clearDraft();
    localStorage.removeItem(PENDING_SYNC_KEY);
    setItems([]);
    setObservacoes('');
    setEditingInventarioId(null);
    setObservacoesGerente('');
    setInventarioInfo(null);
  };

  const handleSubmit = async () => {
    if (!profile?.codigo_vendedor || !user) {
      toast.error('Você precisa ter um código de vendedor configurado');
      return;
    }

    // Enviar TODOS os itens escaneados, inclusive com quantidade = 0,
    // para diferenciar "contou e tem 0" de "não contou".
    if (items.length === 0) {
      toast.error('Adicione pelo menos um item para enviar o inventário');
      return;
    }

    setLoading(true);

    // Id estável: edição usa o id existente; novo reaproveita/gera um id persistido
    // no rascunho, tornando o RPC idempotente em caso de retry.
    const isEditing = !!editingInventarioId;
    const inventarioId = editingInventarioId ?? getOrCreateNewInventarioId();

    try {
      const { error } = await supabase.rpc('salvar_inventario', {
        p_inventario_id: inventarioId,
        p_observacoes: observacoes,
        p_items: items as unknown as Json,
        p_status: 'pendente',
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      resetAfterSave();
      toast.success(
        isEditing
          ? 'Inventário atualizado e reenviado para conferência!'
          : 'Inventário enviado para conferência!'
      );
    } catch (error) {
      console.error('Erro ao salvar inventário:', error);

      // Falha de conexão: enfileira para reenvio automático e libera a tela.
      // O id estável garante que o flush não crie inventário duplicado.
      if (isNetworkError(error)) {
        localStorage.setItem(
          PENDING_SYNC_KEY,
          JSON.stringify({ inventarioId, observacoes, items })
        );
        resetAfterSave();
        toast.warning('Sem conexão no momento', {
          description: 'O inventário foi salvo e será enviado automaticamente quando a conexão voltar.',
        });
      } else {
        const err = error as { message?: string; error_description?: string; details?: string };
        const msg =
          err?.message ||
          err?.error_description ||
          err?.details ||
          (typeof error === 'string' ? error : 'Erro desconhecido');
        toast.error('Erro ao salvar inventário', { description: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  // Reenvia um inventário que ficou pendente por falta de conexão. Idempotente:
  // usa o mesmo id, então repetir é seguro (nunca duplica nem cria registro vazio).
  const flushPendingSync = async () => {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return;

    let payload: { inventarioId: string; observacoes: string; items: InventarioItem[] };
    try {
      payload = JSON.parse(raw);
    } catch {
      localStorage.removeItem(PENDING_SYNC_KEY);
      return;
    }

    const { error } = await supabase.rpc('salvar_inventario', {
      p_inventario_id: payload.inventarioId,
      p_observacoes: payload.observacoes,
      p_items: payload.items as unknown as Json,
      p_status: 'pendente',
    });

    if (!error) {
      localStorage.removeItem(PENDING_SYNC_KEY);
      await queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      toast.success('Inventário sincronizado com sucesso!');
    } else if (!isNetworkError(error)) {
      // Erro definitivo (ex.: inventário já aprovado): não adianta retentar.
      localStorage.removeItem(PENDING_SYNC_KEY);
      toast.error('Não foi possível sincronizar o inventário pendente', {
        description: error.message,
      });
    }
    // Erro de rede: mantém a fila para a próxima tentativa.
  };

  // Tenta sincronizar pendências ao montar e sempre que a conexão voltar.
  useEffect(() => {
    flushPendingSync();
    const onOnline = () => flushPendingSync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile?.codigo_vendedor) {
      if (inventarioId) {
        loadExistingInventario().finally(() => setIsLoaded(true));
      } else {
        loadDraft();
        setIsLoaded(true);
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
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <span>Itens do Inventário</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {isFiltering
                      ? `${totalQuantity} de ${totalAllQuantity} peças`
                      : `${totalAllQuantity} ${totalAllQuantity === 1 ? 'peça' : 'peças'}`}
                  </span>
                </CardTitle>
                {brandFilter !== 'all' && (
                  <Badge variant="secondary" className="mt-2 capitalize">
                    Marca: {brandFilter}
                  </Badge>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Ações do inventário">
                    <MoreVertical size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setShowImportModal(true)}>
                    <Upload size={16} className="mr-2" />
                    Importar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowExportModal(true)}
                    disabled={items.length === 0}
                  >
                    <Download size={16} className="mr-2" />
                    Exportar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowClearAllDialog(true)}
                    disabled={items.length === 0}
                    className="text-destructive focus:text-destructive"
                  >
                    <RefreshCcw size={16} className="mr-2" />
                    Limpar tudo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <div className="relative">
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
              <ToggleGroup
                type="single"
                value={brandFilter}
                onValueChange={(v) => v && setBrandFilter(v as typeof brandFilter)}
                className="flex flex-wrap justify-start gap-2"
              >
                <ToggleGroupItem value="all" size={isMobile ? 'sm' : 'default'} variant="outline">
                  Todos
                </ToggleGroupItem>
                <ToggleGroupItem value="oben" size={isMobile ? 'sm' : 'default'} variant="outline">
                  Oben
                </ToggleGroupItem>
                <ToggleGroupItem value="power" size={isMobile ? 'sm' : 'default'} variant="outline">
                  Power
                </ToggleGroupItem>
                <ToggleGroupItem value="outros" size={isMobile ? 'sm' : 'default'} variant="outline">
                  Outros
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent>
            {paginatedItems.length === 0 ? (
              <div className="border-2 rounded-lg p-8 text-center text-muted-foreground space-y-3">
                <p>
                  {searchTerm
                    ? `Nenhum item encontrado para "${searchTerm}".`
                    : brandFilter !== 'all'
                    ? `Nenhum item da marca ${brandFilter} no inventário.`
                    : 'Nenhum item adicionado ainda.'}
                </p>
                {isFiltering && items.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('');
                      setBrandFilter('all');
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
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

      {/* Modal de produto não cadastrado */}
      <AlertDialog
        open={produtoNaoCadastrado?.open}
        onOpenChange={(open) => !open && setProdutoNaoCadastrado(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <X className="h-5 w-5" />
              Produto Não Cadastrado
            </AlertDialogTitle>
            <AlertDialogDescription>
              O código <strong className="font-mono">{produtoNaoCadastrado?.codigo}</strong> não
              está cadastrado no sistema. Entre em contato com o gerente para adicionar este produto
              antes de incluí-lo no inventário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setProdutoNaoCadastrado(null)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Clear All Confirmation Dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os itens?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover todos os {items.length} itens do inventário atual e limpar o
              rascunho salvo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Limpar Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportInventarioModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onImport={handleImportItems}
      />

      <ExportInventarioModal
        open={showExportModal}
        onOpenChange={setShowExportModal}
        items={items}
        observacoes={observacoes}
        codigoVendedor={profile?.codigo_vendedor}
        editingInventarioId={editingInventarioId}
      />
    </AppLayout>
  );
}
