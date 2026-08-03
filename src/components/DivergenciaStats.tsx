import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, TrendingUp, TrendingDown, PackageSearch } from 'lucide-react';

interface DivergenciaStatsProps {
  itensCorretos: number;
  itensSobra: number;
  itensFalta: number;
  totalItens?: number;
  valorTotalDivergencia?: number;
}

export function DivergenciaStats({
  itensCorretos,
  itensSobra,
  itensFalta,
  totalItens,
  valorTotalDivergencia,
}: DivergenciaStatsProps) {
  const totalDivergencias = itensSobra + itensFalta;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="border border-border/80 rounded-2xl shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight text-muted-foreground flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle size={16} />
            </div>
            Itens Corretos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{itensCorretos}</p>
          <p className="text-xs text-muted-foreground mt-1 font-medium">peças conferidas sem diferença</p>
          {typeof totalItens === 'number' && (
            <p className="text-[11px] text-muted-foreground mt-0.5">de {totalItens} peças totais</p>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/80 rounded-2xl shadow-xs md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight text-muted-foreground flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <PackageSearch size={16} />
            </div>
            Análise de Diferenças
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 items-center pt-1">
          <div className="col-span-1 flex flex-col items-center justify-center border-r border-border/80 pr-4 text-center">
            <p className="text-3xl font-bold tracking-tight text-destructive">{totalDivergencias}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">Total Divergências</p>
            {typeof valorTotalDivergencia === 'number' && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Valor: {valorTotalDivergencia}
              </p>
            )}
          </div>
          <div className="col-span-2 flex flex-col justify-center space-y-2.5 pl-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                <TrendingUp size={16} />
                Sobras
              </span>
              <span className="font-bold text-base tracking-tight">{itensSobra}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-destructive">
                <TrendingDown size={16} />
                Faltas
              </span>
              <span className="font-bold text-base tracking-tight">{itensFalta}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
