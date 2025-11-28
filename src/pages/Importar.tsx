import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { ExcelRow } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Importar() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
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

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

      let success = 0;
      let errors = 0;

      // Agrupar por pedido
      const pedidosMap = new Map<string, { pedido: any; itens: any[] }>();

      for (const row of rows) {
        const numeroPedido = String(row.pedido);
        
        if (!pedidosMap.has(numeroPedido)) {
          pedidosMap.set(numeroPedido, {
            pedido: {
              numero_pedido: numeroPedido,
              data_emissao: row.data_emissao,
              codigo_cliente: String(row.codigo_cliente || ''),
              codigo_vendedor: String(row.codigo_vendedor),
              nome_vendedor: row.nome_vendedor,
              valor_total: parseValue(row.valor_total),
              codigo_tipo: Number(row.codigo_tipo),
              situacao: row.situacao || 'N',
              numero_nota_fiscal: String(row.numero_nota_fiscal || ''),
              serie_nota_fiscal: String(row.serie_nota_fiscal || ''),
            },
            itens: [],
          });
        }

        pedidosMap.get(numeroPedido)!.itens.push({
          codigo_auxiliar: row.codigo_auxiliar,
          nome_produto: row.nome_produto,
          quantidade: parseValue(row.quantidade),
          valor_produto: parseValue(row.valor_produto),
        });

        // Criar/atualizar produto se não existir
        const codigoAuxiliar = row.codigo_auxiliar;
        const [modelo, cor] = codigoAuxiliar.split(' ');

        await supabase.from('produtos').upsert({
          codigo_produto: row.codigo_produto,
          codigo_auxiliar: codigoAuxiliar,
          nome_produto: row.nome_produto,
          modelo: modelo || row.codigo_produto,
          cor: cor || '',
          valor_produto: parseValue(row.valor_produto),
        }, { onConflict: 'codigo_auxiliar' });
      }

      // Inserir pedidos e itens
      for (const [, { pedido, itens }] of pedidosMap) {
        // Verificar se pedido já existe
        const { data: existing } = await supabase
          .from('pedidos')
          .select('id')
          .eq('numero_pedido', pedido.numero_pedido)
          .eq('codigo_tipo', pedido.codigo_tipo)
          .maybeSingle();

        if (existing) {
          continue; // Pular pedidos duplicados
        }

        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos')
          .insert(pedido)
          .select()
          .single();

        if (pedidoError) {
          errors++;
          console.error('Erro ao inserir pedido:', pedidoError);
          continue;
        }

        const itensWithPedidoId = itens.map(item => ({
          ...item,
          pedido_id: pedidoData.id,
        }));

        const { error: itensError } = await supabase
          .from('itens_pedido')
          .insert(itensWithPedidoId);

        if (itensError) {
          errors++;
          console.error('Erro ao inserir itens:', itensError);
        } else {
          success++;
        }
      }

      setResult({ success, errors });
      toast.success(`Importação concluída! ${success} pedidos importados.`);
    } catch (err) {
      toast.error('Erro durante a importação');
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
              <div className={`p-4 border-2 ${result.errors > 0 ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50'}`}>
                <div className="flex items-center gap-2">
                  {result.errors > 0 ? (
                    <AlertCircle className="text-yellow-600" size={20} />
                  ) : (
                    <CheckCircle className="text-green-600" size={20} />
                  )}
                  <div>
                    <p className="font-medium">
                      {result.success} pedidos importados com sucesso
                    </p>
                    {result.errors > 0 && (
                      <p className="text-sm text-yellow-700">
                        {result.errors} pedidos com erro (verifique os logs)
                      </p>
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
