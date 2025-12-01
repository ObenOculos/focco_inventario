import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Target } from 'lucide-react';

interface DivergenciaStatsProps {
  totalItens: number;
  itensCorretos: number;
  itensSobra: number;
  itensFalta: number;
  valorTotalDivergencia: number;
}

export function DivergenciaStats({
  totalItens,
  itensCorretos,
  itensSobra,
  itensFalta,
  valorTotalDivergencia,
}: DivergenciaStatsProps) {
  const acuracidade = totalItens > 0 ? ((itensCorretos / totalItens) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <Target size={14} />
            Acuracidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{acuracidade}%</p>
          <p className="text-xs text-muted-foreground">{itensCorretos}/{totalItens} corretos</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle size={14} />
            Corretos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">{itensCorretos}</p>
          <p className="text-xs text-muted-foreground">sem divergência</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp size={14} />
            Sobras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-yellow-600">{itensSobra}</p>
          <p className="text-xs text-muted-foreground">produtos a mais</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown size={14} />
            Faltas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-red-600">{itensFalta}</p>
          <p className="text-xs text-muted-foreground">produtos a menos</p>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle size={14} />
            Divergência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{Math.abs(valorTotalDivergencia)}</p>
          <p className="text-xs text-muted-foreground">unidades total</p>
        </CardContent>
      </Card>
    </div>
  );
}
