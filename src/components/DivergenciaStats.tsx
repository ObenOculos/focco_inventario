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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <CheckCircle size={16} />
            Itens Corretos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{itensCorretos}</p>
          <p className="text-xs text-muted-foreground">sem divergência</p>
          {typeof totalItens === 'number' && (
            <p className="text-[10px] text-muted-foreground mt-1">de {totalItens} itens</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <PackageSearch size={16} />
            Análise de Divergências
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 items-center pt-1">
          <div className="col-span-1 flex flex-col items-center justify-center border-r-2 pr-3">
            <p className="text-3xl font-bold text-destructive">{totalDivergencias}</p>
            <p className="text-xs text-muted-foreground text-center">Total Divergente</p>
            {typeof valorTotalDivergencia === 'number' && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Valor total: {valorTotalDivergencia}
              </p>
            )}
          </div>
          <div className="col-span-2 flex flex-col justify-center space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-yellow-600">
                <TrendingUp size={16} />
                Sobras
              </span>
              <span className="font-bold text-lg">{itensSobra}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-red-600">
                <TrendingDown size={16} />
                Faltas
              </span>
              <span className="font-bold text-lg">{itensFalta}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
