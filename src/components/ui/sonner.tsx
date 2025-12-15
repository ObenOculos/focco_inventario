import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

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
      style={{ 
        fontFamily: "var(--font-sans)",
      }}
      toastOptions={{
        style: {
          background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
          border: "2px solid hsl(var(--border))",
          borderRadius: "0",
          boxShadow: "var(--shadow-sm)",
          fontFamily: "var(--font-sans)",
        },
        classNames: {
          toast: "group toast",
          title: "font-bold",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground border-2 border-border",
          cancelButton: "bg-muted text-muted-foreground border-2 border-border",
          closeButton: "border-2 border-border bg-background hover:bg-muted",
          success: "!bg-background !text-[hsl(143,70%,35%)] !border-2 !border-[hsl(143,70%,35%)] [&>svg]:!text-[hsl(143,70%,35%)] !shadow-[4px_4px_0_0_hsl(143,70%,25%)]",
          error: "!bg-background !text-destructive !border-2 !border-destructive [&>svg]:!text-destructive !shadow-[4px_4px_0_0_hsl(0,84%,50%)]",
          warning: "!bg-background !text-[hsl(38,92%,40%)] !border-2 !border-[hsl(38,92%,40%)] [&>svg]:!text-[hsl(38,92%,40%)] !shadow-[4px_4px_0_0_hsl(38,92%,30%)]",
          info: "!bg-background !text-[hsl(217,91%,50%)] !border-2 !border-[hsl(217,91%,50%)] [&>svg]:!text-[hsl(217,91%,50%)] !shadow-[4px_4px_0_0_hsl(217,91%,40%)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
