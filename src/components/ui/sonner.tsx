import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{ maxWidth: 'calc(100vw - 32px)' }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:max-w-[calc(100vw-32px)]",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:bg-[hsl(173,58%,39%)] group-[.toaster]:text-white group-[.toaster]:border-[hsl(173,58%,30%)]",
          error: "group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-[hsl(0,84%,50%)]",
          warning: "group-[.toaster]:bg-[hsl(43,74%,66%)] group-[.toaster]:text-[hsl(0,0%,0%)] group-[.toaster]:border-[hsl(43,74%,50%)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
