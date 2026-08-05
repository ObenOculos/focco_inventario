import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/PageLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('vendedor' | 'gerente')[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading, profileLoaded, signOut } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Sessão sem perfil: não dá para saber o papel, e renderizar mesmo assim
  // entrega a interface de vendedor para um gerente. Melhor travar aqui.
  if (!profile) {
    if (!profileLoaded) {
      return <PageLoader label="Carregando perfil" />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar seu perfil. Entre novamente.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    const redirectPath = profile.role === 'vendedor' ? '/inventario' : '/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
}
