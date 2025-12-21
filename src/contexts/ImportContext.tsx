import { createContext, useContext, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportError {
  tipo: 'validacao' | 'duplicata' | 'produto' | 'pedido' | 'item';
  identificador: string;
  mensagem: string;
  detalhes?: string;
}

interface ImportProgress {
  current: number;
  total: number;
  phase: string;
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

interface ImportContextType {
  status: ImportStatus;
  progress: ImportProgress;
  validation: ValidationResult | null;
  importResult: { success: number; errors: number; errorDetails: ImportError[] } | null;
  startImport: (validation: ValidationResult) => Promise<void>;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0, phase: '' });
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<{
    success: number;
    errors: number;
    errorDetails: ImportError[];
  } | null>(null);

  const startImport = async (validationData: ValidationResult) => {
    if (!validationData.isValid) return;

    setValidation(validationData);
    setStatus('importing');
    setImportResult(null);

    const errorDetails: ImportError[] = [];
    let success = 0;
    let errors = 0;

    const totalPedidos = validationData.pedidosMap.size;
    const totalProdutos = validationData.produtosMap.size;
    const totalSteps = totalProdutos > 0 ? totalPedidos + 1 : totalPedidos;

    try {
      // Inserir produtos
      const produtosArray = Array.from(validationData.produtosMap.values());
      const BATCH_SIZE = 1000;

      if (produtosArray.length > 0) {
        setProgress({ current: 0, total: totalSteps, phase: 'Inserindo produtos...' });
      }

      for (let i = 0; i < produtosArray.length; i += BATCH_SIZE) {
        const batch = produtosArray.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('produtos')
          .upsert(batch, { onConflict: 'codigo_auxiliar' });

        if (error) {
          console.error(`Erro no lote de produtos:`, error);
          errorDetails.push({
            tipo: 'produto',
            identificador: `Lote ${Math.floor(i / BATCH_SIZE) + 1}`,
            mensagem: error.message,
            detalhes: error.details || error.hint || undefined,
          });
          errors++;
          setImportResult({ success: 0, errors: 1, errorDetails });
          setStatus('error');
          toast.error('Erro ao inserir produtos. Importação interrompida.');
          return;
        }
      }

      if (produtosArray.length > 0) {
        setProgress({ current: 1, total: totalSteps, phase: 'Inserindo pedidos...' });
      }

      // Inserir pedidos
      let pedidoIndex = 0;
      const baseStep = produtosArray.length > 0 ? 1 : 0;

      for (const [, { pedido, itens }] of validationData.pedidosMap) {
        setProgress({
          current: baseStep + pedidoIndex,
          total: totalSteps,
          phase: `Pedido ${pedidoIndex + 1} de ${totalPedidos}`,
        });

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
            detalhes:
              pedidoError.details || pedidoError.hint || `Vendedor: ${pedido.codigo_vendedor}`,
          });
          setImportResult({ success, errors, errorDetails });
          setStatus('error');
          toast.error(`Erro ao inserir pedido #${pedido.numero_pedido}. Importação interrompida.`);
          return;
        }

        const itensWithPedidoId = itens.map((item) => ({
          ...item,
          pedido_id: pedidoData.id,
        }));

        for (let i = 0; i < itensWithPedidoId.length; i += BATCH_SIZE) {
          const batch = itensWithPedidoId.slice(i, i + BATCH_SIZE);
          const { error: itensError } = await supabase.from('itens_pedido').insert(batch);

          if (itensError) {
            errors++;
            errorDetails.push({
              tipo: 'item',
              identificador: `Itens do Pedido #${pedido.numero_pedido}`,
              mensagem: itensError.message,
              detalhes: itensError.details || itensError.hint || undefined,
            });
            setImportResult({ success, errors, errorDetails });
            setStatus('error');
            toast.error(
              `Erro ao inserir itens do pedido #${pedido.numero_pedido}. Importação interrompida.`
            );
            return;
          }
        }

        success++;
        pedidoIndex++;
      }

      setImportResult({ success, errors, errorDetails });
      setStatus('completed');
      setProgress({ current: totalSteps, total: totalSteps, phase: 'Concluído' });
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

  return (
    <ImportContext.Provider value={{ status, progress, validation, importResult, startImport }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error('useImport deve ser usado dentro de ImportProvider');
  }
  return context;
}
