-- 1) FIX: itens_pedido SELECT — restrict to owner vendedor or gerente
DROP POLICY IF EXISTS "Users can view itens_pedido" ON public.itens_pedido;

CREATE POLICY "Vendedores can view their own itens_pedido"
ON public.itens_pedido
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = itens_pedido.pedido_id
      AND (
        p.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
        OR public.get_user_role(auth.uid()) = 'gerente'::user_role
      )
  )
);

-- 2) FIX: estoque_real — replace unverified JWT claim with profile lookup
DROP POLICY IF EXISTS "Vendedores podem ver seu próprio estoque real" ON public.estoque_real;
DROP POLICY IF EXISTS "Vendedores podem inserir seu próprio estoque real" ON public.estoque_real;
DROP POLICY IF EXISTS "Vendedores podem atualizar seu próprio estoque real" ON public.estoque_real;

CREATE POLICY "Vendedores podem ver seu próprio estoque real"
ON public.estoque_real
FOR SELECT
TO authenticated
USING (codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()));

CREATE POLICY "Vendedores podem inserir seu próprio estoque real"
ON public.estoque_real
FOR INSERT
TO authenticated
WITH CHECK (codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()));

CREATE POLICY "Vendedores podem atualizar seu próprio estoque real"
ON public.estoque_real
FOR UPDATE
TO authenticated
USING (codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()))
WITH CHECK (codigo_vendedor = public.get_user_codigo_vendedor(auth.uid()));

-- 3) FIX: Realtime — restrict channel subscriptions to authenticated users only
-- (default-deny + minimal allow; tables not needing realtime stay blocked)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send broadcasts" ON realtime.messages;

CREATE POLICY "Authenticated users can receive broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can send broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);