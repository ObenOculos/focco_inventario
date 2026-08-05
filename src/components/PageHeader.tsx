import { ReactNode } from 'react';
import { RefetchIndicator } from '@/components/RefetchIndicator';

/**
 * Cabeçalho padrão de página: título, subtítulo, indicador de refetch e a ação primária.
 *
 * Existiam três grafias do mesmo `<h1>` espalhadas pelas telas — `text-2xl sm:text-3xl
 * font-bold tracking-tight text-foreground`, `text-2xl font-bold tracking-tight` e
 * `text-2xl font-bold text-foreground` — mais três montagens diferentes do bloco que o
 * envolve. Nenhuma diferença era intencional.
 *
 * Toda página nova deve usar este componente. Ver DESIGN_SYSTEM.md.
 */
interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Ação primária da tela, alinhada à direita. Use no máximo uma. */
  action?: ReactNode;
  /** Liga o pontinho de "atualizando" ao lado do título. */
  isFetching?: boolean;
}

export function PageHeader({ title, description, action, isFetching }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {isFetching !== undefined && <RefetchIndicator isFetching={isFetching} />}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
