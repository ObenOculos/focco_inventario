import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileQuestion } from 'lucide-react';

/**
 * Página 404.
 *
 * Estava inteiramente em inglês ("Oops! Page not found", "Return to Home") num app cujo
 * `<html lang>` é pt-BR e cuja interface é toda em português, e era a única tela que não
 * usava nenhum componente do sistema — `<a>` cru sobre `bg-muted`.
 *
 * Continua fora do `AppLayout` de propósito: a rota não resolvida pode ter sido aberta sem
 * sessão, e o layout depende do perfil autenticado.
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404: rota inexistente acessada:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FileQuestion className="size-7" />
          </div>

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Erro 404
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight">Página não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O endereço{' '}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {location.pathname}
            </code>{' '}
            não existe ou foi removido.
          </p>

          <Button asChild className="mt-6 w-full">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
