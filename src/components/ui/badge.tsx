import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// `rounded-lg` em vez de `rounded-full`: as telas já sobrescreviam para cantos suaves,
// e pílula totalmente redonda destoa das superfícies e controles do sistema.
//
// As variantes de estado usam os tokens `*-subtle` (fundo) e `*-strong` (texto), que
// existem nos dois temas. Antes cada tela montava a cor à mão — `bg-green-500/20
// text-green-700` numa, `bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`
// noutra — para dizer exatamente a mesma coisa.
const badgeVariants = cva(
  'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-border text-foreground',
        neutral: 'border-border bg-muted text-muted-foreground',
        // Borda em /30 e fundo suave: proporção herdada do badge da tela Exportar XML,
        // que o usuário escolheu como padrão do sistema.
        success: 'border-success/30 bg-success-subtle text-success-strong',
        warning: 'border-warning/30 bg-warning-subtle text-warning-strong',
        info: 'border-info/30 bg-info-subtle text-info-strong',
        destructive: 'border-destructive/30 bg-destructive-subtle text-destructive-strong',
        /** Vermelho sólido: só para o que é realmente irreversível ou bloqueante. */
        destructiveSolid:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
