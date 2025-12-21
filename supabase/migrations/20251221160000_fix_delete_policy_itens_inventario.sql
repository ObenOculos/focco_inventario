-- Adiciona política para permitir que vendedores apaguem itens de seus inventários
CREATE POLICY "Vendedores can delete their itens_inventario" ON public.itens_inventario
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.inventarios i 
      WHERE i.id = itens_inventario.inventario_id 
      AND i.codigo_vendedor = public.get_user_codigo_vendedor(auth.uid())
    )
  );
