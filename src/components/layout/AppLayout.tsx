import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  Database,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
  /**
   * Esconde a barra inferior do mobile e devolve o rodapé para a tela.
   *
   * Existe para a contagem de inventário, que é trabalho contínuo com uma barra própria
   * de captura fixa embaixo. Empilhar as duas gastava 12rem de tela de celular em
   * navegação que o vendedor não usa enquanto bipa — e ainda deixava os dois conjuntos
   * de botões disputando o alcance do polegar. A gaveta do cabeçalho continua sendo a
   * saída, então nada fica inacessível.
   */
  semBarraInferior?: boolean;
}

const SIDEBAR_STORAGE_KEY = 'sidebar_colapsada';

/**
 * Estado recolhido/expandido do menu, preservado entre sessões.
 *
 * A leitura acontece no inicializador do `useState` — e não num `useEffect` — para o menu
 * já nascer na largura certa. Lido por efeito, ele apareceria expandido no primeiro quadro
 * e encolheria em seguida, piscando a cada navegação.
 *
 * `localStorage` pode lançar (modo privativo, cookies bloqueados); nesse caso o menu apenas
 * deixa de lembrar a preferência.
 *
 * Nota de UX: a expansão é por CLIQUE, nunca por hover. Menu que abre ao passar o mouse
 * dispara sozinho quando o cursor cruza a tela, não existe em toque, e sobrepõe conteúdo
 * sem intenção do usuário.
 */
