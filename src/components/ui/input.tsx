import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // 44px e raio de controle, iguais aos do botão: campo e botão lado a lado
          // precisam alinhar sem ajuste manual. `text-base` no mobile evita o zoom
          // automático do iOS ao focar o campo; `md:text-sm` volta ao normal no desktop.
          'flex h-11 w-full rounded-xl border border-input bg-input-background px-3.5 py-2 text-base ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-muted-foreground/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
