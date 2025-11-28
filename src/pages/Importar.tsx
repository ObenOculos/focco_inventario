import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { ExcelRow } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportError {
  tipo: 'produto' | 'pedido' | 'item';
  identificador: string;
  mensagem: string;
  detalhes?: string;
}

export default function Importar() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; skipped: number; errorDetails: ImportError[] } | null>(null);
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
    setResult(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      setPreview(jsonData.slice(0, 5));
      toast.success(`${jsonData.length} registros encontrados`);
    } catch (err) {
      toast.error('Erro ao ler arquivo Excel');
      console.error(err);
    }
  };

  // Função para processar produtos em lotes de até 1000
  const batchUpsertProdutos = async (items: any[]): Promise<ImportError[]> => {
    const errors: ImportError[] = [];
    const BATCH_SIZE = 1000;
    
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('produtos').upsert(batch, { onConflict: 'codigo_auxiliar' });
      
      if (error) {
        console.error(`Erro no lote de produtos ${i / BATCH_SIZE + 1}:`, error);
        errors.push({
          tipo: 'produto',
          identificador: `Lote ${i / BATCH_SIZE + 1} (${batch.length} produtos)`,
          mensagem: error.message,
          detalhes: error.details || error.hint || undefined,
        });
      }
    }
    return errors;
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    const errorDetails: ImportError[] = [];

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      let success = 0;
      let errors = 0;
      let skipped = 0;

      // Coletar todos os produtos únicos
      const produtosMap = new Map<string, any>();
      
      // Agrupar por pedido
      const pedidosMap = new Map<string, { pedido: any; itens: any[] }>();

      // Validação e agrupamento
      let rowNumber = 1;
      for (const row of rows) {
        rowNumber++;
        
        // Validar campos obrigatórios
        if (!row.codigo_auxiliar) {
          errorDetails.push({
            tipo: 'item',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo codigo_auxiliar está vazio',
            detalhes: `Pedido: ${row.pedido || 'N/A'}`,
          });
          continue;
        }

        if (!row.codigo_produto) {
          errorDetails.push({
            tipo: 'produto',
            identificador: `Linha ${rowNumber}`,
            mensagem: 'Campo codigo_produto está vazio',
            detalhes: `codigo_auxiliar: ${row.codigo_auxiliar}`,
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
              nome_vendedor: row.nome_vendedor,
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

        // Coletar produto único
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

      // Verificar pedidos já existentes no banco ANTES de inserir
      const pedidoKeys = Array.from(pedidosMap.keys());
      const existingPedidos = new Set<string>();

      // Buscar pedidos existentes em lotes
      for (let i = 0; i < pedidoKeys.length; i += 100) {
        const batchKeys = pedidoKeys.slice(i, i + 100);
        const numerosToCheck = batchKeys.map(k => k.split('-')[0]);
        
        const { data: existing } = await supabase
          .from('pedidos')
          .select('numero_pedido, codigo_tipo')
          .in('numero_pedido', numerosToCheck);

        if (existing) {
          existing.forEach(p => {
            existingPedidos.add(`${p.numero_pedido}-${p.codigo_tipo}`);
          });
        }
      }

      // Informar sobre duplicatas
      const duplicatesCount = Array.from(pedidosMap.keys()).filter(k => existingPedidos.has(k)).length;
      if (duplicatesCount > 0) {
        toast.info(`${duplicatesCount} pedidos já existem e serão ignorados`);
      }

      // Inserir produtos em lotes de 1000
      const produtosArray = Array.from(produtosMap.values());
      if (produtosArray.length > 0) {
        const produtoErrors = await batchUpsertProdutos(produtosArray);
        errorDetails.push(...produtoErrors);
        if (produtoErrors.length > 0) {
          errors += produtoErrors.length;
        }
      }

      // Inserir pedidos e itens (apenas os que não existem)
      for (const [key, { pedido, itens }] of pedidosMap) {
        // Pular se já existe
        if (existingPedidos.has(key)) {
          skipped++;
          continue;
        }

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
          continue;
        }

        const itensWithPedidoId = itens.map(item => ({
          ...item,
          pedido_id: pedidoData.id,
        }));

        // Inserir itens em lotes se necessário
        const BATCH_SIZE = 1000;
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
          }
        }
        
        success++;
      }

      setResult({ success, errors, skipped, errorDetails });
      if (success > 0) {
        toast.success(`Importação concluída! ${success} pedidos importados.`);
      } else if (skipped > 0 && errors === 0) {
        toast.info('Nenhum pedido novo para importar.');
      } else if (errors > 0) {
        toast.error(`Importação com erros: ${errors} falhas`);
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Erro desconhecido';
      errorDetails.push({
        tipo: 'pedido',
        identificador: 'Erro Geral',
        mensagem: errorMessage,
        detalhes: err?.details || err?.hint || undefined,
      });
      setResult({ success: 0, errors: 1, skipped: 0, errorDetails });
      toast.error(`Erro durante a importação: ${errorMessage}`);
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
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
                Formato: .xlsx ou .xls
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
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

            {result && (
              <div className={`p-4 border-2 ${result.errors > 0 ? 'border-destructive bg-destructive/10' : 'border-green-500 bg-green-50'}`}>
                <div className="flex items-start gap-2">
                  {result.errors > 0 ? (
                    <AlertCircle className="text-destructive mt-0.5" size={20} />
                  ) : (
                    <CheckCircle className="text-green-600 mt-0.5" size={20} />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {result.success} pedidos importados com sucesso
                    </p>
                    {result.skipped > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {result.skipped} pedidos ignorados (já existiam)
                      </p>
                    )}
                    {result.errors > 0 && (
                      <p className="text-sm text-destructive font-medium">
                        {result.errors} erros encontrados
                      </p>
                    )}
                    
                    {result.errorDetails.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm font-medium text-foreground">Detalhes dos erros:</p>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {result.errorDetails.map((error, index) => (
                            <div key={index} className="text-xs bg-background border border-border p-2 rounded">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 font-medium uppercase ${
                                  error.tipo === 'produto' ? 'bg-blue-100 text-blue-800' :
                                  error.tipo === 'pedido' ? 'bg-yellow-100 text-yellow-800' :
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

            <div className="flex gap-3">
              <Button
                onClick={handleImport}
                disabled={!file || importing}
                className="flex-1"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" size={16} />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2" size={16} />
                    Importar Dados
                  </>
                )}
              </Button>
              {file && (
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
