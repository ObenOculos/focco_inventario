import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Download, FileJson, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export interface ImportedInventarioItem {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
}

interface ImportInventarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: ImportedInventarioItem[], observacoes?: string) => void;
}

type Format = 'json' | 'excel' | null;

export function ImportInventarioModal({
  open,
  onOpenChange,
  onImport,
}: ImportInventarioModalProps) {
  const [format, setFormat] = useState<Format>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClose = (next: boolean) => {
    if (!next) setFormat(null);
    onOpenChange(next);
  };

  const downloadJsonTemplate = () => {
    const sample = {
      version: 1,
      tipo: 'inventario_focco',
      observacoes: '',
      items: [
        { codigo_auxiliar: 'EXEMPLO PRETO', nome_produto: 'Produto Exemplo', quantidade_fisica: 5 },
        { codigo_auxiliar: 'EXEMPLO BRANCO', nome_produto: 'Produto Exemplo 2', quantidade_fisica: 2 },
      ],
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_inventario.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadExcelTemplate = () => {
    const data = [
      { codigo_auxiliar: 'EXEMPLO PRETO', nome_produto: 'Produto Exemplo', quantidade_fisica: 5 },
      { codigo_auxiliar: 'EXEMPLO BRANCO', nome_produto: 'Produto Exemplo 2', quantidade_fisica: 2 },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'modelo_inventario.xlsx');
  };

  const parseJson = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items)) {
      throw new Error('Arquivo inválido: campo "items" não encontrado.');
    }
    const items: ImportedInventarioItem[] = data.items
      .filter((it: any) => it && typeof it.codigo_auxiliar === 'string')
      .map((it: any) => ({
        codigo_auxiliar: String(it.codigo_auxiliar).toUpperCase().trim(),
        nome_produto: String(it.nome_produto || it.codigo_auxiliar),
        quantidade_fisica: Number(it.quantidade_fisica) || 0,
      }));
    return {
      items,
      observacoes: typeof data.observacoes === 'string' ? data.observacoes : undefined,
    };
  };

  const parseExcel = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('Planilha vazia.');
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

    const norm = (s: string) =>
      s
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const items: ImportedInventarioItem[] = [];
    for (const row of rows) {
      const keyMap: Record<string, string> = {};
      Object.keys(row).forEach((k) => (keyMap[norm(k)] = k));
      const codigoKey =
        keyMap['codigo_auxiliar'] ||
        keyMap['codigo'] ||
        keyMap['codigo auxiliar'] ||
        keyMap['cod'] ||
        keyMap['cod auxiliar'];
      const nomeKey = keyMap['nome_produto'] || keyMap['nome'] || keyMap['produto'];
      const qtdKey =
        keyMap['quantidade_fisica'] ||
        keyMap['quantidade'] ||
        keyMap['qtd'] ||
        keyMap['qtde'] ||
        keyMap['qtd fisica'];

      if (!codigoKey) continue;
      const codigo = String(row[codigoKey] || '')
        .toUpperCase()
        .trim();
      if (!codigo) continue;
      const qtd = qtdKey ? Number(row[qtdKey]) || 0 : 0;
      const nome = nomeKey ? String(row[nomeKey] || codigo) : codigo;
      items.push({ codigo_auxiliar: codigo, nome_produto: nome, quantidade_fisica: qtd });
    }
    return { items };
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = format === 'excel' ? await parseExcel(file) : await parseJson(file);
      if (result.items.length === 0) {
        toast.error('Arquivo não contém itens válidos.');
        return;
      }
      onImport(result.items, (result as any).observacoes);
      toast.success(`${result.items.length} item(ns) importado(s).`);
      handleClose(false);
    } catch (err) {
      console.error('Erro ao importar arquivo:', err);
      toast.error(
        err instanceof Error ? err.message : 'Não foi possível ler o arquivo.'
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {format === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Importar Inventário</DialogTitle>
              <DialogDescription>Escolha o formato do arquivo a importar.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setFormat('excel')}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <FileSpreadsheet className="text-primary" size={36} />
                  <p className="font-semibold">Excel</p>
                  <p className="text-xs text-muted-foreground">.xlsx ou .xls</p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setFormat('json')}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <FileJson className="text-primary" size={36} />
                  <p className="font-semibold">JSON</p>
                  <p className="text-xs text-muted-foreground">.json</p>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFormat(null)}
                  aria-label="Voltar"
                >
                  <ArrowLeft size={16} />
                </Button>
                Importar via {format === 'excel' ? 'Excel' : 'JSON'}
              </DialogTitle>
              <DialogDescription>
                Siga as instruções abaixo para importar seu inventário.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md border p-3 bg-muted/40">
                <p className="font-semibold mb-1">Instruções</p>
                {format === 'excel' ? (
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>
                      Use as colunas: <strong>codigo_auxiliar</strong>,{' '}
                      <strong>nome_produto</strong> (opcional) e{' '}
                      <strong>quantidade_fisica</strong>.
                    </li>
                    <li>O código deve seguir o formato <code>[MODELO] [COR]</code>.</li>
                    <li>Itens repetidos terão suas quantidades somadas.</li>
                    <li>A primeira aba da planilha será considerada.</li>
                  </ul>
                ) : (
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>
                      O arquivo deve conter um campo <code>items</code> (array).
                    </li>
                    <li>
                      Cada item precisa de <strong>codigo_auxiliar</strong> e{' '}
                      <strong>quantidade_fisica</strong>.
                    </li>
                    <li>O código deve seguir o formato <code>[MODELO] [COR]</code>.</li>
                    <li>Itens repetidos terão suas quantidades somadas.</li>
                  </ul>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={format === 'excel' ? downloadExcelTemplate : downloadJsonTemplate}
              >
                <Download size={16} className="mr-2" />
                Baixar arquivo modelo
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept={format === 'excel' ? '.xlsx,.xls' : 'application/json,.json'}
                onChange={handleFile}
                className="hidden"
                id="inventario-import-file"
                name="inventario_import_file"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} className="mr-2" />
                Selecionar arquivo
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
