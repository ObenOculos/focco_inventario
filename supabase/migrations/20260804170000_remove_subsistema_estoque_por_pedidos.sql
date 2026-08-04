-- Remove o subsistema de estoque derivado de pedidos/ERP.
--
-- Contexto: o app foi reduzido a registrar inventários, guardar o histórico, comparar dois
-- inventários sob demanda e exportar em XML. O "estoque teórico" calculado a partir de
-- pedidos deixou de existir como conceito.
--
-- As tabelas `pedidos` e `itens_pedido` estavam VAZIAS em produção (0 linhas), então as
-- funções que somavam entradas e saídas já retornavam vazio. `estoque_real` tinha 13.407
-- linhas, todas snapshots gravados na aprovação de inventários — e verificadamente idênticas
-- às contagens em `itens_inventario`, que continuam sendo a fonte real.
--
-- Backups tomados antes desta migration, fora do repositório:
--   legado_pedidos_estoque_real_20260804.sql        (dados das 3 tabelas)
--   inventarios_e_itens_antes_do_juntar_20260804.sql
--
-- Nenhum DROP usa CASCADE de propósito: se algo ainda depender destes objetos, a migration
-- falha e mostra o quê, em vez de derrubar silenciosamente uma dependência não prevista.
--
-- Verificado antes de escrever: nenhuma view no schema public; o único FK de entrada é
-- itens_pedido -> pedidos (ambas removidas); e todas as policies que mencionam estas tabelas
-- estão nelas próprias, portanto saem junto.

-- ─── 1. Funções que leem as tabelas removidas ────────────────────────────────
-- Precisam sair antes das tabelas.

-- Comparação antiga da Conferência, substituída por comparar_dois_inventarios()
DROP FUNCTION IF EXISTS public.comparar_estoque_inventario_paginado(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.comparar_estoque_inventario(uuid);

-- Estoque teórico por vendedor
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor_paginado(text, integer, integer);
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor_ate_data(text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.calcular_estoque_vendedor(text);
DROP FUNCTION IF EXISTS public.calcular_estoque_teorico_pos_inventario(text);

-- Teórico vs real
DROP FUNCTION IF EXISTS public.comparar_estoque_teorico_vs_real_paginado(text, integer, integer);
DROP FUNCTION IF EXISTS public.comparar_estoque_teorico_vs_real(text);

-- Movimentações a partir de pedidos
DROP FUNCTION IF EXISTS public.get_entradas_pedidos_paginado(text, timestamp with time zone, timestamp with time zone, integer, integer);
DROP FUNCTION IF EXISTS public.get_entradas_pedidos(text, timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_saidas_pedidos_paginado(text, timestamp with time zone, timestamp with time zone, integer, integer);
DROP FUNCTION IF EXISTS public.get_saidas_pedidos(text, timestamp with time zone, timestamp with time zone);

-- Leitura do snapshot de estoque real
DROP FUNCTION IF EXISTS public.get_estoque_real_vendedor(text);

-- ─── 2. Tabelas ──────────────────────────────────────────────────────────────
-- itens_pedido antes de pedidos, por causa do FK itens_pedido_pedido_id_fkey.
-- As policies RLS e o trigger trigger_estoque_real_updated_at saem junto com as tabelas.

DROP TABLE IF EXISTS public.itens_pedido;
DROP TABLE IF EXISTS public.pedidos;
DROP TABLE IF EXISTS public.estoque_real;

-- ─── 3. Função de trigger que ficou órfã ─────────────────────────────────────
-- `handle_updated_at` era usada exclusivamente pelo trigger de estoque_real. As demais
-- tabelas (inventarios, produtos, profiles) usam `update_updated_at`, que permanece.

DROP FUNCTION IF EXISTS public.handle_updated_at();

-- ─── 4. Conferência final ────────────────────────────────────────────────────

DO $$
DECLARE
  v_tabelas integer;
  v_funcoes integer;
BEGIN
  SELECT count(*) INTO v_tabelas
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('pedidos', 'itens_pedido', 'estoque_real');

  IF v_tabelas > 0 THEN
    RAISE EXCEPTION 'Ainda existem % tabela(s) do subsistema removido', v_tabelas;
  END IF;

  SELECT count(*) INTO v_funcoes
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'comparar_estoque_inventario', 'comparar_estoque_inventario_paginado',
      'calcular_estoque_vendedor', 'calcular_estoque_vendedor_ate_data',
      'calcular_estoque_vendedor_paginado', 'calcular_estoque_teorico_pos_inventario',
      'comparar_estoque_teorico_vs_real', 'comparar_estoque_teorico_vs_real_paginado',
      'get_entradas_pedidos', 'get_entradas_pedidos_paginado',
      'get_saidas_pedidos', 'get_saidas_pedidos_paginado',
      'get_estoque_real_vendedor', 'handle_updated_at'
    );

  IF v_funcoes > 0 THEN
    RAISE EXCEPTION 'Ainda existem % função(ões) do subsistema removido', v_funcoes;
  END IF;

  -- Estas são usadas nas policies RLS das tabelas que ficam: se saírem por engano, o acesso
  -- de vendedor ao próprio inventário quebra sem erro visível.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_role'
  ) THEN
    RAISE EXCEPTION 'get_user_role desapareceu — as policies RLS dependem dela';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_codigo_vendedor'
  ) THEN
    RAISE EXCEPTION 'get_user_codigo_vendedor desapareceu — as policies RLS dependem dela';
  END IF;

  RAISE NOTICE 'Subsistema de estoque por pedidos removido. get_user_role e get_user_codigo_vendedor intactas.';
END $$;
