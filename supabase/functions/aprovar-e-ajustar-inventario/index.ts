import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DivergenciaItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  divergencia: number;
}

interface EstoqueItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
}

/**
 * Edge Function: Aprovar e Ajustar Inventário
 * 
 * Fluxo:
 * 1. Valida permissões (apenas gerentes)
 * 2. Verifica status do inventário (pendente ou revisao)
 * 3. Calcula divergências usando comparar_estoque_inventario
 * 4. Cria ajustes automáticos de estoque para divergências
 * 5. Atualiza status para 'aprovado'
 * 6. Atualiza tabela estoque_real com contagem física
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { inventario_id } = body

    if (!inventario_id || typeof inventario_id !== 'string') {
      throw new Error("ID do inventário é obrigatório.")
    }

    // Cliente admin com service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Valida autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token não fornecido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Valida permissão de gerente
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas gerentes.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // Busca inventário
    const { data: inventario, error: inventarioError } = await supabaseAdmin
      .from('inventarios')
      .select('status, codigo_vendedor, user_id, data_inventario')
      .eq('id', inventario_id)
      .single()

    if (inventarioError || !inventario) {
      throw new Error("Inventário não encontrado.")
    }

    if (!['pendente', 'revisao'].includes(inventario.status)) {
      throw new Error(`Inventário já processado (status: ${inventario.status}).`)
    }

    console.log(`[INFO] Processando inventário ${inventario_id} do vendedor ${inventario.codigo_vendedor}`)

    // Calcula divergências usando a função SQL
    const { data: comparativo, error: rpcError } = await supabaseAdmin.rpc('comparar_estoque_inventario', {
      p_inventario_id: inventario_id
    })

    if (rpcError) {
      console.error("[ERROR] Erro ao comparar inventário:", rpcError)
      throw new Error(`Erro ao calcular divergências: ${rpcError.message}`)
    }

    console.log(`[INFO] Itens comparados: ${comparativo?.length || 0}`)

    const divergencias = (comparativo || []).filter((item: DivergenciaItem) => item.divergencia !== 0)
    console.log(`[INFO] Divergências encontradas: ${divergencias.length}`)

    // Cria ajustes para divergências
    if (divergencias.length > 0) {
      const ajustes = divergencias.map((item: DivergenciaItem) => ({
        user_id: user.id,
        codigo_vendedor: inventario.codigo_vendedor,
        codigo_auxiliar: item.codigo_auxiliar,
        nome_produto: item.nome_produto,
        tipo_movimentacao: item.divergencia > 0 ? 'ajuste_entrada' : 'ajuste_saida',
        quantidade: Math.abs(item.divergencia),
        motivo: 'Ajuste automático via aprovação de inventário',
        origem_id: inventario_id,
        origem_tipo: 'inventario_ajuste',
        data_movimentacao: inventario.data_inventario
      }))

      const { error: insertError } = await supabaseAdmin
        .from('movimentacoes_estoque')
        .insert(ajustes)

      if (insertError) {
        console.error("[ERROR] Erro ao inserir ajustes:", insertError)
        throw new Error("Falha ao salvar ajustes de estoque.")
      }

      console.log(`[INFO] ${ajustes.length} ajustes criados com sucesso`)
    }

    // Atualiza status do inventário
    const { error: updateError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'aprovado', updated_at: new Date().toISOString() })
      .eq('id', inventario_id)

    if (updateError) {
      console.error("[ERROR] Erro ao atualizar inventário:", updateError)
      throw new Error("Falha ao aprovar inventário.")
    }

    // Busca itens contados no inventário
    const { data: itensInventario, error: itensError } = await supabaseAdmin
      .from('itens_inventario')
      .select('codigo_auxiliar, quantidade_fisica, nome_produto')
      .eq('inventario_id', inventario_id)

    if (itensError) {
      console.error("[ERROR] Erro ao buscar itens:", itensError)
      throw new Error("Falha ao buscar itens contados.")
    }

    if (!itensInventario || itensInventario.length === 0) {
      throw new Error("Inventário sem itens contados.")
    }

    // Prepara dados para estoque_real
    const estoqueRealData = itensInventario.map(item => ({
      codigo_vendedor: inventario.codigo_vendedor,
      codigo_auxiliar: item.codigo_auxiliar,
      quantidade_real: item.quantidade_fisica,
      inventario_id: inventario_id,
      data_atualizacao: inventario.data_inventario
    }))

    // Deleta estoque anterior do vendedor
    const { error: deleteError } = await supabaseAdmin
      .from('estoque_real')
      .delete()
      .eq('codigo_vendedor', inventario.codigo_vendedor)

    if (deleteError) {
      console.error("[ERROR] Erro ao limpar estoque real:", deleteError)
      throw new Error("Falha ao limpar estoque antigo.")
    }

    // Insere novo estoque real
    const { error: upsertError } = await supabaseAdmin
      .from('estoque_real')
      .insert(estoqueRealData)

    if (upsertError) {
      console.error("[ERROR] Erro ao inserir estoque real:", upsertError)
      throw new Error("Falha ao salvar estoque real.")
    }

    console.log(`[INFO] Estoque real atualizado: ${estoqueRealData.length} itens`)

    const mensagem = divergencias.length > 0
      ? `Inventário aprovado! ${divergencias.length} ajuste(s) criados.`
      : 'Inventário aprovado! Sem divergências.'

    return new Response(JSON.stringify({
      message: mensagem,
      ajustes_criados: divergencias.length,
      itens_estoque_real: estoqueRealData.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error("[ERROR] Exceção:", errorMessage)
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
