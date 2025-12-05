import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2'

// Funções do Deno para lidar com CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Trata a requisição OPTIONS (pre-flight) para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { inventario_id } = await req.json()
    if (!inventario_id) {
      throw new Error("É necessário fornecer o ID do inventário.");
    }

    // Cria um cliente Supabase com privilégios de serviço para poder
    // verificar o perfil do usuário e realizar as operações necessárias.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Pega o token de autorização do header da requisição
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))

    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Verifica se o usuário tem a permissão de 'gerente'
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas gerentes podem aprovar inventários.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }
    
    // Busca o inventário para garantir que ele existe e está com status 'pendente' ou 'revisao'
    const { data: inventario, error: inventarioError } = await supabaseAdmin
      .from('inventarios')
      .select('status, codigo_vendedor')
      .eq('id', inventario_id)
      .single();

    if (inventarioError) throw new Error("Inventário não encontrado.");
    if (!['pendente', 'revisao'].includes(inventario.status)) {
        throw new Error(`Este inventário já foi processado (status: ${inventario.status}).`);
    }

    // Chama a função RPC para obter as divergências
    const { data: comparativo, error: rpcError } = await supabaseAdmin.rpc('comparar_estoque_inventario', {
        p_inventario_id: inventario_id
    });

    if (rpcError) {
        console.error("Erro RPC:", rpcError);
        throw new Error("Não foi possível calcular a comparação do inventário.");
    }

    const divergencias = comparativo.filter((item: any) => item.divergencia !== 0);

    if (divergencias.length > 0) {
      const ajustes = divergencias.map((item: any) => ({
        user_id: user.id,
        codigo_vendedor: inventario.codigo_vendedor,
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        tipo_movimentacao: item.divergencia > 0 ? 'ajuste_entrada' : 'ajuste_saida',
        quantidade: Math.abs(item.divergencia),
        motivo: 'Ajuste automático via aprovação de inventário',
        origem_id: inventario_id,
        origem_tipo: 'inventario_ajuste' // Novo campo para rastreabilidade
      }));

      // Insere todos os ajustes de uma vez
      const { error: insertError } = await supabaseAdmin
        .from('movimentacoes_estoque')
        .insert(ajustes);

      if (insertError) {
        console.error("Erro ao inserir ajustes:", insertError);
        throw new Error("Falha ao salvar os ajustes de estoque.");
      }
    }

    // Finalmente, atualiza o status do inventário para 'aprovado'
    const { error: updateError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'aprovado', updated_at: new Date().toISOString() })
      .eq('id', inventario_id);

    if (updateError) {
      console.error("Erro ao atualizar inventário:", updateError);
      throw new Error("Falha ao aprovar o inventário após criar os ajustes.");
    }

    return new Response(JSON.stringify({ message: 'Inventário aprovado e estoque ajustado com sucesso!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
