import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { queryClient } from '@/lib/queryClient';
import { Profile } from '@/types/app';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** true depois que uma busca de perfil terminou (com ou sem resultado). */
  profileLoaded: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    nome: string,
    role?: 'vendedor' | 'gerente'
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Remove na marra os tokens que o supabase-js guarda no localStorage.
 * Usado como rede de segurança quando o SDK não consegue limpar a sessão
 * sozinho — sem isso o autoRefreshToken ressuscita o usuário segundos depois
 * de ele ter clicado em "Sair".
 */
const clearStoredSession = () => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      localStorage.removeItem(key);
    }
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Cada troca de sessão recebe um número. Buscas de perfil em voo que
  // pertencem a uma sessão antiga são descartadas ao resolver — senão um
  // fetch lento reescreve o profile depois do logout.
  const sessionSeqRef = useRef(0);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    return !error && data ? (data as Profile) : null;
  };

  const refreshProfile = async () => {
    if (!user) return;

    const seq = sessionSeqRef.current;
    const data = await fetchProfile(user.id);
    if (sessionSeqRef.current !== seq) return;

    setProfileLoaded(true);
    if (data) setProfile(data);
  };

  useEffect(() => {
    let active = true;

    const applySession = (session: Session | null) => {
      const seq = ++sessionSeqRef.current;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Busca o perfil de forma adiada (evita deadlock dentro do
        // onAuthStateChange) e só libera o loading DEPOIS que o perfil/role
        // foi resolvido. Assim nenhum layout específico de papel é renderizado
        // antes de sabermos quem é o usuário — elimina o "flash" de layout.
        setTimeout(async () => {
          const data = await fetchProfile(session.user.id);
          if (!active || sessionSeqRef.current !== seq) return;

          setProfile(data);
          setProfileLoaded(true);
          setLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setProfileLoaded(false);
        setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) applySession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    nome: string,
    role: 'vendedor' | 'gerente' = 'vendedor'
  ) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { nome, role },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Invalida qualquer busca de perfil em voo e derruba o estado local antes
    // de falar com o servidor: o logout tem que valer mesmo se a chamada HTTP
    // falhar.
    sessionSeqRef.current++;
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileLoaded(false);
    setLoading(false);

    try {
      // 'local' encerra apenas esta sessão. O padrão ('global') revoga todas
      // as sessões do usuário e devolve 403 quando o refresh token já não é
      // mais aceito — e nesse caso a sessão local sobrevivia, fazendo o
      // gerente "voltar" logado alguns segundos depois.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch {
      clearStoredSession();
    }

    // Evita que dados do usuário anterior apareçam para quem logar depois.
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        profileLoaded,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
