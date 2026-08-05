import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CardSkeletonProps {
  showIcon?: boolean;
  lines?: number;
}

export function CardSkeleton({ showIcon = true, lines = 1 }: CardSkeletonProps) {
  return (
    <Card className="border border-border/80 rounded-2xl shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {showIcon && <Skeleton className="h-5 w-5 rounded" />}
          <Skeleton className="h-4 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-12 mt-1" />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Lista vertical de cartões — para telas cujo conteúdo é uma pilha de registros
 * (`Historico`), onde antes havia só o texto "Carregando…" e o layout saltava ao chegar
 * o dado. Ver a regra de estados de carregamento em DESIGN_SYSTEM.md.
 */
export function ListaCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="py-4 sm:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-6 w-24 rounded-lg" />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function StatsCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

