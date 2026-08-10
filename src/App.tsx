import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PageLoader } from '@/components/PageLoader';
import { lazy, Suspense } from 'react';

// Lazy load all page components
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Historico = lazy(() => import('./pages/Historico'));
const Vendedores = lazy(() => import('./pages/Vendedores'));
const Produtos = lazy(() => import('./pages/Produtos'));
const Conferencia = lazy(() => import('./pages/Conferencia'));
const CompararInventarios = lazy(() => import('./pages/CompararInventarios'));
const ConsultaErp = lazy(() => import('./pages/ConsultaErp'));
const ExportarXml = lazy(() => import('./pages/ExportarXml'));
const NotFound = lazy(() => import('./pages/NotFound'));

const HomeRedirect = () => {
  const { profile, user, loading } = useAuth();

  // Aguarda auth + perfil carregarem antes de decidir o destino, evitando
  // redirecionar para a área do papel errado enquanto o role ainda é nulo.
  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const redirectPath = profile?.role === 'vendedor' ? '/inventario' : '/dashboard';
  return <Navigate to={redirectPath} replace />;
};

const RootLayout = () => {
  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
};

const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [
        { path: '/', element: <HomeRedirect /> },
        { path: '/auth', element: <Auth /> },
        {
          path: '/dashboard',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Dashboard />
            </ProtectedRoute>
          ),
        },
        {
          path: '/inventario',
          element: (
            <ProtectedRoute allowedRoles={['vendedor']}>
              <Inventario />
            </ProtectedRoute>
          ),
        },
        {
          path: '/inventario/:inventarioId',
          element: (
            <ProtectedRoute allowedRoles={['vendedor']}>
              <Inventario />
            </ProtectedRoute>
          ),
        },
        {
          path: '/historico',
          element: (
            <ProtectedRoute allowedRoles={['vendedor']}>
              <Historico />
            </ProtectedRoute>
          ),
        },
        {
          path: '/vendedores',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Vendedores />
            </ProtectedRoute>
          ),
        },
        {
          // O Painel de Vendedores foi absorvido pelo cadastro: as duas telas liam a mesma
          // linha de `profiles`. O redirect mantém favoritos e links antigos funcionando.
          path: '/controle-vendedores',
          element: <Navigate to="/vendedores" replace />,
        },
        {
          path: '/produtos',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Produtos />
            </ProtectedRoute>
          ),
        },
        {
          path: '/conferencia',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Conferencia />
            </ProtectedRoute>
          ),
        },
        {
          path: '/comparar-inventarios',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <CompararInventarios />
            </ProtectedRoute>
          ),
        },
        {
          path: '/exportar-xml',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <ExportarXml />
            </ProtectedRoute>
          ),
        },
        {
          // Só gerente: a consulta expõe vendas, clientes e valores de TODOS os
          // vendedores. A Edge Function repete essa checagem no servidor — esta
          // aqui só evita a viagem inútil.
          path: '/consulta-erp',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <ConsultaErp />
            </ProtectedRoute>
          ),
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
);

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <Sonner />
      <RouterProvider router={router} />
    </TooltipProvider>
  </AuthProvider>
);
export default App;
