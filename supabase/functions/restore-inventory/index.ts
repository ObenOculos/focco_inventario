import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One-shot restore endpoint. Will be deleted after use.
const ONE_SHOT_TOKEN = 'restore-mister-claudio-2026-02-01-once';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    if (body.token !== ONE_SHOT_TOKEN) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { codigo_vendedor, user_id, data_inventario, observacoes, items } = body;

    const { data: inv, error: invErr } = await supabase
      .from('inventarios')
      .insert({ codigo_vendedor, user_id, data_inventario, status: 'aprovado', observacoes })
      .select('id')
      .single();
    if (invErr) throw invErr;
    const inv_id = inv.id;

    const itensRows = items.map((x: any) => ({
      inventario_id: inv_id,
      codigo_auxiliar: x.c,
      nome_produto: x.n,
      quantidade_fisica: x.q,
    }));
    const erRows = items.map((x: any) => ({
      codigo_vendedor,
      codigo_auxiliar: x.c,
      quantidade_real: x.q,
      data_atualizacao: data_inventario,
      inventario_id: inv_id,
    }));

    const BATCH = 500;
    for (let i = 0; i < itensRows.length; i += BATCH) {
      const { error } = await supabase
        .from('itens_inventario')
        .insert(itensRows.slice(i, i + BATCH));
      if (error) throw error;
    }
    for (let i = 0; i < erRows.length; i += BATCH) {
      const { error } = await supabase.from('estoque_real').insert(erRows.slice(i, i + BATCH));
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, inv_id, items: itensRows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
