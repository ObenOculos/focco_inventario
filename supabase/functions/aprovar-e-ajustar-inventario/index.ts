import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2'

// Tipos para melhor type safety
interface DivergenciaItem {
  codigo_auxiliar: string;
  nome_produto: string;
  divergencia: number;
}

interface EstoqueItem {
  codigo_auxiliar: string;
  quantidade_remessa: number;
}

interface ProdutoEstoque {
  codigo_auxiliar: string;
  quantidade_remessa: number;
  quantidade_venda: number;
  estoque_teorico: number;
}

// Funções do Deno para lidar com CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Edge Function para aprovar e ajustar inventário
 *
 * Esta função:
 * 1. Valida permissões do usuário (apenas gerentes)
 * 2. Verifica se o inventário existe e está pendente/revisão
 * 3. Calcula divergências entre estoque físico e teórico
 * 4. Cria ajustes automáticos de estoque se necessário
 * 5. Atualiza o status do inventário para 'aprovado'
 * 6. Atualiza a tabela estoque_real com os novos valores
 *
 * @param inventario_id - ID do inventário a ser aprovado
 * @returns Status da operação e número de ajustes criados
 */

serve(async (req: Request) => {
  // Trata a requisição OPTIONS (pre-flight) para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validação da entrada
    const body = await req.json()
    const { inventario_id } = body

    if (!inventario_id || typeof inventario_id !== 'string') {
      throw new Error("ID do inventário é obrigatório e deve ser uma string válida.");
    }

    // Cria um cliente Supabase com privilégios de serviço para poder
    // verificar o perfil do usuário e realizar as operações necessárias.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Pega o token JWT do header da requisição
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autenticação não fornecido.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verifica o token JWT e obtém o usuário
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token de autenticação inválido.' }), {
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
      .select('status, codigo_vendedor, user_id')
      .eq('id', inventario_id)
      .single();

    if (inventarioError) {
      throw new Error(`Inventário não encontrado: ${inventarioError.message}`);
    }

    if (!inventario) {
      throw new Error("Inventário não encontrado.");
    }

    if (!['pendente', 'revisao'].includes(inventario.status)) {
      throw new Error(`Este inventário já foi processado (status atual: ${inventario.status}).`);
    }

    // Verifica se o inventário pertence ao usuário que está tentando aprovar (se necessário)
    // Nota: Gerentes podem aprovar inventários de qualquer vendedor

    // Chama a função RPC para obter as divergências
    const { data: comparativo, error: rpcError } = await supabaseAdmin.rpc('comparar_estoque_inventario', {
        p_inventario_id: inventario_id
    });

    if (rpcError) {
        console.error("Erro RPC:", rpcError);
        console.error("Detalhes do erro:", JSON.stringify(rpcError, null, 2));
        throw new Error(`Não foi possível calcular a comparação do inventário: ${rpcError.message || 'Erro desconhecido'}`);
    }

    console.log("Comparativo obtido:", comparativo);
    console.log("Número de itens no comparativo:", comparativo?.length || 0);

    if (!comparativo || !Array.isArray(comparativo)) {
        console.error("Comparativo não é um array válido:", comparativo);
        throw new Error("Resultado da comparação de inventário é inválido.");
    }

    const divergencias = comparativo.filter((item: DivergenciaItem) => item.divergencia !== 0);

    console.log("Divergências encontradas:", divergencias.length);
    console.log("Divergências:", divergencias);

    // Se houver divergências, criar ajustes
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
    
    // Nova lógica para atualizar o estoque_real
    // 1. Pega todo o estoque teórico (que inclui as remessas)
    const { data: todoEstoqueVendedor, error: estoqueError } = await supabaseAdmin
        .rpc('calcular_estoque_vendedor', { p_codigo_vendedor: inventario.codigo_vendedor });

    if (estoqueError) {
        console.error("Erro ao calcular estoque do vendedor:", estoqueError);
        throw new Error("Falha ao buscar o estoque completo do vendedor.");
    }

    // 2. Pega os itens contados no inventário
    const { data: itensInventario, error: itensError } = await supabaseAdmin
        .from('itens_inventario')
        .select('codigo_auxiliar, quantidade_fisica')
        .eq('inventario_id', inventario_id);

    if (itensError) {
        console.error("Erro ao buscar itens do inventário:", itensError);
        throw new Error("Falha ao buscar itens contados.");
    }

    if (!itensInventario || itensInventario.length === 0) {
        throw new Error("O inventário não possui itens contados.");
    }

    // 3. Mapeia os itens contados para fácil acesso
    const mapaItensContados = new Map(
        itensInventario.map(item => [item.codigo_auxiliar, item.quantidade_fisica])
    );

    // 4. Prepara os dados para o upsert
    const estoqueRealFinal = todoEstoqueVendedor.map((produto: ProdutoEstoque) => {
        const quantidadeFisica = mapaItensContados.get(produto.codigo_auxiliar);
        
        // Se foi contado no inventário, usa a quantidade física
        // Se NÃO foi contado, mantém o estoque teórico atual como estoque real
        const quantidadeFinal = quantidadeFisica !== undefined 
            ? quantidadeFisica 
            : produto.estoque_teorico;

        return {
            codigo_vendedor: inventario.codigo_vendedor,
            codigo_auxiliar: produto.codigo_auxiliar,
            quantidade_real: quantidadeFinal,
            inventario_id: quantidadeFisica !== undefined ? inventario_id : null, // Só associa inventario_id se foi contado
            data_atualizacao: new Date().toISOString()
        };
    });

    // 5. Deleta o estoque antigo para este vendedor
    const { error: deleteError } = await supabaseAdmin
        .from('estoque_real')
        .delete()
        .eq('codigo_vendedor', inventario.codigo_vendedor);

    if (deleteError) {
        console.error("Erro ao limpar estoque real antigo:", deleteError);
        throw new Error("Falha ao limpar o estoque antigo antes de atualizar.");
    }

    // 6. Insere o novo estado do estoque real
    const { error: upsertError } = await supabaseAdmin
        .from('estoque_real')
        .insert(estoqueRealFinal);

    if (upsertError) {
        console.error("Erro ao dar upsert no estoque real:", upsertError);
        throw new Error("Falha ao salvar o novo estado do estoque real.");
    }


    const mensagemSucesso = divergencias.length > 0
      ? `Inventário aprovado com sucesso! ${divergencias.length} ajuste(s) de estoque foram criados e o estoque real foi atualizado.`
      : 'Inventário aprovado com sucesso! Não foram necessários ajustes de estoque.';

    return new Response(JSON.stringify({
      message: mensagemSucesso,
      ajustes_criados: divergencias.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