function useSidebarColapsada(): [boolean, () => void] {
  const [colapsada, setColapsada] = useState<boolean>(() => {
    try {
      // Recolhido é o padrão: a régua de ícones devolve 200px de largura ao conteúdo, e
      // quem prefere os rótulos expande uma vez — a escolha fica salva. Note que o teste
      // é contra `'false'`, não a favor de `'true'`: sem valor guardado o padrão vale, e
      // só a decisão explícita de expandir sobrepõe.
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
    } catch {
      return true;
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

interface NavLink {
  to: string;
  icon: LucideIcon;
  label: string;
}

const VENDEDOR_LINKS: NavLink[] = [
  { to: '/inventario', icon: ClipboardList, label: 'Inventário' },
  { to: '/historico', icon: History, label: 'Histórico' },
];

const GERENTE_LINKS: NavLink[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/conferencia', icon: ClipboardCheck, label: 'Conferência' },
  { to: '/comparar-inventarios', icon: GitCompare, label: 'Comparar Inventários' },
  { to: '/consulta-erp', icon: Database, label: 'Consulta ao ERP' },
  { to: '/exportar-xml', icon: FileCode, label: 'Exportar XML' },
  { to: '/vendedores', icon: UserCog, label: 'Vendedores' },
  { to: '/produtos', icon: ShoppingCart, label: 'Produtos & Correções' },
];

/** Item de navegação. Recolhido, o rótulo vira tooltip e vira `aria-label`. */
function ItemNav({
  link,
  ativo,
  colapsada,
  onNavigate,
}: {
  link: NavLink;
  ativo: boolean;
  colapsada: boolean;
  onNavigate?: () => void;
}) {
  const item = (
    <Link
      to={link.to}
      onClick={onNavigate}
      aria-current={ativo ? 'page' : undefined}
      // O tooltip do Radix é dica visual e não substitui nome acessível — daí o aria-label
      // quando o texto some da tela.
      aria-label={colapsada ? link.label : undefined}
      className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
        colapsada ? 'justify-center px-0 py-2.5' : 'gap-3 px-3.5 py-2.5'
      } ${
        ativo
          ? 'bg-sidebar-active text-sidebar-active-foreground font-semibold shadow-xs'
          : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground'
      }`}
    >
      <link.icon size={18} className="shrink-0" />
      {/* `min-w-0` permite o rótulo encolher com reticências durante a animação de
          largura; sem ele o texto empurra a caixa em vez de cortar. */}
      {!colapsada && <span className="truncate min-w-0">{link.label}</span>}
    </Link>
  );

  // Expandido o rótulo já está na tela; tooltip ali seria ruído.
  return colapsada ? (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">{link.label}</TooltipContent>
    </Tooltip>
  ) : (
    item
  );
}

/** Bloco de identidade + logout, no rodapé do menu. */
function RodapePerfil({
  nome,
  papel,
  colapsada,
  onSignOut,
}: {
  nome?: string;
  papel?: string;
  colapsada: boolean;
  onSignOut: () => void;
}) {
  const inicial = nome?.trim().charAt(0).toUpperCase() || '?';

  const avatar = (
    <div
      className={`flex items-center rounded-xl ${colapsada ? 'justify-center' : 'gap-3 px-2 py-1.5'}`}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
        aria-hidden
      >
        {inicial}
      </div>
      {!colapsada && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{nome}</p>
          <p className="truncate text-2xs uppercase tracking-wider text-sidebar-muted">{papel}</p>
        </div>
      )}
    </div>
  );

  const sair = (
    <button
      onClick={onSignOut}
      aria-label="Sair"
      className={`flex w-full items-center rounded-xl py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${
        colapsada ? 'justify-center px-0' : 'gap-3 px-3.5'
      }`}
    >
      <LogOut size={18} className="shrink-0" />
      {!colapsada && <span>Sair</span>}
    </button>
  );

  return (
    <div className="space-y-1 border-t border-sidebar-border p-3">
      {colapsada ? (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <div>{avatar}</div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {nome} · {papel}
          </TooltipContent>
        </Tooltip>
      ) : (
        avatar
      )}
      {colapsada ? (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>{sair}</TooltipTrigger>
          <TooltipContent side="right">Sair</TooltipContent>
        </Tooltip>
      ) : (
        sair
      )}
    </div>
  );
}

/**
 * Layout da aplicação.
 *
 * **Uma única superfície de navegação.** O menu lateral é dono da marca (topo), dos módulos
 * (meio) e da identidade do usuário com o logout (rodapé). O cabeçalho fixo do desktop foi
 * removido: ele consumia 64px de altura permanente para exibir logo, nome e um botão, e
 * obrigava o usuário a olhar para dois cantos da tela para navegar.
 *
 * No mobile o cabeçalho permanece — é onde vive o gatilho da gaveta — e a barra inferior
 * continua sendo o atalho para os módulos mais usados.
 */
export function AppLayout({ children, semBarraInferior = false }: AppLayoutProps) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [colapsada, alternarSidebar] = useSidebarColapsada();

  const isGerente = profile?.role === 'gerente';

  // Sem perfil carregado não assumimos papel nenhum: cair no menu de vendedor por omissão
  // fazia o layout do gerente "virar" vendedor durante o logout.
  const links = profile ? (isGerente ? GERENTE_LINKS : VENDEDOR_LINKS) : [];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  const marca = (
    <Link
      to={isGerente ? '/dashboard' : '/inventario'}
      className={`flex items-center ${colapsada ? 'justify-center' : 'gap-3 px-1.5'}`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-xs">
        <QrCode className="text-primary-foreground" size={20} />
      </div>
      {!colapsada && (
        <span className="truncate text-lg font-bold tracking-tight text-sidebar-foreground">
          OPTISTOCK
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Cabeçalho — só no mobile, onde a gaveta precisa de gatilho */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md md:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <button
            className="rounded-xl border border-border p-2 transition-colors hover:bg-accent"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link to={isGerente ? '/dashboard' : '/inventario'} className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary">
              <QrCode className="text-primary-foreground" size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight">OPTISTOCK</span>
          </Link>
        </div>
      </header>

      {/* No mobile o cabeçalho de 4rem fica acima deste bloco; sem descontá-lo a página
          teria sempre 4rem de rolagem sobrando. No desktop não há cabeçalho. */}
      <div className="flex min-h-[calc(100vh-4rem)] md:min-h-screen">
        {/*
          Menu flutuante: o `aside` só reserva a calha (`p-3`), e a superfície escura mora
          num filho arredondado. `sticky top-0` + `h-screen` + `self-start` prendem o menu
          sem tirá-lo do fluxo — assim o <main> recebe a largura restante sozinho, sem
          margem de compensação.

          `overflow-x-hidden` é obrigatório junto de `overflow-y-auto`: sem ele o CSS
          promove overflow-x a `auto`, e ao expandir os rótulos remontam na largura cheia
          enquanto a caixa ainda está estreita — piscava uma barra de rolagem no rodapé.
        */}
        {/* As larguras são do `aside`, e o `p-3` desconta 24px: 6rem → régua de 72px,
            17rem → painel de 248px. Alterar uma sem a outra estreita o painel. */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 self-start p-3 transition-[width] duration-200 ease-out md:block ${
            colapsada ? 'w-24' : 'w-[17rem]'
          }`}
        >
          {/* Borda além da sombra: no tema claro o painel é branco sobre um fundo de 97%
              de luminância, e só a sombra não fecha a silhueta. */}
          <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-sidebar-border bg-sidebar shadow-lg">
            <div className="p-3 pt-4">{marca}</div>

            <nav className="flex-1 space-y-1.5 p-3">
              {links.map((link) => (
                <ItemNav
                  key={link.to}
                  link={link}
                  ativo={location.pathname === link.to}
                  colapsada={colapsada}
                />
              ))}
            </nav>

            <div className="px-3 pb-1">
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    onClick={alternarSidebar}
                    aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
                    aria-expanded={!colapsada}
                    className={`flex w-full items-center rounded-xl py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${
                      colapsada ? 'justify-center px-0' : 'gap-3 px-3.5'
                    }`}
                  >
                    {colapsada ? (
                      <PanelLeftOpen size={18} className="shrink-0" />
                    ) : (
                      <PanelLeftClose size={18} className="shrink-0" />
                    )}
                    {!colapsada && <span>Recolher menu</span>}
                  </button>
                </TooltipTrigger>
                {colapsada && <TooltipContent side="right">Expandir menu</TooltipContent>}
              </Tooltip>
            </div>

            <RodapePerfil
              nome={profile?.nome}
              papel={profile?.role}
              colapsada={colapsada}
              onSignOut={handleSignOut}
            />
          </div>
        </aside>

        {/* Gaveta do mobile */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-0 flex h-full w-[17rem] flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
              <div className="flex shrink-0 items-center justify-between p-4">
                {marca}
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="Fechar menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Rola quando a tela é curta — celular na horizontal, por exemplo */}
              <nav className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-3">
                {links.map((link) => (
                  <ItemNav
                    key={link.to}
                    link={link}
                    ativo={location.pathname === link.to}
                    colapsada={false}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                ))}
              </nav>

              <RodapePerfil
                nome={profile?.nome}
                papel={profile?.role}
                colapsada={false}
                onSignOut={handleSignOut}
              />
            </aside>
          </div>
        )}

        {/* Calha de 36px entre menu e conteúdo: 12px do `p-3` do aside + 24px daqui.
            Assimetria proposital — a separação da navegação vale mais que a da borda da
            página, e com 24px o conteúdo encostava no painel. */}
        <main
          className={`min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 md:pb-6 md:pl-6 ${
            // A folga de 5rem só existe para a barra inferior não cobrir o conteúdo. Sem
            // barra, ela viraria rolagem sobrando no fim de toda página.
            semBarraInferior ? 'pb-[env(safe-area-inset-bottom)]' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Barra inferior do mobile */}
      {links.length > 0 && !semBarraInferior && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/80 bg-card/95 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md md:hidden">
          {links.slice(0, isGerente ? 4 : 2).map((link) => {
            const ativo = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={ativo ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1 transition-all ${
                  ativo ? 'font-bold text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <link.icon
                  size={20}
                  className={ativo ? 'scale-110 transition-transform' : undefined}
                />
                <span className="text-2xs font-semibold tracking-tight">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
