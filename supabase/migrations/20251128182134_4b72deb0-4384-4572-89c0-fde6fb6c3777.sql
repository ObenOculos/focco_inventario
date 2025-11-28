-- Enum para tipos de usuário
CREATE TYPE public.user_role AS ENUM ('vendedor', 'gerente');

-- Enum para status de inventário
CREATE TYPE public.inventory_status AS ENUM ('pendente', 'aprovado', 'revisao');

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT NOT NULL,
  codigo_vendedor TEXT UNIQUE,
  telefone TEXT,
  role user_role NOT NULL DEFAULT 'vendedor',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de produtos
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_produto TEXT NOT NULL,
  codigo_auxiliar TEXT NOT NULL UNIQUE,
  nome_produto TEXT NOT NULL,
  modelo TEXT NOT NULL,
  cor TEXT NOT NULL,
  valor_produto DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de pedidos
CREATE TABLE public.pedidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_pedido TEXT NOT NULL,
  data_emissao TIMESTAMPTZ NOT NULL,
  codigo_cliente TEXT,
  codigo_vendedor TEXT NOT NULL,
  nome_vendedor TEXT,
  valor_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  codigo_tipo INTEGER NOT NULL,
  situacao TEXT DEFAULT 'N',
  numero_nota_fiscal TEXT,
  serie_nota_fiscal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de itens do pedido
CREATE TABLE public.itens_pedido (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  codigo_auxiliar TEXT NOT NULL,
  nome_produto TEXT NOT NULL,
  quantidade DECIMAL(10,5) NOT NULL DEFAULT 0,
  valor_produto DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de inventários
CREATE TABLE public.inventarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_vendedor TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  data_inventario TIMESTAMPTZ NOT NULL DEFAULT now(),
  status inventory_status NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  observacoes_gerente TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de itens do inventário
CREATE TABLE public.itens_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID NOT NULL REFERENCES public.inventarios(id) ON DELETE CASCADE,
  codigo_auxiliar TEXT NOT NULL,
  nome_produto TEXT,
  quantidade_fisica DECIMAL(10,5) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_pedidos_codigo_vendedor ON public.pedidos(codigo_vendedor);
CREATE INDEX idx_pedidos_codigo_tipo ON public.pedidos(codigo_tipo);
CREATE INDEX idx_itens_pedido_codigo_auxiliar ON public.itens_pedido(codigo_auxiliar);
CREATE INDEX idx_inventarios_codigo_vendedor ON public.inventarios(codigo_vendedor);
CREATE INDEX idx_inventarios_status ON public.inventarios(status);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_inventario ENABLE ROW LEVEL SECURITY;

-- Function to check user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id
$$;

-- Function to get user codigo_vendedor
CREATE OR REPLACE FUNCTION public.get_user_codigo_vendedor(user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT codigo_vendedor FROM public.profiles WHERE id = user_id
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Gerentes can view all profiles" ON public.profiles
  FOR SELECT USING (public.get_user_role(auth.uid()) = 'gerente');

CREATE POLICY "Gerentes can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'gerente');

CREATE POLICY "Gerentes can update profiles" ON public.profiles
  FOR UPDATE USING (public.get_user_role(auth.uid()) = 'gerente');

-- Produtos policies
CREATE POLICY "Everyone can view produtos" ON public.produtos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerentes can manage produtos" ON public.produtos
  FOR ALL USING (public.get_user_role(auth.uid()) = 'gerente');

-- Pedidos policies
CREATE POLICY "Vendedores can view their pedidos" ON public.pedidos
  FOR SELECT USING (
    codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()) OR
    public.get_user_role(auth.uid()) = 'gerente'
  );

CREATE POLICY "Gerentes can manage pedidos" ON public.pedidos
  FOR ALL USING (public.get_user_role(auth.uid()) = 'gerente');

-- Itens pedido policies
CREATE POLICY "Users can view itens_pedido" ON public.itens_pedido
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gerentes can manage itens_pedido" ON public.itens_pedido
  FOR ALL USING (public.get_user_role(auth.uid()) = 'gerente');

-- Inventarios policies
CREATE POLICY "Vendedores can view their inventarios" ON public.inventarios
  FOR SELECT USING (
    codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()) OR
    public.get_user_role(auth.uid()) = 'gerente'
  );

CREATE POLICY "Vendedores can create their inventarios" ON public.inventarios
  FOR INSERT WITH CHECK (
    codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()) AND
    user_id = auth.uid()
  );

CREATE POLICY "Gerentes can manage all inventarios" ON public.inventarios
  FOR ALL USING (public.get_user_role(auth.uid()) = 'gerente');

CREATE POLICY "Vendedores can update their pending inventarios" ON public.inventarios
  FOR UPDATE USING (
    codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()) AND
    status = 'pendente'
  );

-- Itens inventario policies
CREATE POLICY "Users can view itens_inventario" ON public.itens_inventario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendedores can insert their itens_inventario" ON public.itens_inventario
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventarios i 
      WHERE i.id = inventario_id 
      AND i.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
    )
  );

CREATE POLICY "Gerentes can manage itens_inventario" ON public.itens_inventario
  FOR ALL USING (public.get_user_role(auth.uid()) = 'gerente');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_inventarios_updated_at
  BEFORE UPDATE ON public.inventarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::user_role, 'vendedor')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();