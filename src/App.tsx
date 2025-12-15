import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ImportProvider } from "@/contexts/ImportContext";
import { ImportProgress } from "@/components/ImportProgress";
import { ImportBlocker } from "@/components/ImportBlocker";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import EstoqueTeorico from "./pages/EstoqueTeorico";
import Inventario from "./pages/Inventario";
import Historico from "./pages/Historico";
import Vendedores from "./pages/Vendedores";
import Produtos from "./pages/Produtos";
import Importar from "./pages/Importar";
import Conferencia from "./pages/Conferencia";
import Pedidos from "./pages/Pedidos";

import ControleVendedores from "./pages/ControleVendedores";
import AnaliseInventario from "./pages/AnaliseInventario";
import HistoricoEstoqueReal from "./pages/HistoricoEstoqueReal";
import NotFound from "./pages/NotFound";

const HomeRedirect = () => {
  const { profile } = useAuth();
  const redirectPath = profile?.role === 'vendedor' ? '/inventario' : '/dashboard';
  return <Navigate to={redirectPath} replace />;
};

const App = () => (
  <AuthProvider>
    <ImportProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ImportProgress />
        <BrowserRouter>
          <ImportBlocker />
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Rotas protegidas para todos */}
            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/estoque-teorico" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <EstoqueTeorico />
              </ProtectedRoute>
            } />
            <Route path="/historico-estoque-real" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <HistoricoEstoqueReal />
              </ProtectedRoute>
            } />
             <Route path="/analise-inventario" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <AnaliseInventario />
              </ProtectedRoute>
            } />
            
            {/* Rotas do vendedor */}
            <Route path="/inventario" element={
              <ProtectedRoute allowedRoles={['vendedor']}>
                <Inventario />
              </ProtectedRoute>
            } />
            <Route path="/inventario/:inventarioId" element={
              <ProtectedRoute allowedRoles={['vendedor']}>
                <Inventario />
              </ProtectedRoute>
            } />
            <Route path="/historico" element={
              <ProtectedRoute allowedRoles={['vendedor']}>
                <Historico />
              </ProtectedRoute>
            } />
            
            {/* Rotas do gerente */}
            <Route path="/vendedores" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Vendedores />
              </ProtectedRoute>
            } />
            <Route path="/controle-vendedores" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <ControleVendedores />
              </ProtectedRoute>
            } />
            <Route path="/produtos" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Produtos />
              </ProtectedRoute>
            } />
            <Route path="/importar" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Importar />
              </ProtectedRoute>
            } />
            <Route path="/conferencia" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Conferencia />
              </ProtectedRoute>
            } />
            <Route path="/pedidos" element={
              <ProtectedRoute allowedRoles={['gerente']}>
                <Pedidos />
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ImportProvider>
  </AuthProvider>
);
export default App;
