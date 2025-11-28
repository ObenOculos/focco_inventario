import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Inventario from "./pages/Inventario";
import Historico from "./pages/Historico";
import Vendedores from "./pages/Vendedores";
import Produtos from "./pages/Produtos";
import Importar from "./pages/Importar";
import Conferencia from "./pages/Conferencia";
import Pedidos from "./pages/Pedidos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Rotas protegidas para todos */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            
            {/* Rotas do vendedor */}
            <Route path="/inventario" element={
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
              <ProtectedRoute>
                <Pedidos />
              </ProtectedRoute>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
