import { useState } from 'react';
import { useImport } from '@/contexts/ImportContext';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, X } from 'lucide-react';

export function ImportProgress() {
  const { status, progress } = useImport();
  const [isVisible, setIsVisible] = useState(true);

  if (status !== 'importing' && status !== 'completed') {
    return null;
  }

  if (!isVisible) {
    return null;
  }

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card className="fixed bottom-4 right-4 w-80 p-4 shadow-lg border-2 z-50 bg-background">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {status === 'importing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-600" />
            )}
            <span className="font-medium text-sm">
              {status === 'importing' ? 'Importando...' : 'Concluído!'}
            </span>
          </div>
          {status === 'completed' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsVisible(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Progress value={percentage} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress.phase}</span>
          <span>{percentage}%</span>
        </div>
      </div>
    </Card>
  );
}
