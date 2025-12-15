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
          success: "!bg-[hsl(173,58%,39%)] !text-white !border-2 !border-[hsl(173,58%,30%)]",
          error: "!bg-[hsl(var(--destructive))] !text-white !border-2 !border-[hsl(0,84%,50%)]",
          warning: "!bg-[hsl(43,74%,66%)] !text-black !border-2 !border-[hsl(43,74%,50%)]",
          info: "!bg-[hsl(217,91%,60%)] !text-white !border-2 !border-[hsl(217,91%,50%)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
