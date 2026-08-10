import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Espelha o `Input`: mesmo traço, mesmo preenchimento, mesmo raio de
          // controle (`rounded-xl`) e mesmo hover. Estava em `rounded-md`, e era por
          // isso que as telas escreviam `rounded-xl` à mão — o que o DESIGN_SYSTEM
          // proíbe justamente porque só corrige a tela que lembrou de corrigir.
          //
          // `text-base` no mobile evita o zoom automático do iOS ao focar o campo:
          // o Safari amplia a viewport em qualquer campo com fonte abaixo de 16px, e
          // `text-sm` são 14px. `md:text-sm` volta ao normal no desktop.
          //
          // Sem anel de foco próprio: ele vem do `:focus-visible` global do index.css.
          'flex min-h-[80px] w-full rounded-xl border border-input bg-input-background px-3.5 py-2 text-base ring-offset-background transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
