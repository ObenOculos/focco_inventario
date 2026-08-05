import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  ClipboardList,
  LogOut,
  Menu,
  X,
  QrCode,
  ShoppingCart,
  ClipboardCheck,
  History,
  FileCode,
  GitCompare,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

const SIDEBAR_STORAGE_KEY = 'sidebar_colapsada';

/**
 * Estado recolhido/expandido do menu lateral, preservado entre sessões.
 *
 * A leitura é feita no inicializador do `useState` — e não num `useEffect` — para a sidebar
 * já nascer na largura certa. Lida por efeito, ela apareceria expandida no primeiro quadro e
 * encolheria logo depois, o que pisca a cada carregamento de página.
 *
 * `localStorage` pode lançar (modo privativo, cookies bloqueados); nesse caso o menu apenas
 * deixa de lembrar a preferência, sem quebrar o layout.
 */
function useSidebarColapsada(): [boolean, () => void] {
  const [colapsada, setColapsada] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(colapsada));
    } catch {
      /* preferência não persistida; comportamento na sessão continua correto */
    }
  }, [colapsada]);

  return [colapsada, () => setColapsada((v) => !v)];
}

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarColapsada, alternarSidebar] = useSidebarColapsada();

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
    { to: '/comparar-inventarios', icon: GitCompare, label: 'Comparar Inventários' },
    { to: '/exportar-xml', icon: FileCode, label: 'Exportar XML' },
    // Vendedores
    { to: '/vendedores', icon: UserCog, label: 'Vendedores' },
    // Dados
    { to: '/produtos', icon: ShoppingCart, label: 'Produtos & Correções' },
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

      {/* min-h no container para a sidebar ocupar a altura toda mesmo em páginas curtas */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        {/*
          Sidebar fixa via `sticky`, não `fixed`: assim ela continua no fluxo do flex e o
          <main> recebe a largura restante sozinho, sem precisar compensar com margem.
          `self-start` é essencial — sem ele o item de flex esticaria até a altura do
          container (align-items: stretch) e não sobraria deslocamento para grudar.
          `top-16` alinha logo abaixo do header, que tem h-16 e também é sticky.
        */}
        <aside
          /*
            `overflow-x-hidden` é obrigatório junto com `overflow-y-auto`: sem ele o CSS
            resolve overflow-x para `auto`, e ao expandir os rótulos remontam na largura
            cheia enquanto a caixa ainda está estreita — o excesso momentâneo fazia piscar
            uma barra de rolagem horizontal no rodapé do menu.
          */
          className={`hidden md:flex md:flex-col shrink-0 border-r border-border bg-card/40 sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden overscroll-contain transition-[width] duration-200 ease-out ${
            sidebarColapsada ? 'w-[4.5rem]' : 'w-72'
          }`}
        >
          <nav className="p-3 space-y-1.5">
            {links.map((link) => {
              const isActive = location.pathname === link.to;
              const item = (
                <Link
                  key={link.to}
                  to={link.to}
                  // Recolhido, o texto acessível some junto com o rótulo visível — daí o
                  // aria-label. O tooltip do Radix é dica visual, não substitui nome acessível.
                  aria-label={sidebarColapsada ? link.label : undefined}
                  className={`flex items-center rounded-xl transition-colors text-sm font-medium ${
                    sidebarColapsada ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
                  } ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                  }`}
                >
                  <link.icon
                    size={18}
                    className={`shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                  />
                  {/* `min-w-0` faz o rótulo encolher com reticências durante a animação;
                      sem ele o texto empurra a largura em vez de cortar. */}
                  {!sidebarColapsada && <span className="truncate min-w-0">{link.label}</span>}
                </Link>
              );

              // Expandido o rótulo já está na tela; tooltip ali seria ruído.
              return sidebarColapsada ? (
                <Tooltip key={link.to} delayDuration={200}>
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right">{link.label}</TooltipContent>
                </Tooltip>
              ) : (
                item
              );
            })}
          </nav>

          {/* `mt-auto` prende o controle ao rodapé da sidebar, longe dos itens de navegação */}
          <div className="mt-auto p-3 border-t border-border/60">
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={alternarSidebar}
                  aria-label={sidebarColapsada ? 'Expandir menu' : 'Recolher menu'}
                  aria-expanded={!sidebarColapsada}
                  className={`flex items-center w-full rounded-xl py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors ${
                    sidebarColapsada ? 'justify-center px-0' : 'gap-3 px-3.5'
                  }`}
                >
                  {sidebarColapsada ? (
                    <PanelLeftOpen size={18} className="shrink-0" />
                  ) : (
                    <PanelLeftClose size={18} className="shrink-0" />
                  )}
                  {!sidebarColapsada && (
                    <span className="truncate min-w-0">Recolher menu</span>
                  )}
                </button>
              </TooltipTrigger>
              {sidebarColapsada && <TooltipContent side="right">Expandir menu</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-72 bg-card border-r border-border shadow-xl flex flex-col">
              <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                <span className="font-bold text-sm tracking-wide">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-md hover:bg-accent">
                  <X size={20} />
                </button>
              </div>
              {/* Rola quando a tela é curta — celular na horizontal, por exemplo */}
              <nav className="p-3 space-y-1.5 overflow-y-auto overscroll-contain">
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
