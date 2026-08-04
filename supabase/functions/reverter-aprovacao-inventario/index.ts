import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: Reverter Aprovação
 *
 * Devolve um inventário aprovado para 'pendente', para que possa ser corrigido.
 *
 * Não há mais nada a desfazer além do status: a aprovação deixou de gravar estoque
 * derivado. Duas regras antigas saíram junto com o subsistema de estoque por pedidos:
 *
 *   - a exclusão do snapshot em estoque_real criado pela aprovação;
 *   - o bloqueio quando existia inventário aprovado mais recente do mesmo vendedor.
 *     Esse bloqueio protegia a cadeia de snapshots, em que o teórico de um inventário
 *     dependia do anterior. Não existe mais cadeia: cada inventário é um registro
 *     independente de uma contagem numa data, e a comparação é escolhida pelo usuário.
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { inventario_id } = await req.json();
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas gerentes.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { data: inventario, error: invError } = await supabaseAdmin
      .from('inventarios')
      .select('id, status')
      .eq('id', inventario_id)
      .single();
    if (invError || !inventario) {
      throw new Error('Inventário não encontrado.');
    }
    if (inventario.status !== 'aprovado') {
      throw new Error(`Inventário não está aprovado (status atual: ${inventario.status}).`);
    }

    const { error: updError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'pendente', updated_at: new Date().toISOString() })
      .eq('id', inventario_id);
    if (updError) throw updError;

    return new Response(
      JSON.stringify({ message: 'Aprovação revertida. Inventário voltou para pendente.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[reverter-aprovacao-inventario]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
