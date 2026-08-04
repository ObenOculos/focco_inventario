import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  FileSpreadsheet,
  LogOut,
  Menu,
  X,
  QrCode,
  ShoppingCart,
  Upload,
  ClipboardCheck,
  History,
  FileText,
  FileCode,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isGerente = profile?.role === 'gerente';

  const vendedorLinks = [
    { to: '/inventario', icon: ClipboardList, label: 'Inventário' },
    { to: '/historico', icon: History, label: 'Histórico' },
  ];

  const gerenteLinks = [
    // Visão geral
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    // Ações de inventário
    { to: '/conferencia', icon: ClipboardCheck, label: 'Conferência' },
    
    // Estoque
    { to: '/estoque-teorico', icon: Package, label: 'Estoque ERP' },
    { to: '/historico-estoque-real', icon: History, label: 'Hist. de Inventários' },
    // Vendedores
    { to: '/controle-vendedores', icon: ClipboardList, label: 'Painel de Vendedores' },
    { to: '/vendedores', icon: UserCog, label: 'Cadastro de Vendedores' },
    // Dados
    { to: '/pedidos', icon: FileText, label: 'Pedidos & Notas' },
    { to: '/produtos', icon: ShoppingCart, label: 'Produtos & Correções' },
    { to: '/importar', icon: Upload, label: 'Importar' },
    { to: '/exportar-xml', icon: FileCode, label: 'Exportar XML' },
  ];

  // Sem perfil carregado não assumimos papel nenhum: cair no menu de vendedor
  // por omissão fazia o layout do gerente "virar" vendedor durante o logout.
  const links = profile ? (isGerente ? gerenteLinks : vendedorLinks) : [];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden p-2 rounded-lg border border-border hover:bg-accent transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                <QrCode className="text-primary-foreground" size={20} />
              </div>
              <span className="font-bold text-xl tracking-tight hidden sm:block">OPTISTOCK</span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="font-medium text-sm">{profile?.nome}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{profile?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="rounded-lg shadow-xs">
              <LogOut size={16} className="mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:block w-64 border-r border-border min-h-[calc(100vh-4rem)] bg-card/40">
          <nav className="p-3 space-y-1.5">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-medium ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  }`}
                >
                  <link.icon size={18} className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r border-border shadow-xl">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <span className="font-bold text-sm tracking-wide">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-md hover:bg-accent">
                  <X size={20} />
                </button>
              </div>
              <nav className="p-3 space-y-1.5">
                {links.map((link) => {
                  const isActive = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-medium ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                      }`}
                    >
                      <link.icon size={18} className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'} />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {links.length > 0 && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 px-2 py-2 flex items-center justify-around pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg">
          {links.slice(0, isGerente ? 4 : 2).map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  isActive ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <link.icon size={20} className={isActive ? 'text-primary scale-110 transition-transform' : ''} />
                <span className="text-[10px] font-semibold tracking-tight">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
