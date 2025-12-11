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
  RefreshCw,
  UserCog,
  PackageSearch
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
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/estoque-teorico', icon: Package, label: 'Estoque' },
    { to: '/controle-vendedores', icon: ClipboardList, label: 'Controle de Vendedores' },
    { to: '/analise-inventario', icon: PackageSearch, label: 'Análise de Inventário' },
    { to: '/pedidos', icon: FileText, label: 'Gestão de Pedidos' },
    { to: '/movimentacoes', icon: RefreshCw, label: 'Movimentações' },
    { to: '/vendedores', icon: UserCog, label: 'Cadastro de Vendedores' },
    { to: '/produtos', icon: ShoppingCart, label: 'Produtos' },
    { to: '/importar', icon: Upload, label: 'Importar' },
    { to: '/conferencia', icon: ClipboardCheck, label: 'Conferência' },
  ];

  const links = isGerente ? gerenteLinks : vendedorLinks;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-foreground bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="md:hidden p-2 border-2 border-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-foreground flex items-center justify-center">
                <QrCode className="text-background" size={24} />
              </div>
              <span className="font-bold text-xl tracking-tight hidden sm:block">OPTISTOCK</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="font-medium text-sm">{profile?.nome}</p>
              <p className="text-xs text-muted-foreground uppercase">{profile?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut size={16} className="mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:block w-64 border-r-2 border-foreground min-h-[calc(100vh-4rem)] bg-card">
          <nav className="p-4 space-y-2">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-4 py-3 border-2 transition-all ${
                    isActive 
                      ? 'bg-foreground text-background border-foreground' 
                      : 'border-transparent hover:border-foreground'
                  }`}
                >
                  <link.icon size={20} />
                  <span className="font-medium">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-foreground/20" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r-2 border-foreground">
              <div className="p-4 border-b-2 border-foreground flex items-center justify-between">
                <span className="font-bold">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <nav className="p-4 space-y-2">
                {links.map((link) => {
                  const isActive = location.pathname === link.to;
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 border-2 transition-all ${
                        isActive 
                          ? 'bg-foreground text-background border-foreground' 
                          : 'border-transparent hover:border-foreground'
                      }`}
                    >
                      <link.icon size={20} />
                      <span className="font-medium">{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
