import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Raio de superfície e a mesma paleta de estados dos badges — um aviso de "atrasado"
// tem que ser o mesmo âmbar em qualquer tela. As variantes `warning`/`success`/`info`
// existem porque as telas as construíam à mão, cada uma com sua mistura.
//
// O ícone herda a cor do texto (`[&>svg]:text-current`); antes era fixo em
// `text-foreground` e destoava do conteúdo colorido do alerta.
const alertVariants = cva(
  'relative w-full rounded-2xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground',
        info: 'border-info/25 bg-info-subtle text-info-strong',
        success: 'border-success/25 bg-success-subtle text-success-strong',
        warning: 'border-warning/30 bg-warning-subtle text-warning-strong',
        destructive: 'border-destructive/25 bg-destructive-subtle text-destructive-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
