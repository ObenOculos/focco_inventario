import { useState, useEffect, useRef } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Package, Plus, QrCode, Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { Pagination } from '@/components/Pagination';
import { SearchFilter } from '@/components/SearchFilter';
import { RefetchIndicator } from '@/components/RefetchIndicator';
import { useProdutosQuery, useInvalidateProdutos } from '@/hooks/useProdutosQuery';

interface ImportError {
  linha: number;
  campo: string;
  mensagem: string;
}

interface ImportValidation {
  isValid: boolean;
  errors: ImportError[];
  duplicates: string[];
  newProducts: number;
  produtosMap: Map<string, {
    codigo_produto: string;
    codigo_auxiliar: string;
    nome_produto: string;
    modelo: string;
    cor: string;
    valor_produto: number;
  }>;
}

type ImportStatus = 'idle' | 'validating' | 'validated' | 'importing' | 'completed' | 'error';

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

  // Import states
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importValidation, setImportValidation] = useState<ImportValidation | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);

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

  // ========== Import Functions ==========

  const resetImport = () => {
    setImportFile(null);
    setImportPreview([]);
    setImportStatus('idle');
    setImportValidation(null);
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
    }
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
    } catch (err) {
      toast.error('Erro ao ler o arquivo');
      resetImport();
    }
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
      const produtosMap = new Map<string, {
        codigo_produto: string;
        codigo_auxiliar: string;
        nome_produto: string;
        modelo: string;
        cor: string;
        valor_produto: number;
      }>();

      // Validar campos obrigatórios
      rows.forEach((row, index) => {
        const linha = index + 2; // +2 porque linha 1 é header

        if (!row.codigo_auxiliar) {
          errors.push({ linha, campo: 'codigo_auxiliar', mensagem: 'Campo obrigatório' });
        }
        if (!row.codigo_produto) {
          errors.push({ linha, campo: 'codigo_produto', mensagem: 'Campo obrigatório' });
        }
        if (!row.nome_produto) {
          errors.push({ linha, campo: 'nome_produto', mensagem: 'Campo obrigatório' });
        }

        // Se não houver erros para esta linha, adicionar ao map
        if (!errors.some(e => e.linha === linha)) {
          const codigoAuxiliar = String(row.codigo_auxiliar).toUpperCase().trim();
          const codigoProduto = String(row.codigo_produto).toUpperCase().trim();
          const parts = codigoAuxiliar.split(' ');
          const modelo = parts[0] || codigoProduto;
          const cor = parts.slice(1).join(' ') || '';

          produtosMap.set(codigoAuxiliar, {
            codigo_produto: codigoProduto,
            codigo_auxiliar: codigoAuxiliar,
            nome_produto: String(row.nome_produto).trim(),
            modelo,
            cor,
            valor_produto: parseFloat(String(row.valor_produto || 0)) || 0,
          });
        }
      });

      // Verificar duplicatas no banco em lotes
      const codigos = Array.from(produtosMap.keys());
      const duplicates: string[] = [];
      const BATCH_SIZE = 100;

      for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
        const batch = codigos.slice(i, i + BATCH_SIZE);
        const { data: existing } = await supabase
          .from('produtos')
          .select('codigo_auxiliar')
          .in('codigo_auxiliar', batch);

        if (existing) {
          existing.forEach(p => {
            duplicates.push(p.codigo_auxiliar);
            produtosMap.delete(p.codigo_auxiliar);
          });
        }
      }

      const isValid = errors.length === 0 && produtosMap.size > 0;

      setImportValidation({
        isValid,
        errors,
        duplicates,
        newProducts: produtosMap.size,
        produtosMap,
      });

      setImportStatus(isValid ? 'validated' : 'error');

      if (isValid) {
        toast.success(`Validação concluída: ${produtosMap.size} novos produtos prontos para importar.`);
      } else if (errors.length > 0) {
        toast.error(`Encontrados ${errors.length} erros de validação.`);
      } else if (produtosMap.size === 0) {
        toast.warning('Todos os produtos já existem no sistema.');
      }
    } catch (err) {
      toast.error('Erro ao validar arquivo');
      setImportStatus('error');
    }
  };

  const handleImportProducts = async () => {
    if (!importValidation?.produtosMap || importValidation.produtosMap.size === 0) return;

    setImportStatus('importing');

    try {
      const produtos = Array.from(importValidation.produtosMap.values());
      const BATCH_SIZE = 100;
      let importedCount = 0;

      for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
        const batch = produtos.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('produtos')
          .upsert(batch, { onConflict: 'codigo_auxiliar' });

        if (error) {
          toast.error(`Erro ao importar lote ${Math.floor(i / BATCH_SIZE) + 1}`);
          console.error(error);
          setImportStatus('error');
          return;
        }

        importedCount += batch.length;
      }

      toast.success(`${importedCount} produtos importados com sucesso!`);
      setImportStatus('completed');
      invalidateProdutos();
    } catch (err) {
      toast.error('Erro ao importar produtos');
      setImportStatus('error');
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        codigo_produto: 'OB1215',
        codigo_auxiliar: 'OB1215 Q01',
        nome_produto: 'ORX OB1215 O51-P19-H144',
        valor_produto: 45.90,
      },
      {
        codigo_produto: 'OB1215',
        codigo_auxiliar: 'OB1215 Q02',
        nome_produto: 'ORX OB1215 O51-P19-H144',
        valor_produto: 45.90,
      },
      {
        codigo_produto: 'PW6146',
        codigo_auxiliar: 'PW6146 A01',
        nome_produto: 'PW6146 Preto',
        valor_produto: 32.50,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'modelo_importacao_produtos.xlsx');
    toast.success('Modelo baixado!');
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
          <div className="flex gap-2">
            <Button variant="outline" className="border-2" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2" size={16} />
              Importar
            </Button>
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
        </div>

        {/* Search */}
        <SearchFilter value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto..." />

        {/* Import Dialog */}
        <Dialog open={importDialogOpen} onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) resetImport();
        }}>
          <DialogContent className="border-2 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet size={20} />
                Importar Produtos
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Upload Area */}
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFileSelect}
                  className="hidden"
                  id="import-file-input"
                />
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
                    <Button variant="ghost" size="sm" onClick={resetImport} className="mt-2">
                      Remover
                    </Button>
                  </div>
                )}
              </div>

              {/* Preview */}
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

              {/* Validation Results */}
              {importValidation && (
                <div className="space-y-3">
                  {importValidation.errors.length > 0 && (
                    <div className="bg-destructive/10 border-2 border-destructive/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                        <XCircle size={18} />
                        {importValidation.errors.length} erros encontrados
                      </div>
                      <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                        {importValidation.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>
                            Linha {err.linha}: {err.campo} - {err.mensagem}
                          </li>
                        ))}
                        {importValidation.errors.length > 10 && (
                          <li className="text-muted-foreground">
                            ... e mais {importValidation.errors.length - 10} erros
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {importValidation.duplicates.length > 0 && (
                    <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-warning font-medium mb-2">
                        <AlertTriangle size={18} />
                        {importValidation.duplicates.length} produtos já existem
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Estes códigos serão ignorados: {importValidation.duplicates.slice(0, 5).join(', ')}
                        {importValidation.duplicates.length > 5 && ` e mais ${importValidation.duplicates.length - 5}`}
                      </p>
                    </div>
                  )}

                  {importValidation.newProducts > 0 && (
                    <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-primary font-medium">
                        <CheckCircle2 size={18} />
                        {importValidation.newProducts} novos produtos prontos para importar
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status Messages */}
              {importStatus === 'completed' && (
                <div className="bg-primary/10 border-2 border-primary/30 rounded-lg p-4 text-center">
                  <CheckCircle2 className="mx-auto mb-2 text-primary" size={32} />
                  <p className="font-medium text-primary">Importação concluída com sucesso!</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="border-2" onClick={downloadTemplate}>
                  <Download className="mr-2" size={16} />
                  Baixar Modelo
                </Button>

                {importFile && importStatus === 'idle' && (
                  <Button onClick={handleValidateImport}>
                    Validar Arquivo
                  </Button>
                )}

                {importStatus === 'validating' && (
                  <Button disabled>
                    <Loader2 className="mr-2 animate-spin" size={16} />
                    Validando...
                  </Button>
                )}

                {importStatus === 'validated' && importValidation?.isValid && (
                  <Button onClick={handleImportProducts}>
                    <Upload className="mr-2" size={16} />
                    Importar {importValidation.newProducts} Produtos
                  </Button>
                )}

                {importStatus === 'importing' && (
                  <Button disabled>
                    <Loader2 className="mr-2 animate-spin" size={16} />
                    Importando...
                  </Button>
                )}

                {(importStatus === 'error' || importStatus === 'completed') && (
                  <Button variant="outline" className="border-2" onClick={resetImport}>
                    Nova Importação
                  </Button>
                )}
              </div>

              {/* Format Info */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <h4 className="font-medium mb-2">Formato Esperado</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li><strong>codigo_produto</strong> (obrigatório): Código principal do produto. Ex: OB1215</li>
                  <li><strong>codigo_auxiliar</strong> (obrigatório): Código único para QR Code. Ex: OB1215 Q01</li>
                  <li><strong>nome_produto</strong> (obrigatório): Nome/descrição do produto</li>
                  <li><strong>valor_produto</strong> (opcional): Custo do produto. Ex: 45.90</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
