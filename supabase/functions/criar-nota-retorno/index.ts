import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ItemRetorno {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto?: number;
}

interface NotaRetornoRequest {
  codigo_vendedor: string;
  itens: ItemRetorno[];
  observacoes?: string;
}

/**
 * Edge Function: Criar Nota de Retorno
 *
 * Fluxo:
 * 1. Valida permissões (apenas gerentes)
 * 2. Recebe código do vendedor e lista de itens a retornar
 * 3. Gera número do pedido automático com prefixo "RET-"
 * 4. Cria pedido na tabela pedidos com codigo_tipo = 3
 * 5. Insere itens em lotes de 500 (evita limite de 1000)
 * 6. Retorna sucesso com número da nota gerada
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: NotaRetornoRequest = await req.json();
    const { codigo_vendedor, itens, observacoes } = body;

    if (!codigo_vendedor || typeof codigo_vendedor !== 'string') {
      throw new Error('Código do vendedor é obrigatório.');
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      throw new Error('Lista de itens é obrigatória.');
    }

    // Filtra itens com quantidade > 0
    const itensValidos = itens.filter((item) => item.quantidade > 0);
    if (itensValidos.length === 0) {
      throw new Error('Nenhum item com quantidade válida para retorno.');
    }

    // Cliente admin com service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Valida autenticação
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

    // Valida permissão de gerente
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

    // Busca dados do vendedor
    const { data: vendedor, error: vendedorError } = await supabaseAdmin
      .from('profiles')
      .select('nome, codigo_vendedor')
      .eq('codigo_vendedor', codigo_vendedor)
      .maybeSingle();

    const nomeVendedor = vendedor?.nome || codigo_vendedor;

    // Gera número do pedido automático
    const timestamp = Date.now();
    const numeroPedido = `RET-${codigo_vendedor}-${timestamp}`;

    console.log(`[INFO] Criando nota de retorno ${numeroPedido} para vendedor ${codigo_vendedor}`);
    console.log(`[INFO] Total de itens a processar: ${itensValidos.length}`);

    // Calcula valor total
    const valorTotal = itensValidos.reduce((acc, item) => {
      return acc + (item.valor_produto || 0) * item.quantidade;
    }, 0);

    // Cria o pedido
    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from('pedidos')
      .insert({
        numero_pedido: numeroPedido,
        data_emissao: new Date().toISOString(),
        codigo_vendedor: codigo_vendedor,
        nome_vendedor: nomeVendedor,
        codigo_tipo: 3, // Retorno
        valor_total: valorTotal,
        situacao: 'N',
      })
      .select('id')
      .single();

    if (pedidoError || !pedido) {
      console.error('[ERROR] Erro ao criar pedido:', pedidoError);
      throw new Error('Falha ao criar nota de retorno.');
    }

    console.log(`[INFO] Pedido criado com ID: ${pedido.id}`);

    // Prepara itens do pedido
    const itensPedido = itensValidos.map((item) => ({
      pedido_id: pedido.id,
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      quantidade: item.quantidade,
      valor_produto: item.valor_produto || 0,
    }));

    // Insere itens em lotes de 500
    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < itensPedido.length; i += batchSize) {
      const batch = itensPedido.slice(i, i + batchSize);
      const { error: insertError } = await supabaseAdmin.from('itens_pedido').insert(batch);

      if (insertError) {
        console.error(`[ERROR] Erro ao inserir lote de itens (offset ${i}):`, insertError);
        // Tenta deletar o pedido em caso de erro
        await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id);
        throw new Error('Falha ao inserir itens do retorno.');
      }

      insertedCount += batch.length;
      console.log(`[INFO] Inseridos ${insertedCount}/${itensPedido.length} itens`);
    }

    const totalUnidades = itensValidos.reduce((acc, item) => acc + item.quantidade, 0);

    console.log(`[INFO] Nota de retorno criada com sucesso: ${numeroPedido}`);

    return new Response(
      JSON.stringify({
        message: 'Nota de retorno criada com sucesso!',
        numero_pedido: numeroPedido,
        pedido_id: pedido.id,
        total_itens: itensValidos.length,
        total_unidades: totalUnidades,
        valor_total: valorTotal,
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
