import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Produto } from '@/types/app';
import type { Json } from '@/integrations/supabase/types';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  QrCode,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
  ArrowRight,
  Tags,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { useProdutosQuery, useInvalidateProdutos } from '@/hooks/useProdutosQuery';
import { usePagination } from '@/hooks/usePagination';
import {
  useCodigosCorrecaoQuery,
  useInvalidateCodigosCorrecao,
  CodigoCorrecao,
} from '@/hooks/useCodigosCorrecaoQuery';

// ========== Types ==========

interface ImportError {
  linha: number;
  campo: string;
  mensagem: string;
}

interface ImportValidation {
  isValid: boolean;
  errors: ImportError[];
  newProducts: number;
  skippedProducts: number;
  produtosMap: Map<
    string,
    {
      codigo_produto: string;
      codigo_auxiliar: string;
      nome_produto: string;
      modelo: string;
      cor: string;
      valor_produto: number;
      valor_remessa: number;
    }
  >;
}

interface UpdateRow {
  valor_produto?: number;
  valor_remessa?: number;
}

interface UpdateValidation {
  isValid: boolean;
  errors: { linha: number; codigo: string; mensagem: string }[];
  matchedProducts: number;
  notFoundProducts: string[];
  updateMap: Map<string, UpdateRow>;
}

type ImportStatus = 'idle' | 'validating' | 'validated' | 'importing' | 'completed' | 'error';
type UpdateStatus = 'idle' | 'validating' | 'validated' | 'updating' | 'completed' | 'error';

// ========== Sub-components ==========

