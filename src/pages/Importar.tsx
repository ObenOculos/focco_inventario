import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { ExcelRow } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle, Loader2, Search, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportError {
  tipo: 'validacao' | 'duplicata' | 'produto' | 'pedido' | 'item';
  identificador: string;
  mensagem: string;
  detalhes?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ImportError[];
  duplicates: string[];
  newPedidos: number;
  totalProdutos: number;
  pedidosMap: Map<string, { pedido: any; itens: any[] }>;
  produtosMap: Map<string, any>;
}

type ImportStatus = 'idle' | 'validating' | 'validated' | 'importing' | 'completed' | 'error';

export default function Importar() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelRow[]>([]);
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; errorDetails: ImportError[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseValue = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(String(value).replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStatus('idle');
    setValidation(null);
    setImportResult(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      setPreview(jsonData.slice(0, 5));
      toast.success(`${jsonData.length} registros encontrados. Clique em "Validar" para verificar.`);
    } catch (err) {
      toast.error('Erro ao ler arquivo Excel');
      console.error(err);
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    setStatus('validating');
    setValidation(null);
    setImportResult(null);

    const errors: ImportError[] = [];
    const duplicates: string[] = [];

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      const produtosMap = new Map<string, any>();
      const pedidosMap = new Map<string, { pedido: any; itens: any[] }>();

      // ETAPA 1: Validação de campos obrigatórios
      let rowNumber = 1;
      for (const row of rows) {
        rowNumber++;
        
        if (!row.codigo_auxiliar) {
          errors.push({
            tipo: 'validacao',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo codigo_auxiliar está vazio',
            detalhes: `Pedido: ${row.pedido || 'N/A'}`,
          });
          continue;
        }

        if (!row.codigo_produto) {
          errors.push({
            tipo: 'validacao',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo codigo_produto está vazio',
            detalhes: `codigo_auxiliar: ${row.codigo_auxiliar}`,
          });
          continue;
        }

        if (!row.pedido) {
          errors.push({
            tipo: 'validacao',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo pedido está vazio',
          });
          continue;
        }

        if (!row.codigo_vendedor) {
          errors.push({
            tipo: 'validacao',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo codigo_vendedor está vazio',
            detalhes: `Pedido: ${row.pedido}`,
          });
          continue;
        }

        const numeroPedido = String(row.pedido);
        const codigoTipo = Number(row.codigo_tipo);
        const key = `${numeroPedido}-${codigoTipo}`;
        
        if (!pedidosMap.has(key)) {
          pedidosMap.set(key, {
            pedido: {
              numero_pedido: numeroPedido,
              data_emissao: row.data_emissao,
              codigo_cliente: String(row.codigo_cliente || ''),
              codigo_vendedor: String(row.codigo_vendedor),
              nome_vendedor: row.nome_vendedor || '',
              valor_total: parseValue(row.valor_total),
              codigo_tipo: codigoTipo,
              situacao: row.situacao || 'N',
              numero_nota_fiscal: String(row.numero_nota_fiscal || ''),
              serie_nota_fiscal: String(row.serie_nota_fiscal || ''),
            },
            itens: [],
          });
        }

        pedidosMap.get(key)!.itens.push({
          codigo_auxiliar: row.codigo_auxiliar,
          nome_produto: row.nome_produto || '',
          quantidade: parseValue(row.quantidade),
          valor_produto: parseValue(row.valor_produto),
        });

        const codigoAuxiliar = row.codigo_auxiliar;
        if (!produtosMap.has(codigoAuxiliar)) {
          const [modelo, cor] = codigoAuxiliar.split(' ');
          produtosMap.set(codigoAuxiliar, {
            codigo_produto: row.codigo_produto,
            codigo_auxiliar: codigoAuxiliar,
            nome_produto: row.nome_produto || '',
            modelo: modelo || row.codigo_produto,
            cor: cor || '',
            valor_produto: parseValue(row.valor_produto),
          });
        }
      }

      // ETAPA 2: Verificar duplicatas no banco de dados
      const pedidoKeys = Array.from(pedidosMap.keys());
      const existingPedidos = new Set<string>();

      for (let i = 0; i < pedidoKeys.length; i += 100) {
        const batchKeys = pedidoKeys.slice(i, i + 100);
        const numerosToCheck = batchKeys.map(k => k.split('-')[0]);
        
        const { data: existing } = await supabase
          .from('pedidos')
          .select('numero_pedido, codigo_tipo')
          .in('numero_pedido', numerosToCheck);

        if (existing) {
          existing.forEach(p => {
            const key = `${p.numero_pedido}-${p.codigo_tipo}`;
            existingPedidos.add(key);
            if (pedidosMap.has(key)) {
              duplicates.push(key);
              errors.push({
                tipo: 'duplicata',
                identificador: `Pedido #${p.numero_pedido}`,
                mensagem: 'Pedido já existe no banco de dados',
                detalhes: `Tipo: ${p.codigo_tipo === 7 ? 'Remessa' : 'Venda'}`,
              });
            }
          });
        }
      }

      // Filtrar pedidos duplicados
      duplicates.forEach(key => pedidosMap.delete(key));

      const newPedidos = pedidosMap.size;
      const isValid = errors.filter(e => e.tipo === 'validacao').length === 0 && newPedidos > 0;

      setValidation({
        isValid,
        errors,
        duplicates,
        newPedidos,
        totalProdutos: produtosMap.size,
        pedidosMap,
        produtosMap,
      });

      if (isValid) {
        setStatus('validated');
        toast.success(`Validação concluída! ${newPedidos} pedidos prontos para importar.`);
      } else if (newPedidos === 0 && duplicates.length > 0) {
        setStatus('error');
        toast.warning('Todos os pedidos já existem no banco de dados.');
      } else {
        setStatus('error');
        toast.error(`Validação falhou: ${errors.filter(e => e.tipo === 'validacao').length} erros encontrados.`);
      }

    } catch (err: any) {
      console.error(err);
      errors.push({
        tipo: 'validacao',
        identificador: 'Erro Geral',
        mensagem: err?.message || 'Erro desconhecido ao validar arquivo',
      });
      setValidation({ isValid: false, errors, duplicates: [], newPedidos: 0, totalProdutos: 0, pedidosMap: new Map(), produtosMap: new Map() });
      setStatus('error');
      toast.error('Erro durante a validação');
    }
  };

  const handleImport = async () => {
    if (!validation || !validation.isValid) return;

    setStatus('importing');
    const errorDetails: ImportError[] = [];
    let success = 0;
    let errors = 0;

    try {
      // Inserir produtos em lotes de 1000
      const produtosArray = Array.from(validation.produtosMap.values());
      const BATCH_SIZE = 1000;

      for (let i = 0; i < produtosArray.length; i += BATCH_SIZE) {
        const batch = produtosArray.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('produtos').upsert(batch, { onConflict: 'codigo_auxiliar' });
        
        if (error) {
          console.error(`Erro no lote de produtos:`, error);
          errorDetails.push({
            tipo: 'produto',
            identificador: `Lote ${Math.floor(i / BATCH_SIZE) + 1}`,
            mensagem: error.message,
            detalhes: error.details || error.hint || undefined,
          });
          errors++;
          // Interrompe se houver erro nos produtos
          setImportResult({ success: 0, errors: 1, errorDetails });
          setStatus('error');
          toast.error('Erro ao inserir produtos. Importação interrompida.');
          return;
        }
      }

      // Inserir pedidos e itens
      for (const [, { pedido, itens }] of validation.pedidosMap) {
        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos')
          .insert(pedido)
          .select()
          .single();

        if (pedidoError) {
          errors++;
          errorDetails.push({
            tipo: 'pedido',
            identificador: `Pedido #${pedido.numero_pedido}`,
            mensagem: pedidoError.message,
            detalhes: pedidoError.details || pedidoError.hint || `Vendedor: ${pedido.codigo_vendedor}`,
          });
          // Interrompe se houver erro
          setImportResult({ success, errors, errorDetails });
          setStatus('error');
          toast.error(`Erro ao inserir pedido #${pedido.numero_pedido}. Importação interrompida.`);
          return;
        }

        const itensWithPedidoId = itens.map(item => ({
          ...item,
          pedido_id: pedidoData.id,
        }));

        for (let i = 0; i < itensWithPedidoId.length; i += BATCH_SIZE) {
          const batch = itensWithPedidoId.slice(i, i + BATCH_SIZE);
          const { error: itensError } = await supabase
            .from('itens_pedido')
            .insert(batch);

          if (itensError) {
            errors++;
            errorDetails.push({
              tipo: 'item',
              identificador: `Itens do Pedido #${pedido.numero_pedido}`,
              mensagem: itensError.message,
              detalhes: itensError.details || itensError.hint || undefined,
            });
            // Interrompe se houver erro
            setImportResult({ success, errors, errorDetails });
            setStatus('error');
            toast.error(`Erro ao inserir itens do pedido #${pedido.numero_pedido}. Importação interrompida.`);
            return;
          }
        }
        
        success++;
      }

      setImportResult({ success, errors, errorDetails });
      setStatus('completed');
      toast.success(`Importação concluída! ${success} pedidos importados.`);

    } catch (err: any) {
      console.error(err);
      errorDetails.push({
        tipo: 'pedido',
        identificador: 'Erro Geral',
        mensagem: err?.message || 'Erro desconhecido',
      });
      setImportResult({ success, errors: errors + 1, errorDetails });
      setStatus('error');
      toast.error('Erro durante a importação');
    }
  };

  const resetImport = () => {
    setFile(null);
    setPreview([]);
    setStatus('idle');
    setValidation(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importar Pedidos</h1>
          <p className="text-muted-foreground">
            Importe pedidos de remessa e venda via arquivo Excel
          </p>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={20} />
              Upload de Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              className="border-2 border-dashed border-muted-foreground/50 p-8 text-center cursor-pointer hover:border-foreground transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} className="mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium">
                {file ? file.name : 'Clique para selecionar um arquivo Excel'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Formato: .xlsx, .xls ou .csv
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {preview.length > 0 && (
              <div className="border-2 border-border p-4">
                <p className="font-medium mb-2">Preview (primeiros 5 registros):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-foreground">
                        <th className="text-left py-2 px-1">Pedido</th>
                        <th className="text-left py-2 px-1">Vendedor</th>
                        <th className="text-left py-2 px-1">Tipo</th>
                        <th className="text-left py-2 px-1">Produto</th>
                        <th className="text-right py-2 px-1">Qtd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-border">
                          <td className="py-2 px-1 font-mono">{row.pedido}</td>
                          <td className="py-2 px-1">{row.codigo_vendedor}</td>
                          <td className="py-2 px-1">
                            <span className={`px-2 py-0.5 text-xs font-bold ${
                              row.codigo_tipo === 7 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {row.codigo_tipo === 7 ? 'REMESSA' : 'VENDA'}
                            </span>
                          </td>
                          <td className="py-2 px-1 font-mono">{row.codigo_auxiliar}</td>
                          <td className="py-2 px-1 text-right">{row.quantidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resultado da Validação */}
            {validation && (
              <div className={`p-4 border-2 ${validation.isValid ? 'border-green-500 bg-green-50' : 'border-destructive bg-destructive/10'}`}>
                <div className="flex items-start gap-2">
                  {validation.isValid ? (
                    <ShieldCheck className="text-green-600 mt-0.5" size={20} />
                  ) : (
                    <AlertCircle className="text-destructive mt-0.5" size={20} />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {validation.isValid ? 'Validação concluída com sucesso!' : 'Validação encontrou problemas'}
                    </p>
                    
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-background p-2 rounded border">
                        <span className="text-muted-foreground">Pedidos novos:</span>
                        <span className="font-bold ml-2">{validation.newPedidos}</span>
                      </div>
                      <div className="bg-background p-2 rounded border">
                        <span className="text-muted-foreground">Produtos:</span>
                        <span className="font-bold ml-2">{validation.totalProdutos}</span>
                      </div>
                      {validation.duplicates.length > 0 && (
                        <div className="bg-yellow-50 p-2 rounded border border-yellow-300 col-span-2">
                          <span className="text-yellow-700">Duplicatas ignoradas:</span>
                          <span className="font-bold ml-2 text-yellow-800">{validation.duplicates.length}</span>
                        </div>
                      )}
                    </div>
                    
                    {validation.errors.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Detalhes ({validation.errors.length} {validation.errors.length === 1 ? 'item' : 'itens'}):
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {validation.errors.map((error, index) => (
                            <div key={index} className="text-xs bg-background border border-border p-2 rounded">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 font-medium uppercase ${
                                  error.tipo === 'validacao' ? 'bg-red-100 text-red-800' :
                                  error.tipo === 'duplicata' ? 'bg-yellow-100 text-yellow-800' :
                                  error.tipo === 'produto' ? 'bg-blue-100 text-blue-800' :
                                  error.tipo === 'pedido' ? 'bg-orange-100 text-orange-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>
                                  {error.tipo}
                                </span>
                                <span className="font-mono font-medium">{error.identificador}</span>
                              </div>
                              <p className={error.tipo === 'duplicata' ? 'text-yellow-700 mt-1' : 'text-destructive mt-1'}>
                                {error.mensagem}
                              </p>
                              {error.detalhes && (
                                <p className="text-muted-foreground mt-0.5">{error.detalhes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Resultado da Importação */}
            {importResult && (
              <div className={`p-4 border-2 ${importResult.errors > 0 ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-50'}`}>
                <div className="flex items-start gap-2">
                  {importResult.errors > 0 ? (
                    <AlertCircle className="text-destructive mt-0.5" size={20} />
                  ) : (
                    <CheckCircle className="text-green-600 mt-0.5" size={20} />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {importResult.success} pedidos importados com sucesso
                    </p>
                    {importResult.errors > 0 && (
                      <p className="text-sm text-destructive font-medium">
                        {importResult.errors} erros - Importação interrompida
                      </p>
                    )}
                    
                    {importResult.errorDetails.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-foreground">Detalhes dos erros:</p>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {importResult.errorDetails.map((error, index) => (
                            <div key={index} className="text-xs bg-background border border-border p-2 rounded">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 font-medium uppercase ${
                                  error.tipo === 'produto' ? 'bg-blue-100 text-blue-800' :
                                  error.tipo === 'pedido' ? 'bg-orange-100 text-orange-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>
                                  {error.tipo}
                                </span>
                                <span className="font-mono font-medium">{error.identificador}</span>
                              </div>
                              <p className="text-destructive mt-1">{error.mensagem}</p>
                              {error.detalhes && (
                                <p className="text-muted-foreground mt-0.5">{error.detalhes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-3">
              {status === 'idle' && file && (
                <Button
                  onClick={handleValidate}
                  className="flex-1"
                >
                  <Search className="mr-2" size={16} />
                  Validar Dados
                </Button>
              )}

              {status === 'validating' && (
                <Button disabled className="flex-1">
                  <Loader2 className="mr-2 animate-spin" size={16} />
                  Validando...
                </Button>
              )}

              {status === 'validated' && validation?.isValid && (
                <Button
                  onClick={handleImport}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Upload className="mr-2" size={16} />
                  Importar {validation.newPedidos} Pedidos
                </Button>
              )}

              {status === 'importing' && (
                <Button disabled className="flex-1">
                  <Loader2 className="mr-2 animate-spin" size={16} />
                  Importando...
                </Button>
              )}

              {(status === 'error' || status === 'completed') && (
                <Button
                  onClick={resetImport}
                  variant="outline"
                  className="flex-1 border-2"
                >
                  Nova Importação
                </Button>
              )}

              {file && status !== 'validating' && status !== 'importing' && status !== 'completed' && (
                <Button variant="outline" onClick={resetImport} className="border-2">
                  Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader>
            <CardTitle>Formato Esperado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              O arquivo Excel deve conter as seguintes colunas:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm font-mono">
              {[
                'pedido', 'data_emissao', 'codigo_cliente', 'codigo_vendedor',
                'nome_vendedor', 'valor_total', 'codigo_tipo', 'situacao',
                'numero_nota_fiscal', 'serie_nota_fiscal', 'nome_produto',
                'codigo_auxiliar', 'codigo_produto', 'quantidade', 'valor_produto'
              ].map(col => (
                <span key={col} className="bg-secondary px-2 py-1">{col}</span>
              ))}
            </div>
            <div className="mt-4 p-3 bg-secondary">
              <p className="text-sm font-medium">Tipos de Movimentação (codigo_tipo):</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li><strong>2</strong> = Venda (saída de estoque)</li>
                <li><strong>7</strong> = Remessa (entrada de estoque)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
