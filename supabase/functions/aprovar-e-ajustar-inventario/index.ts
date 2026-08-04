import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: Aprovar Inventário
 *
 * Fluxo:
 * 1. Valida autenticação
 * 2. Valida permissão (apenas gerentes)
 * 3. Verifica que o inventário está pendente ou em revisão
 * 4. Atualiza status para 'aprovado'
 *
 * A aprovação não calcula divergência nem grava estoque derivado. A comparação entre
 * inventários é funcionalidade independente (comparar_dois_inventarios), acionada quando o
 * usuário quiser, e não participa deste fluxo.
 *
 * O nome da função mantém o sufixo "-e-ajustar" por compatibilidade com a URL já
 * implantada e com o cliente que a invoca; não há mais ajuste nenhum aqui.
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { inventario_id } = body;

    if (!inventario_id || typeof inventario_id !== 'string') {
      throw new Error('ID do inventário é obrigatório.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token não fornecido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas gerentes.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { data: inventario, error: inventarioError } = await supabaseAdmin
      .from('inventarios')
      .select('status, codigo_vendedor')
      .eq('id', inventario_id)
      .single();

    if (inventarioError || !inventario) {
      throw new Error('Inventário não encontrado.');
    }

    if (!['pendente', 'revisao'].includes(inventario.status)) {
      throw new Error(`Inventário já processado (status: ${inventario.status}).`);
    }

    // Um inventário sem itens contados não deveria ser aprovado: a contagem é o conteúdo
    // do inventário. Antes esta checagem existia de forma indireta, ao falhar na escrita do
    // estoque derivado; agora é explícita.
    const { count: totalItens, error: countError } = await supabaseAdmin
      .from('itens_inventario')
      .select('id', { count: 'exact', head: true })
      .eq('inventario_id', inventario_id);

    if (countError) {
      console.error('[ERROR] Erro ao contar itens do inventário:', countError);
      throw new Error('Falha ao verificar os itens do inventário.');
    }

    if (!totalItens || totalItens === 0) {
      throw new Error('Inventário sem itens contados: nada a aprovar.');
    }

    const { error: updateError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'aprovado', updated_at: new Date().toISOString() })
      .eq('id', inventario_id);

    if (updateError) {
      console.error('[ERROR] Erro ao aprovar inventário:', updateError);
      throw new Error('Falha ao aprovar inventário.');
    }

    console.log(
      `[INFO] Inventário ${inventario_id} do vendedor ${inventario.codigo_vendedor} aprovado (${totalItens} itens).`
    );

    return new Response(
      JSON.stringify({
        message: `Inventário aprovado! ${totalItens} item(ns) registrados.`,
        total_itens: totalItens,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[ERROR] Exceção:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
