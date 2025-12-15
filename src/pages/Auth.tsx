import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { QrCode, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const validated = loginSchema.parse({ email, password });
        const { error } = await signIn(validated.email, validated.password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Email ou senha incorretos');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Login realizado com sucesso!');
          navigate('/dashboard');
        }
      } else {
        const validated = signupSchema.parse({ email, password, nome });
        const { error } = await signUp(validated.email, validated.password, validated.nome, 'vendedor');
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email já está cadastrado');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Conta criada! Verifique seu email para confirmar.');
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-foreground flex items-center justify-center mb-4">
            <QrCode className="text-background" size={48} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">OPTISTOCK</h1>
          <p className="text-muted-foreground mt-2">Controle de Estoque para Óculos</p>
        </div>

        {/* Form */}
        <div className="border-2 border-foreground bg-card p-6 shadow-md">
          <div className="flex mb-6">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-3 font-medium border-2 border-r-0 transition-all ${
                isLogin 
                  ? 'bg-foreground text-background border-foreground' 
                  : 'border-foreground hover:bg-secondary'
              }`}
            >
              ENTRAR
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-3 font-medium border-2 transition-all ${
                !isLogin 
                  ? 'bg-foreground text-background border-foreground' 
                  : 'border-foreground hover:bg-secondary'
              }`}
            >
              CADASTRAR
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <Label htmlFor="nome" className="font-medium">Nome</Label>
                <Input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 border-2"
                  placeholder="Seu nome completo"
                  required={!isLogin}
                />
              </div>
            )}

            <div>
              <Label htmlFor="email" className="font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 border-2"
                placeholder="seu@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="font-medium">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 border-2 pr-10"
                  placeholder="••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full mt-6" 
              disabled={loading}
            >
              {loading ? 'Aguarde...' : isLogin ? 'ENTRAR' : 'CRIAR CONTA'}
            </Button>
          </form>

          {!isLogin && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Novos cadastros serão criados como vendedores.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
