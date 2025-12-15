import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useImport } from '@/contexts/ImportContext';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function ImportBlocker() {
  const { status } = useImport();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (status !== 'importing') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [status]);

  const isImporting = status === 'importing';

  return (
    <AlertDialog open={isImporting && location.pathname !== '/importar'}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Importação em Andamento</AlertDialogTitle>
          <AlertDialogDescription>
            Uma importação está sendo processada. Aguarde a conclusão antes de navegar para outra
            página.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => navigate('/importar')}>Voltar para Importação</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
