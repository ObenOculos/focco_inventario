import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
const NotFound = lazy(() => import('./pages/NotFound'));

const HomeRedirect = () => {
  const { profile } = useAuth();
  const redirectPath = profile?.role === 'vendedor' ? '/inventario' : '/dashboard';
  return <Navigate to={redirectPath} replace />;
};

const App = () => (
  <MobileProvider>
    <AuthProvider>
      <ImportProvider>
        <TooltipProvider>
          <Sonner />
          <ImportProgress />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ImportBlocker />
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">Carregando...</div>
              }
            >
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/auth" element={<Auth />} />

                {/* Rotas protegidas para todos */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/estoque-teorico"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <EstoqueTeorico />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/historico-estoque-real"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <HistoricoEstoqueReal />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/analise-inventario"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <AnaliseInventario />
                    </ProtectedRoute>
                  }
                />

                {/* Rotas do vendedor */}
                <Route
                  path="/inventario"
                  element={
                    <ProtectedRoute allowedRoles={['vendedor']}>
                      <Inventario />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventario/:inventarioId"
                  element={
                    <ProtectedRoute allowedRoles={['vendedor']}>
                      <Inventario />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/historico"
                  element={
                    <ProtectedRoute allowedRoles={['vendedor']}>
                      <Historico />
                    </ProtectedRoute>
                  }
                />

                {/* Rotas do gerente */}
                <Route
                  path="/vendedores"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Vendedores />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/controle-vendedores"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <ControleVendedores />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/produtos"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Produtos />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/importar"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Importar />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/conferencia"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Conferencia />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pedidos"
                  element={
                    <ProtectedRoute allowedRoles={['gerente']}>
                      <Pedidos />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ImportProvider>
    </AuthProvider>
  </MobileProvider>
);
export default App;
