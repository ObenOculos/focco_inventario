import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={{ maxWidth: "calc(100vw)" }}
      toastOptions={{
        style: {
          background: "hsl(0, 0%, 100%)",
          color: "hsl(240, 10%, 4%)",
          border: "1px solid hsl(240, 6%, 90%)",
        },
        classNames: {
          toast: "group toast max-w-[calc(100vw)]",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
          success: "!bg-[hsl(173,58%,39%)] !text-white !border-[hsl(173,58%,30%)]",
          error: "!bg-[hsl(0,84%,60%)] !text-white !border-[hsl(0,84%,50%)]",
          warning: "!bg-[hsl(43,74%,66%)] !text-[hsl(0,0%,0%)] !border-[hsl(43,74%,50%)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
