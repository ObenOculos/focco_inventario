import { RefreshCw } from 'lucide-react';

interface RefetchIndicatorProps {
  isFetching: boolean;
  className?: string;
}

export function RefetchIndicator({ isFetching, className = '' }: RefetchIndicatorProps) {
  if (!isFetching) return null;

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
      <RefreshCw size={12} className="animate-spin" />
      <span>Atualizando...</span>
    </div>
  );
}