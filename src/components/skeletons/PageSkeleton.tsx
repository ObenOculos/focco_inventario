import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Espelha o Dashboard: saudação, os dois cartões-lista e o bloco de aprovados recentes. */
export function DashboardSkeleton() {
  const linhas = (n: number) =>
    Array.from({ length: n }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 py-2.5">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
        <Skeleton className="h-4 w-10" />
      </div>
    ));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="border border-border/80 rounded-2xl shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/70">{linhas(4)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-border/80 rounded-2xl shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-3 w-20" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/70 px-3.5 py-3 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
          <Skeleton className="h-9 w-full mt-3.5 rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export function ConferenciaSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-8 rounded-full" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-2">
            <CardHeader className="pb-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

