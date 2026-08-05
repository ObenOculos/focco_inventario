import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // `rounded-xl` (12px) é o raio de controle do sistema — ver DESIGN_SYSTEM.md.
  // O foco usa o outline global de `index.css`; manter `focus-visible:outline-none`
  // aqui reintroduziria a divergência de dois anéis diferentes.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Confirmação positiva (aprovar, concluir). Existe para substituir o
        // `className="bg-green-600 hover:bg-green-700"` que era escrito à mão.
        success: 'bg-success text-success-foreground hover:bg-success/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // 44px é o alvo de toque mínimo recomendado, e é a altura que praticamente todo
      // botão do projeto já pedia à mão (`className="h-11 rounded-xl"`, 30 ocorrências).
      // Virou o padrão: as telas podem parar de repetir isso, e as que ainda repetem
      // continuam funcionando porque pedem exatamente o mesmo valor.
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-8',
        icon: 'h-11 w-11',
        // Ação dentro de linha de tabela ou de cartão, onde 44px domina a linha.
        iconSm: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
