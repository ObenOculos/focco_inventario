import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
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
      .select('id, status, codigo_vendedor, data_inventario')
      .eq('id', inventario_id)
      .single();
    if (invError || !inventario) {
      throw new Error('Inventário não encontrado.');
    }
    if (inventario.status !== 'aprovado') {
      throw new Error(`Inventário não está aprovado (status atual: ${inventario.status}).`);
    }

    // Bloqueia se houver inventário aprovado mais recente do mesmo vendedor
    const { data: maisRecente, error: recError } = await supabaseAdmin
      .from('inventarios')
      .select('id, data_inventario')
      .eq('codigo_vendedor', inventario.codigo_vendedor)
      .eq('status', 'aprovado')
      .gt('data_inventario', inventario.data_inventario)
      .order('data_inventario', { ascending: false })
      .limit(1);
    if (recError) throw recError;
    if (maisRecente && maisRecente.length > 0) {
      const dt = new Date(maisRecente[0].data_inventario).toLocaleDateString('pt-BR');
      throw new Error(
        `Existe um inventário aprovado mais recente (${dt}) deste vendedor. Reverta-o primeiro.`
      );
    }

    // Deleta snapshot do estoque_real criado por esta aprovação
    const { error: delError, count: deletedCount } = await supabaseAdmin
      .from('estoque_real')
      .delete({ count: 'exact' })
      .eq('inventario_id', inventario_id);
    if (delError) throw delError;

    // Volta status para pendente
    const { error: updError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'pendente', updated_at: new Date().toISOString() })
      .eq('id', inventario_id);
    if (updError) throw updError;

    return new Response(
      JSON.stringify({
        message: 'Aprovação revertida. Inventário voltou para pendente.',
        registros_estoque_removidos: deletedCount ?? 0,
      }),
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
