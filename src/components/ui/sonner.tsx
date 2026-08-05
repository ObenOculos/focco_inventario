import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts do sistema.
 *
 * A configuração anterior era de outro projeto visual: `borderRadius: '0'` (canto vivo num
 * app inteiramente arredondado), bordas de 2px, e sombras duras deslocadas
 * (`shadow-[4px_4px_0_0_...]`) de estilo neobrutalista. As cores de estado eram `hsl()`
 * cravados no arquivo — um quinto verde e um terceiro âmbar, fora de qualquer token.
 *
 * Agora segue o mesmo contrato das demais superfícies: raio 16px, borda de 1px, elevação de
 * camada flutuante (`shadow-lg`) e os tokens `*-subtle`/`*-strong` dos estados. Ver
 * DESIGN_SYSTEM.md, seções 2 e 6.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      expand={false}
      closeButton
      duration={4000}
      gap={8}
      visibleToasts={3}
      className="toaster group"
      style={{ fontFamily: 'var(--font-sans)' }}
      toastOptions={{
        classNames: {
          toast:
            'group toast !rounded-2xl !border !border-border/80 !bg-card !text-card-foreground !shadow-lg !font-sans',
          title: '!font-semibold !text-sm',
          description: '!text-muted-foreground !text-xs',
          actionButton: '!rounded-xl !bg-primary !text-primary-foreground !font-semibold',
          cancelButton: '!rounded-xl !bg-muted !text-muted-foreground !font-semibold',
          closeButton: '!rounded-lg !border-border/80 !bg-card hover:!bg-accent',
          success:
            '!bg-success-subtle !text-success-strong !border-success/30 [&>svg]:!text-success-strong',
          error:
            '!bg-destructive-subtle !text-destructive-strong !border-destructive/30 [&>svg]:!text-destructive-strong',
          warning:
            '!bg-warning-subtle !text-warning-strong !border-warning/30 [&>svg]:!text-warning-strong',
          info: '!bg-info-subtle !text-info-strong !border-info/30 [&>svg]:!text-info-strong',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
