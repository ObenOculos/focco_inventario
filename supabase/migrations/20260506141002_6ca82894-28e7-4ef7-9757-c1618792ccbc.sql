-- 1. Fix privilege escalation on signup: never trust role from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', NEW.email),
    'vendedor'  -- always vendedor; gerentes are promoted manually
  );
  RETURN NEW;
END;
$$;

-- 2. Restrict get_user_role: only return role for the caller themselves.
--    All RLS policies call this with auth.uid(), so behavior is preserved.
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = user_id
    AND user_id = auth.uid()
$$;

-- 3. Restrict get_user_codigo_vendedor identically
CREATE OR REPLACE FUNCTION public.get_user_codigo_vendedor(user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT codigo_vendedor
  FROM public.profiles
  WHERE id = user_id
    AND user_id = auth.uid()
$$;

-- 4. Revoke direct execution from anon (still callable internally by RLS as definer)
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_codigo_vendedor(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_codigo_vendedor(uuid) TO authenticated;

-- 5. Add UPDATE policy for vendedores on itens_inventario (only pending inventories)
CREATE POLICY "Vendedores can update their itens_inventario"
ON public.itens_inventario
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventarios i
    WHERE i.id = itens_inventario.inventario_id
      AND i.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
      AND i.status = 'pendente'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventarios i
    WHERE i.id = itens_inventario.inventario_id
      AND i.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
      AND i.status = 'pendente'
  )
);

-- 6. Fix mutable search_path on handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;