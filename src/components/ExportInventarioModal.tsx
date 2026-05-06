import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { FileJson, FileSpreadsheet } from 'lucide-react';
import { format as formatDate } from 'date-fns';
import { toast } from 'sonner';

export interface ExportInventarioItem {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade_fisica: number;
}

interface ExportInventarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ExportInventarioItem[];
  observacoes?: string;
  codigoVendedor?: string | null;
  editingInventarioId?: string | null;
}

export function ExportInventarioModal({
  open,
  onOpenChange,
  items,
  observacoes,
  codigoVendedor,
  editingInventarioId,
}: ExportInventarioModalProps) {
  const [busy, setBusy] = useState(false);

  const stamp = formatDate(new Date(), 'yyyyMMdd_HHmm');
  const vendedor = codigoVendedor || 'vendedor';
  const baseName = `inventario_${vendedor}_${stamp}`;

  const exportJson = () => {
    if (items.length === 0) {
      toast.error('Não há itens para exportar.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        version: 1,
        tipo: 'inventario_focco',
        exported_at: new Date().toISOString(),
        codigo_vendedor: codigoVendedor || null,
        observacoes: observacoes || '',
        editing_inventario_id: editingInventarioId || null,
        items,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Arquivo JSON exportado com sucesso.');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    if (items.length === 0) {
      toast.error('Não há itens para exportar.');
      return;
    }
    setBusy(true);
    try {
      const data = items.map((it) => ({
        codigo_auxiliar: it.codigo_auxiliar,
        nome_produto: it.nome_produto,
        quantidade_fisica: it.quantidade_fisica,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
      XLSX.writeFile(wb, `${baseName}.xlsx`);
      toast.success('Arquivo Excel exportado com sucesso.');
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar Inventário</DialogTitle>
          <DialogDescription>
            Escolha o formato para exportar os {items.length} item(ns) atuais.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <Card
            className={`cursor-pointer hover:border-primary transition-colors ${
              busy ? 'opacity-50 pointer-events-none' : ''
            }`}
            onClick={exportExcel}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <FileSpreadsheet className="text-primary" size={36} />
              <p className="font-semibold">Excel</p>
              <p className="text-xs text-muted-foreground">.xlsx</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer hover:border-primary transition-colors ${
              busy ? 'opacity-50 pointer-events-none' : ''
            }`}
            onClick={exportJson}
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <FileJson className="text-primary" size={36} />
              <p className="font-semibold">JSON</p>
              <p className="text-xs text-muted-foreground">.json</p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
