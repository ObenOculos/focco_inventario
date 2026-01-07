import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ImportProvider } from '@/contexts/ImportContext';
import { MobileProvider } from '@/contexts/MobileContext';
import { ImportProgress } from '@/components/ImportProgress';
import { ImportBlocker } from '@/components/ImportBlocker';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { lazy, Suspense } from 'react';

// Lazy load all page components
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EstoqueTeorico = lazy(() => import('./pages/EstoqueTeorico'));
const Inventario = lazy(() => import('./pages/Inventario'));
const Historico = lazy(() => import('./pages/Historico'));
const Vendedores = lazy(() => import('./pages/Vendedores'));
const Produtos = lazy(() => import('./pages/Produtos'));
const Importar = lazy(() => import('./pages/Importar'));
const Conferencia = lazy(() => import('./pages/Conferencia'));
const Pedidos = lazy(() => import('./pages/Pedidos'));
const ControleVendedores = lazy(() => import('./pages/ControleVendedores'));
const AnaliseInventario = lazy(() => import('./pages/AnaliseInventario'));
const HistoricoEstoqueReal = lazy(() => import('./pages/HistoricoEstoqueReal'));
const NotaRetorno = lazy(() => import('./pages/NotaRetorno'));
const CodigosCorrecao = lazy(() => import('./pages/CodigosCorrecao'));
const NotFound = lazy(() => import('./pages/NotFound'));

const HomeRedirect = () => {
  const { profile } = useAuth();
  const redirectPath = profile?.role === 'vendedor' ? '/inventario' : '/dashboard';
  return <Navigate to={redirectPath} replace />;
};

const RootLayout = () => {
  return (
    <>
      <ImportBlocker />
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">Carregando...</div>
        }
      >
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
          path: '/estoque-teorico',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <EstoqueTeorico />
            </ProtectedRoute>
          ),
        },
        {
          path: '/historico-estoque-real',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <HistoricoEstoqueReal />
            </ProtectedRoute>
          ),
        },
        {
          path: '/analise-inventario',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <AnaliseInventario />
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
          path: '/controle-vendedores',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <ControleVendedores />
            </ProtectedRoute>
          ),
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
          path: '/importar',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Importar />
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
          path: '/pedidos',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <Pedidos />
            </ProtectedRoute>
          ),
        },
        {
          path: '/nota-retorno',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <NotaRetorno />
            </ProtectedRoute>
          ),
        },
        {
          path: '/codigos-correcao',
          element: (
            <ProtectedRoute allowedRoles={['gerente']}>
              <CodigosCorrecao />
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
  <MobileProvider>
    <AuthProvider>
      <ImportProvider>
        <TooltipProvider>
          <Sonner />
          <ImportProgress />
          <RouterProvider router={router} />
        </TooltipProvider>
      </ImportProvider>
    </AuthProvider>
  </MobileProvider>
);
export default App;