function ProdutosTab() {
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
    valor_remessa: '',
  });

  // Import states (novos produtos)
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importValidation, setImportValidation] = useState<ImportValidation | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Update values states (atualizar valores)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updatePreview, setUpdatePreview] = useState<Record<string, unknown>[]>([]);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateValidation, setUpdateValidation] = useState<UpdateValidation | null>(null);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  const updateFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
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

  const onPageChange = (page: number) => setCurrentPage(page);
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
      valor_remessa: parseFloat(formData.valor_remessa) || 0,
    });
    if (error) {
      if (error.code === '23505') toast.error('Código auxiliar já existe');
      else { toast.error('Erro ao cadastrar produto'); console.error(error); }
    } else {
      toast.success('Produto cadastrado!');
      invalidateProdutos();
      setDialogOpen(false);
      setFormData({ codigo_produto: '', codigo_auxiliar: '', nome_produto: '', valor_produto: '', valor_remessa: '' });
    }
  };

  const generateQRCode = async (produto: Produto) => {
    try {
      const url = await QRCode.toDataURL(produto.codigo_auxiliar, { width: 300, margin: 2 });
      setQrCodeUrl(url);
      setSelectedProduto(produto);
      setQrDialogOpen(true);
    } catch { toast.error('Erro ao gerar QR Code'); }
  };

  const downloadQRCode = () => {
    if (!qrCodeUrl || !selectedProduto) return;
    const link = document.createElement('a');
    link.download = `qr-${selectedProduto.codigo_auxiliar.replace(' ', '-')}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  // ========== Import Functions (Novos Produtos) ==========
  const resetImport = () => {
    setImportFile(null);
    setImportPreview([]);
    setImportStatus('idle');
    setImportValidation(null);
    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setImportFile(selectedFile);
    setImportStatus('idle');
    setImportValidation(null);
    try {
      const data = await selectedFile.arrayBuffer();
      const isCsv = selectedFile.name.toLowerCase().endsWith('.csv');
      const workbook = XLSX.read(data, { type: 'array', FS: isCsv ? ';' : undefined });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      setImportPreview(jsonData.slice(0, 5));
      toast.success(`${jsonData.length} produtos encontrados no arquivo.`);
    } catch { toast.error('Erro ao ler o arquivo'); resetImport(); }
  };

  const handleValidateImport = async () => {
    if (!importFile) return;
    setImportStatus('validating');
    try {
      const data = await importFile.arrayBuffer();
      const isCsv = importFile.name.toLowerCase().endsWith('.csv');
      const workbook = XLSX.read(data, { type: 'array', FS: isCsv ? ';' : undefined });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      const errors: ImportError[] = [];
      const produtosMap = new Map<string, { codigo_produto: string; codigo_auxiliar: string; nome_produto: string; modelo: string; cor: string; valor_produto: number; valor_remessa: number }>();

      rows.forEach((row, index) => {
        const linha = index + 2;
        if (!row.codigo_auxiliar) errors.push({ linha, campo: 'codigo_auxiliar', mensagem: 'Campo obrigatório' });
        if (!row.codigo_produto) errors.push({ linha, campo: 'codigo_produto', mensagem: 'Campo obrigatório' });
        if (!row.nome_produto) errors.push({ linha, campo: 'nome_produto', mensagem: 'Campo obrigatório' });
        if (!errors.some((e) => e.linha === linha)) {
          const codigoAuxiliar = String(row.codigo_auxiliar).toUpperCase().trim();
          const codigoProduto = String(row.codigo_produto).toUpperCase().trim();
          const parts = codigoAuxiliar.split(' ');
          produtosMap.set(codigoAuxiliar, {
            codigo_produto: codigoProduto,
            codigo_auxiliar: codigoAuxiliar,
            nome_produto: String(row.nome_produto).trim(),
            modelo: parts[0] || codigoProduto,
            cor: parts.slice(1).join(' ') || '',
            valor_produto: parseFloat(String(row.valor_produto || 0)) || 0,
            valor_remessa: parseFloat(String(row.valor_remessa || 0)) || 0,
          });
        }
      });

      const codigos = Array.from(produtosMap.keys());
      const existingCodes: string[] = [];
      const BATCH_SIZE = 100;
      for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
        const batch = codigos.slice(i, i + BATCH_SIZE);
        const { data: existing } = await supabase.from('produtos').select('codigo_auxiliar').in('codigo_auxiliar', batch);
        if (existing) existing.forEach((p) => existingCodes.push(p.codigo_auxiliar));
      }
      existingCodes.forEach((code) => produtosMap.delete(code));
      const newProducts = produtosMap.size;
      const skippedProducts = existingCodes.length;
      const isValid = errors.length === 0 && newProducts > 0;

      setImportValidation({ isValid, errors, newProducts, skippedProducts, produtosMap });
      setImportStatus(isValid ? 'validated' : 'error');

      if (isValid) {
        toast.success(`${newProducts} novos produtos prontos para importar`);
        if (skippedProducts > 0) toast.info(`${skippedProducts} produtos já existem e serão ignorados`);
      } else if (errors.length > 0) toast.error(`Encontrados ${errors.length} erros de validação.`);
      else if (newProducts === 0 && skippedProducts > 0) toast.warning('Todos os produtos já existem no banco.');
      else toast.warning('Nenhum produto válido encontrado.');
    } catch { toast.error('Erro ao validar arquivo'); setImportStatus('error'); }
  };

  const handleImportProducts = async () => {
    if (!importValidation?.produtosMap || importValidation.produtosMap.size === 0) return;
    setImportStatus('importing');
    const produtos = Array.from(importValidation.produtosMap.values());
    const total = produtos.length;
    setImportProgress({ current: 0, total });
    try {
      const BATCH_SIZE = 100;
      let importedCount = 0;
      for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
        const batch = produtos.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('produtos').insert(batch);
        if (error) { toast.error(`Erro ao importar lote ${Math.floor(i / BATCH_SIZE) + 1}`); console.error(error); setImportStatus('error'); return; }
        importedCount += batch.length;
        setImportProgress({ current: importedCount, total });
      }
      toast.success(`${importedCount} novos produtos importados!`);
      setImportStatus('completed');
      setImportProgress({ current: total, total });
      invalidateProdutos();
    } catch { toast.error('Erro ao importar produtos'); setImportStatus('error'); }
  };

  const downloadTemplate = () => {
    const template = [
      { codigo_produto: 'OB1215', codigo_auxiliar: 'OB1215 Q01', nome_produto: 'ORX OB1215 O51-P19-H144', valor_produto: 45.9, valor_remessa: 30.0 },
      { codigo_produto: 'OB1215', codigo_auxiliar: 'OB1215 Q02', nome_produto: 'ORX OB1215 O51-P19-H144', valor_produto: 45.9, valor_remessa: 30.0 },
      { codigo_produto: 'PW6146', codigo_auxiliar: 'PW6146 A01', nome_produto: 'PW6146 Preto', valor_produto: 32.5, valor_remessa: 20.0 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'modelo_importacao_produtos.xlsx');
    toast.success('Modelo baixado!');
  };

  // ========== Update Values Functions ==========
  const resetUpdate = () => {
    setUpdateFile(null);
    setUpdatePreview([]);
    setUpdateStatus('idle');
    setUpdateValidation(null);
    if (updateFileInputRef.current) updateFileInputRef.current.value = '';
  };

  const handleUpdateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setUpdateFile(selectedFile);
    setUpdateStatus('idle');
    setUpdateValidation(null);
    try {
      const data = await selectedFile.arrayBuffer();
      const isCsv = selectedFile.name.toLowerCase().endsWith('.csv');
      const workbook = XLSX.read(data, { type: 'array', FS: isCsv ? ';' : undefined });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      setUpdatePreview(jsonData.slice(0, 5));
      toast.success(`${jsonData.length} linhas encontradas no arquivo.`);
    } catch { toast.error('Erro ao ler o arquivo'); resetUpdate(); }
  };

  const handleValidateUpdate = async () => {
    if (!updateFile) return;
    setUpdateStatus('validating');
    try {
      const data = await updateFile.arrayBuffer();
      const isCsv = updateFile.name.toLowerCase().endsWith('.csv');
      const workbook = XLSX.read(data, { type: 'array', FS: isCsv ? ';' : undefined });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      const errors: { linha: number; codigo: string; mensagem: string }[] = [];
      const updateMap = new Map<string, UpdateRow>();

      rows.forEach((row, index) => {
        const linha = index + 2;
        if (!row.codigo_auxiliar) { errors.push({ linha, codigo: '', mensagem: 'codigo_auxiliar obrigatório' }); return; }
        const codigo = String(row.codigo_auxiliar).toUpperCase().trim();
        const hasVenda = row.valor_produto !== undefined && row.valor_produto !== null && row.valor_produto !== '';
        const hasRemessa = row.valor_remessa !== undefined && row.valor_remessa !== null && row.valor_remessa !== '';
        if (!hasVenda && !hasRemessa) { errors.push({ linha, codigo, mensagem: 'Informe valor_produto e/ou valor_remessa' }); return; }
        const entry: UpdateRow = {};
        if (hasVenda) {
          const v = parseFloat(String(row.valor_produto));
          if (isNaN(v)) { errors.push({ linha, codigo, mensagem: 'valor_produto inválido' }); return; }
          entry.valor_produto = v;
        }
        if (hasRemessa) {
          const v = parseFloat(String(row.valor_remessa));
          if (isNaN(v)) { errors.push({ linha, codigo, mensagem: 'valor_remessa inválido' }); return; }
          entry.valor_remessa = v;
        }
        updateMap.set(codigo, entry);
      });

      const codigos = Array.from(updateMap.keys());
      const existingCodes: string[] = [];
      const BATCH_SIZE = 100;
      for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
        const batch = codigos.slice(i, i + BATCH_SIZE);
        const { data: existing } = await supabase.from('produtos').select('codigo_auxiliar').in('codigo_auxiliar', batch);
        if (existing) existing.forEach((p) => existingCodes.push(p.codigo_auxiliar));
      }
      const notFoundProducts = codigos.filter((c) => !existingCodes.includes(c));
      notFoundProducts.forEach((c) => updateMap.delete(c));
      const matchedProducts = updateMap.size;
      const isValid = errors.length === 0 && matchedProducts > 0;

      setUpdateValidation({ isValid, errors, matchedProducts, notFoundProducts, updateMap });
      setUpdateStatus(isValid ? 'validated' : 'error');

      if (isValid) {
        toast.success(`${matchedProducts} produtos serão atualizados`);
        if (notFoundProducts.length > 0) toast.warning(`${notFoundProducts.length} códigos não encontrados no banco`);
      } else if (errors.length > 0) toast.error(`Encontrados ${errors.length} erros de validação.`);
      else if (matchedProducts === 0) toast.warning('Nenhum produto encontrado no banco para atualizar.');
    } catch { toast.error('Erro ao validar arquivo'); setUpdateStatus('error'); }
  };

  const handleUpdateValues = async () => {
    if (!updateValidation?.updateMap || updateValidation.updateMap.size === 0) return;
    setUpdateStatus('updating');
    const entries = Array.from(updateValidation.updateMap.entries());
    const total = entries.length;
    setUpdateProgress({ current: 0, total });
    try {
      const BATCH_SIZE = 100;
      let updatedCount = 0;
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const updates = batch.map(([codigo, row]) => ({
          codigo,
          ...(row.valor_produto !== undefined ? { valor: row.valor_produto } : {}),
          ...(row.valor_remessa !== undefined ? { valor_remessa: row.valor_remessa } : {}),
        }));
        const { data, error } = await supabase.rpc('atualizar_valores_produtos', { p_updates: updates as unknown as Json });
        if (error) console.error(`Erro no lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
        else updatedCount += data || batch.length;
        setUpdateProgress({ current: Math.min(i + BATCH_SIZE, total), total });
      }
      toast.success(`${updatedCount} valores atualizados!`);
      setUpdateStatus('completed');
      setUpdateProgress({ current: total, total });
      invalidateProdutos();
    } catch { toast.error('Erro ao atualizar valores'); setUpdateStatus('error'); }
  };

  const downloadUpdateTemplate = () => {
    const template = [
      { codigo_auxiliar: 'OB1215 Q01', valor_produto: 45.9, valor_remessa: 30.0 },
      { codigo_auxiliar: 'OB1215 Q02', valor_produto: 45.9, valor_remessa: 30.0 },
      { codigo_auxiliar: 'PW6146 A01', valor_produto: 32.5, valor_remessa: 20.0 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Atualizar Valores');
    XLSX.writeFile(wb, 'modelo_atualizar_valores.xlsx');
    toast.success('Modelo baixado!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto..." />
        <RefetchIndicator isFetching={isFetching && !loading} />
        <div className="flex items-center gap-2 sm:ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-2">
                Ações
                <ChevronDown className="ml-1" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2" size={16} />
                Importar Produtos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUpdateDialogOpen(true)}>
                <RefreshCw className="mr-2" size={16} />
                Atualizar Valores
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={downloadTemplate}>
                <Download className="mr-2" size={16} />
                Modelo Importação
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadUpdateTemplate}>
                <Download className="mr-2" size={16} />
                Modelo Atualização
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2" size={16} />
            Novo Produto
          </Button>
        </div>
      </div>

      {/* New Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-2">
          <DialogHeader>
            <DialogTitle>Cadastrar Produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="produto-codigo">Código do Produto</Label>
              <Input id="produto-codigo" name="codigo_produto" value={formData.codigo_produto} onChange={(e) => setFormData({ ...formData, codigo_produto: e.target.value })} className="border-2 font-mono" placeholder="Ex: OB1215" required />
            </div>
            <div>
              <Label htmlFor="produto-codigo-auxiliar">Código Auxiliar (QR Code)</Label>
              <Input id="produto-codigo-auxiliar" name="codigo_auxiliar" value={formData.codigo_auxiliar} onChange={(e) => setFormData({ ...formData, codigo_auxiliar: e.target.value.toUpperCase() })} className="border-2 font-mono" placeholder="Ex: OB1215 Q01" required />
              <p className="text-xs text-muted-foreground mt-1">Formato: MODELO COR (separados por espaço)</p>
            </div>
            <div>
              <Label htmlFor="produto-nome">Nome do Produto</Label>
              <Input id="produto-nome" name="nome_produto" value={formData.nome_produto} onChange={(e) => setFormData({ ...formData, nome_produto: e.target.value })} className="border-2" placeholder="Ex: ORX OB1215 O51-P19-H144" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="produto-valor">Preço Venda (R$)</Label>
                <Input id="produto-valor" name="valor_produto" type="number" step="0.01" value={formData.valor_produto} onChange={(e) => setFormData({ ...formData, valor_produto: e.target.value })} className="border-2" placeholder="0.00" />
              </div>
              <div>
                <Label htmlFor="produto-valor-remessa">Preço Remessa (R$)</Label>
                <Input id="produto-valor-remessa" name="valor_remessa" type="number" step="0.01" value={formData.valor_remessa} onChange={(e) => setFormData({ ...formData, valor_remessa: e.target.value })} className="border-2" placeholder="0.00" />
              </div>
            </div>
            <Button type="submit" className="w-full">Cadastrar Produto</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="border-2 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload size={20} />Importar Novos Produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input ref={importFileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFileSelect} className="hidden" id="import-file-input" />
              {!importFile ? (
                <label htmlFor="import-file-input" className="cursor-pointer">
                  <Upload className="mx-auto mb-2 text-muted-foreground" size={32} />
                  <p className="font-medium">Clique para selecionar arquivo</p>
                  <p className="text-sm text-muted-foreground">Excel (.xlsx, .xls) ou CSV (delimitador ;)</p>
                </label>
              ) : (
                <div>
                  <FileSpreadsheet className="mx-auto mb-2 text-primary" size={32} />
                  <p className="font-medium">{importFile.name}</p>
                  <Button variant="ghost" size="sm" onClick={resetImport} className="mt-2">Remover</Button>
                </div>
              )}
            </div>

            {importPreview.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Preview (primeiras 5 linhas)</h4>
                <div className="border-2 rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>codigo_produto</TableHead>
                        <TableHead>codigo_auxiliar</TableHead>
                        <TableHead>nome_produto</TableHead>
                        <TableHead>valor_produto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{String(row.codigo_produto || '')}</TableCell>
                          <TableCell className="font-mono">{String(row.codigo_auxiliar || '')}</TableCell>
                          <TableCell>{String(row.nome_produto || '')}</TableCell>
                          <TableCell>{String(row.valor_produto || '0')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {importValidation && (
              <div className="space-y-3">
                {importValidation.errors.length > 0 && (
                  <div className="bg-destructive/10 border-2 border-destructive/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-destructive font-medium mb-2"><XCircle size={18} />{importValidation.errors.length} erros encontrados</div>
                    <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                      {importValidation.errors.slice(0, 10).map((err, i) => (<li key={i}>Linha {err.linha}: {err.campo} - {err.mensagem}</li>))}
                      {importValidation.errors.length > 10 && (<li className="text-muted-foreground">... e mais {importValidation.errors.length - 10} erros</li>)}
                    </ul>
                  </div>
                )}
                {importValidation.newProducts > 0 && (
                  <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary font-medium"><CheckCircle2 size={18} />{importValidation.newProducts} novos produtos serão criados</div>
                  </div>
                )}
                {importValidation.skippedProducts > 0 && (
                  <div className="bg-muted border-2 border-muted-foreground/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground font-medium"><AlertTriangle size={18} />{importValidation.skippedProducts} produtos já existem (serão ignorados)</div>
                  </div>
                )}
                {importValidation.newProducts === 0 && importValidation.skippedProducts > 0 && (
                  <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-600 font-medium"><AlertTriangle size={18} />Todos os produtos já existem. Use "Atualizar Valores" para alterar preços.</div>
                  </div>
                )}
              </div>
            )}

            {importStatus === 'completed' && (
              <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 text-primary" size={32} />
                <p className="font-medium text-primary">Importação concluída com sucesso!</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-2" onClick={downloadTemplate}><Download className="mr-2" size={16} />Baixar Modelo</Button>
              {importFile && importStatus === 'idle' && (<Button onClick={handleValidateImport}>Validar Arquivo</Button>)}
              {importStatus === 'validating' && (<Button disabled><Loader2 className="mr-2 animate-spin" size={16} />Validando...</Button>)}
              {importStatus === 'validated' && importValidation?.isValid && (<Button onClick={handleImportProducts}><Upload className="mr-2" size={16} />Importar {importValidation.newProducts} Produtos</Button>)}
              {importStatus === 'importing' && (<Button disabled><Loader2 className="mr-2 animate-spin" size={16} />Importando...</Button>)}
            </div>

            {importStatus === 'importing' && importProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">{importProgress.current} de {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)</span>
                </div>
                <Progress value={Math.round((importProgress.current / importProgress.total) * 100)} className="h-2" />
              </div>
            )}

            {(importStatus === 'error' || importStatus === 'completed') && (<Button variant="outline" className="border-2" onClick={resetImport}>Nova Importação</Button>)}

            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">Formato Esperado</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>codigo_produto</strong> (obrigatório): Código principal do produto. Ex: OB1215</li>
                <li><strong>codigo_auxiliar</strong> (obrigatório): Código único para QR Code. Ex: OB1215 Q01</li>
                <li><strong>nome_produto</strong> (obrigatório): Nome/descrição do produto</li>
                <li><strong>valor_produto</strong> (opcional): Custo do produto. Ex: 45.90</li>
              </ul>
              <p className="mt-2 text-primary font-medium">Apenas produtos NOVOS serão importados. Produtos existentes são ignorados.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Values Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={(open) => { setUpdateDialogOpen(open); if (!open) resetUpdate(); }}>
        <DialogContent className="border-2 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><RefreshCw size={20} />Atualizar Valores de Produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input ref={updateFileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpdateFileSelect} className="hidden" id="update-file-input" />
              {!updateFile ? (
                <label htmlFor="update-file-input" className="cursor-pointer">
                  <RefreshCw className="mx-auto mb-2 text-muted-foreground" size={32} />
                  <p className="font-medium">Selecione arquivo com valores</p>
                  <p className="text-sm text-muted-foreground">Apenas codigo_auxiliar e valor_produto são necessários</p>
                </label>
              ) : (
                <div>
                  <FileSpreadsheet className="mx-auto mb-2 text-primary" size={32} />
                  <p className="font-medium">{updateFile.name}</p>
                  <Button variant="ghost" size="sm" onClick={resetUpdate} className="mt-2">Remover</Button>
                </div>
              )}
            </div>

            {updatePreview.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Preview (primeiras 5 linhas)</h4>
                <div className="border-2 rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>codigo_auxiliar</TableHead><TableHead>valor_produto</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {updatePreview.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{String(row.codigo_auxiliar || '')}</TableCell>
                          <TableCell>{String(row.valor_produto || '0')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {updateValidation && (
              <div className="space-y-3">
                {updateValidation.errors.length > 0 && (
                  <div className="bg-destructive/10 border-2 border-destructive/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-destructive font-medium mb-2"><XCircle size={18} />{updateValidation.errors.length} erros encontrados</div>
                    <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                      {updateValidation.errors.slice(0, 10).map((err, i) => (<li key={i}>Linha {err.linha}: {err.codigo || '(sem código)'} - {err.mensagem}</li>))}
                      {updateValidation.errors.length > 10 && (<li className="text-muted-foreground">... e mais {updateValidation.errors.length - 10} erros</li>)}
                    </ul>
                  </div>
                )}
                {updateValidation.matchedProducts > 0 && (
                  <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-primary font-medium"><CheckCircle2 size={18} />{updateValidation.matchedProducts} produtos serão atualizados</div>
                  </div>
                )}
                {updateValidation.notFoundProducts.length > 0 && (
                  <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-600 font-medium mb-2"><AlertTriangle size={18} />{updateValidation.notFoundProducts.length} códigos não encontrados</div>
                    <p className="text-sm text-muted-foreground">Estes serão ignorados: {updateValidation.notFoundProducts.slice(0, 5).join(', ')}{updateValidation.notFoundProducts.length > 5 && '...'}</p>
                  </div>
                )}
              </div>
            )}

            {updateStatus === 'completed' && (
              <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 text-primary" size={32} />
                <p className="font-medium text-primary">Valores atualizados com sucesso!</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-2" onClick={downloadUpdateTemplate}><Download className="mr-2" size={16} />Baixar Modelo</Button>
              {updateFile && updateStatus === 'idle' && (<Button onClick={handleValidateUpdate}>Validar Arquivo</Button>)}
              {updateStatus === 'validating' && (<Button disabled><Loader2 className="mr-2 animate-spin" size={16} />Validando...</Button>)}
              {updateStatus === 'validated' && updateValidation?.isValid && (<Button onClick={handleUpdateValues}><RefreshCw className="mr-2" size={16} />Atualizar {updateValidation.matchedProducts} Valores</Button>)}
              {updateStatus === 'updating' && (<Button disabled><Loader2 className="mr-2 animate-spin" size={16} />Atualizando...</Button>)}
            </div>

            {updateStatus === 'updating' && updateProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">{updateProgress.current} de {updateProgress.total} ({Math.round((updateProgress.current / updateProgress.total) * 100)}%)</span>
                </div>
                <Progress value={Math.round((updateProgress.current / updateProgress.total) * 100)} className="h-2" />
              </div>
            )}

            {(updateStatus === 'error' || updateStatus === 'completed') && (<Button variant="outline" className="border-2" onClick={resetUpdate}>Nova Atualização</Button>)}

            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <h4 className="font-medium mb-2">Formato Esperado</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>codigo_auxiliar</strong> (obrigatório): Código do produto. Ex: OB1215 Q01</li>
                <li><strong>valor_produto</strong> (obrigatório): Novo valor. Ex: 45.90</li>
              </ul>
              <p className="mt-2 text-yellow-600 font-medium">Apenas produtos que já existem no banco terão seus valores atualizados.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="border-2 max-w-sm">
          <DialogHeader><DialogTitle>QR Code</DialogTitle></DialogHeader>
          {selectedProduto && (
            <div className="text-center">
              <img src={qrCodeUrl} alt="QR Code" className="mx-auto border-2 border-foreground" />
              <p className="font-mono font-bold mt-4">{selectedProduto.codigo_auxiliar}</p>
              <p className="text-sm text-muted-foreground">{selectedProduto.nome_produto}</p>
              <Button onClick={downloadQRCode} className="mt-4 w-full"><Download className="mr-2" size={16} />Baixar QR Code</Button>
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
            <h2 className="text-xl font-bold mb-2">{searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</h2>
            <p className="text-muted-foreground">{searchTerm ? 'Tente outro termo de busca' : 'Cadastre produtos ou importe via Excel'}</p>
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
                      <p className="text-sm text-muted-foreground truncate">{produto.nome_produto}</p>
                      <p className="text-sm mt-1">R$ {Number(produto.valor_produto).toFixed(2)}</p>
                    </div>
                    <Button variant="outline" size="icon" className="border-2 flex-shrink-0" onClick={() => generateQRCode(produto)}>
                      <QrCode size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={onPageChange} onItemsPerPageChange={onItemsPerPageChange} />
        </>
      )}
    </div>
  );
}

function CodigosCorrecaoTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CodigoCorrecao | null>(null);
  const [deletingItem, setDeletingItem] = useState<CodigoCorrecao | null>(null);
  const [formData, setFormData] = useState({ cod_errado: '', cod_auxiliar_correto: '' });
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: codigos = [], isLoading: loading, isFetching } = useCodigosCorrecaoQuery();
  const invalidateCodigos = useInvalidateCodigosCorrecao();

  const {
    currentPage, totalPages, itemsPerPage, startIndex, endIndex,
    paginatedData: paginatedCodigos, totalItems, onPageChange, onItemsPerPageChange,
  } = usePagination({ data: codigos, searchTerm, searchFields: ['cod_errado', 'cod_auxiliar_correto'] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      const { error } = await supabase.from('codigos_correcao').update({
        cod_errado: formData.cod_errado.trim().toUpperCase(),
        cod_auxiliar_correto: formData.cod_auxiliar_correto.trim().toUpperCase(),
      }).eq('id', editingItem.id);
      if (error) {
        if (error.code === '23505') toast.error('Este código errado já está cadastrado');
        else { toast.error('Erro ao atualizar mapeamento'); console.error(error); }
      } else { toast.success('Mapeamento atualizado!'); invalidateCodigos(); setDialogOpen(false); resetForm(); }
    } else {
      const { error } = await supabase.from('codigos_correcao').insert({
        cod_errado: formData.cod_errado.trim().toUpperCase(),
        cod_auxiliar_correto: formData.cod_auxiliar_correto.trim().toUpperCase(),
      });
      if (error) {
        if (error.code === '23505') toast.error('Este código errado já está cadastrado');
        else { toast.error('Erro ao criar mapeamento'); console.error(error); }
      } else { toast.success('Mapeamento criado!'); invalidateCodigos(); setDialogOpen(false); resetForm(); }
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    const { error } = await supabase.from('codigos_correcao').delete().eq('id', deletingItem.id);
    if (error) { toast.error('Erro ao excluir mapeamento'); console.error(error); }
    else { toast.success('Mapeamento excluído!'); invalidateCodigos(); }
    setDeleteDialogOpen(false);
    setDeletingItem(null);
  };

  const openEdit = (item: CodigoCorrecao) => {
    setEditingItem(item);
    setFormData({ cod_errado: item.cod_errado, cod_auxiliar_correto: item.cod_auxiliar_correto });
    setDialogOpen(true);
  };

  const openDelete = (item: CodigoCorrecao) => { setDeletingItem(item); setDeleteDialogOpen(true); };
  const resetForm = () => { setEditingItem(null); setFormData({ cod_errado: '', cod_auxiliar_correto: '' }); };

  const downloadTemplate = () => {
    const templateData = [{ cod_errado: 'CODIGO_ERRADO_EXEMPLO', cod_auxiliar_correto: 'CODIGO_CORRETO_EXEMPLO' }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Códigos');
    ws['!cols'] = [{ wch: 25 }, { wch: 25 }];
    XLSX.writeFile(wb, 'modelo_codigos_correcao.xlsx');
    toast.success('Modelo baixado!');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<{ cod_errado?: string; cod_auxiliar_correto?: string }>(worksheet);
      if (jsonData.length === 0) { toast.error('Arquivo vazio ou formato inválido'); return; }
      const firstRow = jsonData[0];
      if (!('cod_errado' in firstRow) || !('cod_auxiliar_correto' in firstRow)) { toast.error('Colunas obrigatórias: cod_errado, cod_auxiliar_correto'); return; }
      const codigosExistentes = new Set(codigos.map((c) => c.cod_errado.toUpperCase()));
      const novosRegistros = jsonData
        .filter((row) => {
          const codErrado = row.cod_errado?.toString().trim().toUpperCase();
          const codCorreto = row.cod_auxiliar_correto?.toString().trim().toUpperCase();
          return codErrado && codCorreto && !codigosExistentes.has(codErrado);
        })
        .map((row) => ({ cod_errado: row.cod_errado!.toString().trim().toUpperCase(), cod_auxiliar_correto: row.cod_auxiliar_correto!.toString().trim().toUpperCase() }));
      const duplicadosIgnorados = jsonData.length - novosRegistros.length;
      if (novosRegistros.length === 0) { toast.warning('Todos os códigos já existem no sistema'); return; }
      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < novosRegistros.length; i += batchSize) {
        const batch = novosRegistros.slice(i, i + batchSize);
        const { error } = await supabase.from('codigos_correcao').insert(batch);
        if (error) { console.error('Erro ao inserir lote:', error); toast.error(`Erro ao importar: ${error.message}`); break; }
        inserted += batch.length;
      }
      invalidateCodigos();
      if (duplicadosIgnorados > 0) toast.success(`${inserted} códigos importados! ${duplicadosIgnorados} duplicados ignorados.`);
      else toast.success(`${inserted} códigos importados com sucesso!`);
    } catch (error) { console.error('Erro ao processar arquivo:', error); toast.error('Erro ao processar arquivo Excel'); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <RefetchIndicator isFetching={isFetching && !loading} />
          <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Buscar código..." />
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-2">
                Ações <ChevronDown className="ml-2" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={importing}>
                <Upload className="mr-2" size={16} />{importing ? 'Importando...' : 'Importar Excel'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={downloadTemplate}>
                <Download className="mr-2" size={16} />Baixar Modelo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2" size={16} />Novo Mapeamento
            </Button>
            <DialogContent className="border-2">
              <DialogHeader><DialogTitle>{editingItem ? 'Editar Mapeamento' : 'Novo Mapeamento'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="cod_errado">Código Errado (da etiqueta)</Label>
                  <Input id="cod_errado" value={formData.cod_errado} onChange={(e) => setFormData({ ...formData, cod_errado: e.target.value })} className="border-2 uppercase" placeholder="Ex: OB1105 PRETO F" required />
                </div>
                <div>
                  <Label htmlFor="cod_auxiliar_correto">Código Correto</Label>
                  <Input id="cod_auxiliar_correto" value={formData.cod_auxiliar_correto} onChange={(e) => setFormData({ ...formData, cod_auxiliar_correto: e.target.value })} className="border-2 uppercase" placeholder="Ex: OB1105 C1" required />
                </div>
                <Button type="submit" className="w-full">{editingItem ? 'Salvar Alterações' : 'Cadastrar'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>


      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : totalItems === 0 ? (
        <Card className="border-2">
          <CardContent className="py-12 text-center">
            <Tags size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">{searchTerm ? 'Nenhum código encontrado' : 'Nenhum mapeamento cadastrado'}</h2>
            <p className="text-muted-foreground">{searchTerm ? 'Tente outro termo de busca' : 'Adicione mapeamentos para corrigir etiquetas com código errado automaticamente.'}</p>
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
                        <span className="font-mono bg-destructive/10 text-destructive px-2 py-1 text-sm">{item.cod_errado}</span>
                        <ArrowRight size={16} className="text-muted-foreground flex-shrink-0" />
                        <span className="font-mono bg-primary/10 text-primary px-2 py-1 text-sm">{item.cod_auxiliar_correto}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="outline" size="icon" className="border-2" onClick={() => openEdit(item)}><Pencil size={16} /></Button>
                      <Button variant="outline" size="icon" className="border-2 text-destructive" onClick={() => openDelete(item)}><Trash2 size={16} /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} itemsPerPage={itemsPerPage} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={onPageChange} onItemsPerPageChange={onItemsPerPageChange} />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-2">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o mapeamento{' '}
              <span className="font-mono font-bold">{deletingItem?.cod_errado}</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ========== Main Page ==========

export default function Produtos() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos & Correções</h1>
          <p className="text-muted-foreground">Gerencie produtos, QR Codes e mapeamentos de correção</p>
        </div>

        <Tabs defaultValue="produtos">
          <TabsList>
            <TabsTrigger value="produtos" className="gap-2">
              <Package size={16} />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="codigos-correcao" className="gap-2">
              <Tags size={16} />
              Códigos de Correção
            </TabsTrigger>
          </TabsList>

          <TabsContent value="produtos">
            <ProdutosTab />
          </TabsContent>

          <TabsContent value="codigos-correcao">
            <CodigosCorrecaoTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
