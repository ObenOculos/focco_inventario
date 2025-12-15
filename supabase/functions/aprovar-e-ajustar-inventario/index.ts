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
  foi_contado: boolean;
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

    // Atualiza status do inventário
    const { error: updateError } = await supabaseAdmin
      .from('inventarios')
      .update({ status: 'aprovado', updated_at: new Date().toISOString() })
      .eq('id', inventario_id)

    if (updateError) {
      console.error("[ERROR] Erro ao atualizar inventário:", updateError)
      throw new Error("Falha ao aprovar inventário.")
    }

    // Correção 4: Manter histórico de estoque_real - não deletar registros antigos
    // Prepara dados para estoque_real usando o comparativo
    // - Itens contados (foi_contado=true): usa quantidade_fisica (mesmo se 0)
    // - Itens não contados (foi_contado=false): mantém estoque_teorico
    const estoqueRealData = (comparativo || [])
      .filter((item: DivergenciaItem) => 
        item.foi_contado || item.estoque_teorico !== 0
      )
      .map((item: DivergenciaItem) => ({
        codigo_vendedor: inventario.codigo_vendedor,
        codigo_auxiliar: item.codigo_auxiliar,
        // Se foi contado, usa a contagem física (mesmo se 0); senão, mantém o teórico
        quantidade_real: item.foi_contado 
          ? item.quantidade_fisica 
          : item.estoque_teorico,
        inventario_id: inventario_id,
        data_atualizacao: inventario.data_inventario
      }))

    if (estoqueRealData.length === 0) {
      throw new Error("Nenhum item para registrar no estoque real.")
    }

    console.log(`[INFO] Itens para estoque real: ${estoqueRealData.length} (contados + mantidos do teórico)`)

    // Correção 4: Inserir novos registros SEM deletar os antigos (mantém histórico)
    // Cada inventário aprovado cria um novo snapshot com data_atualizacao e inventario_id únicos
    const { error: insertError } = await supabaseAdmin
      .from('estoque_real')
      .insert(estoqueRealData)

    if (insertError) {
      console.error("[ERROR] Erro ao inserir estoque real:", insertError)
      throw new Error("Falha ao salvar estoque real.")
    }

    console.log(`[INFO] Estoque real registrado: ${estoqueRealData.length} itens (histórico mantido)`)

    const mensagem = divergencias.length > 0
      ? `Inventário aprovado! ${divergencias.length} divergência(s) registradas.`
      : 'Inventário aprovado! Sem divergências.'

    return new Response(JSON.stringify({
      message: mensagem,
      divergencias_encontradas: divergencias.length,
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
