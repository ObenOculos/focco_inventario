import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InventoryStatus } from '@/types/app';

/**
 * Badge de status de inventário — fonte única de cor e de rótulo.
 *
 * Existiam duas implementações independentes do mesmo conceito, e elas discordavam em
 * cor E em texto:
 *
 *   status     Historico.tsx                        Vendedores.tsx
 *   pendente   âmbar    "Pendente"                  amarelo  "Pendente"
 *   aprovado   esmeralda "Aprovado"                 verde    "Aprovado"
 *   revisao    destrutivo "Não aprovado"            laranja  "Revisão"
 *
 * Três problemas de uma vez: matizes diferentes para o mesmo significado, opacidades
 * diferentes (/10 contra /20), e **o mesmo status com dois nomes** — um usuário que
 * visse as duas telas concluiria que são coisas distintas. A versão de Vendedores ainda
 * não tinha variante de tema escuro, então `text-green-700` ficaria ilegível caso o
 * tema escuro venha a ser ligado.
 *
 * Rótulo adotado: o de `Historico`, que é a tela do vendedor — "Não aprovado" descreve o
 * que aconteceu com a contagem dele; "Revisão" descreve a fila do gerente.
 */
const CONFIG: Record<InventoryStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' }> = {
  aprovado: { label: 'Aprovado', variant: 'success' },
  pendente: { label: 'Pendente', variant: 'warning' },
  revisao: { label: 'Não aprovado', variant: 'destructive' },
  // Sem escritor desde a Etapa 5, mas ainda presente no enum e em linhas históricas.
  baixado: { label: 'Baixado', variant: 'info' },
};

/**
 * Rótulo do status em texto puro, para onde não cabe um badge — opção de filtro, frase
 * corrida, célula de planilha. Compartilha a mesma tabela do badge, de modo que renomear
 * um status muda os dois juntos.
 */
export function rotuloStatusInventario(status: string): string {
  return CONFIG[status as InventoryStatus]?.label ?? status;
}

interface StatusInventarioBadgeProps {
  /**
   * Aceita `string` porque nem toda consulta tipa a coluna como o enum. Valor fora da
   * tabela cai no badge neutro em vez de sumir — ver o tratamento abaixo.
   */
  status: InventoryStatus | string | null | undefined;
  className?: string;
  /** O que exibir quando não há inventário. Padrão: travessão. */
  fallback?: React.ReactNode;
}

export function StatusInventarioBadge({
  status,
  className,
  fallback = <span className="text-muted-foreground">—</span>,
}: StatusInventarioBadgeProps) {
  if (!status) return <>{fallback}</>;

  // Proporção do badge da tela Exportar XML — 10px, padding curto, cantos suaves — que é
  // a versão escolhida como padrão. As outras duas eram maiores (`text-xs px-3 py-1`) e
  // roubavam peso do dado ao lado.
  const dimensoes = 'px-2.5 py-0.5 text-2xs';

  const config = CONFIG[status as InventoryStatus];
  // Status desconhecido (enum novo sem tratamento aqui) não pode sumir da tela em
  // silêncio — aparece cru, o que torna a omissão visível em vez de invisível.
  if (!config) {
    return (
      <Badge variant="neutral" className={cn(dimensoes, className)}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant={config.variant} className={cn(dimensoes, className)}>
      {config.label}
    </Badge>
  );
}
