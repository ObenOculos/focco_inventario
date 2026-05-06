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
  itens?: ItemRetorno[];
  observacoes?: string;
  inventario_id?: string; // Quando informado, monta a nota a partir do inventário aprovado
}

/**
 * Edge Function: Criar Nota de Retorno
 *
 * Dois modos de operação:
 * - Modo "inventário": recebe `inventario_id` (status=aprovado) e gera a nota
 *   a partir das quantidades contadas em itens_inventario. Ao concluir,
 *   marca o inventário como `baixado`.
 * - Modo "manual" (legado): recebe lista `itens` arbitrária.
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: NotaRetornoRequest = await req.json();
    const { codigo_vendedor, observacoes, inventario_id } = body;
    let { itens } = body;

    if (!codigo_vendedor || typeof codigo_vendedor !== 'string') {
      throw new Error('Código do vendedor é obrigatório.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Auth
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
      .from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas gerentes.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // === MODO INVENTÁRIO ===
    let inventarioValidado: { id: string; status: string; codigo_vendedor: string } | null = null;
    if (inventario_id) {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from('inventarios')
        .select('id, status, codigo_vendedor')
        .eq('id', inventario_id)
        .maybeSingle();
      if (invErr || !inv) throw new Error('Inventário não encontrado.');
      if (inv.codigo_vendedor !== codigo_vendedor) {
        throw new Error('Inventário não pertence ao vendedor informado.');
      }
      if (inv.status !== 'aprovado') {
        throw new Error(`Inventário precisa estar aprovado (status atual: ${inv.status}).`);
      }
      inventarioValidado = inv;

      // Monta itens a partir de itens_inventario (somando duplicatas) + valor de produtos
      const itensAgg = new Map<string, { quantidade: number; nome_produto: string | null }>();
      const BATCH = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from('itens_inventario')
          .select('codigo_auxiliar, quantidade_fisica, nome_produto')
          .eq('inventario_id', inventario_id)
          .order('id', { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const it of data) {
          const cur = itensAgg.get(it.codigo_auxiliar);
          const q = Number(it.quantidade_fisica) || 0;
          if (cur) cur.quantidade += q;
          else itensAgg.set(it.codigo_auxiliar, { quantidade: q, nome_produto: it.nome_produto });
        }
        if (data.length < BATCH) break;
        from += BATCH;
      }

      const codigos = Array.from(itensAgg.entries()).filter(([, v]) => v.quantidade > 0).map(([k]) => k);
      if (codigos.length === 0) {
        throw new Error('Inventário não possui itens contados (quantidade > 0).');
      }

      const produtosMap = new Map<string, { nome_produto: string; valor_produto: number }>();
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500);
        const { data: produtos } = await supabaseAdmin
          .from('produtos')
          .select('codigo_auxiliar, nome_produto, valor_produto')
          .in('codigo_auxiliar', lote);
        produtos?.forEach((p) => {
          produtosMap.set(p.codigo_auxiliar, {
            nome_produto: p.nome_produto,
            valor_produto: Number(p.valor_produto) || 0,
          });
        });
      }

      itens = codigos.map((codigo) => {
        const agg = itensAgg.get(codigo)!;
        const prod = produtosMap.get(codigo);
        return {
          codigo_auxiliar: codigo,
          nome_produto: prod?.nome_produto || agg.nome_produto || codigo,
          quantidade: agg.quantidade,
          valor_produto: prod?.valor_produto || 0,
        };
      });
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      throw new Error('Lista de itens é obrigatória.');
    }
    const itensValidos = itens.filter((item) => item.quantidade > 0);
    if (itensValidos.length === 0) {
      throw new Error('Nenhum item com quantidade válida para retorno.');
    }

    // Vendedor
    const { data: vendedor } = await supabaseAdmin
      .from('profiles').select('nome, codigo_vendedor')
      .eq('codigo_vendedor', codigo_vendedor).maybeSingle();
    const nomeVendedor = vendedor?.nome || codigo_vendedor;

    const numeroPedido = `RET-${codigo_vendedor}-${Date.now()}`;
    const valorTotal = itensValidos.reduce((acc, i) => acc + (i.valor_produto || 0) * i.quantidade, 0);

    console.log(`[INFO] Criando nota ${numeroPedido} (${itensValidos.length} itens) ${inventario_id ? `do inv. ${inventario_id}` : 'manual'}`);

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from('pedidos')
      .insert({
        numero_pedido: numeroPedido,
        data_emissao: new Date().toISOString(),
        codigo_vendedor,
        nome_vendedor: nomeVendedor,
        codigo_tipo: 3,
        valor_total: valorTotal,
        situacao: 'N',
      })
      .select('id').single();
    if (pedidoError || !pedido) throw new Error('Falha ao criar nota de retorno.');

    const itensPedido = itensValidos.map((item) => ({
      pedido_id: pedido.id,
      codigo_auxiliar: item.codigo_auxiliar,
      nome_produto: item.nome_produto,
      quantidade: item.quantidade,
      valor_produto: item.valor_produto || 0,
    }));

    for (let i = 0; i < itensPedido.length; i += 500) {
      const batch = itensPedido.slice(i, i + 500);
      const { error: insertError } = await supabaseAdmin.from('itens_pedido').insert(batch);
      if (insertError) {
        await supabaseAdmin.from('pedidos').delete().eq('id', pedido.id);
        throw new Error('Falha ao inserir itens do retorno.');
      }
    }

    // === ATUALIZA estoque_real ===
    const agora = new Date().toISOString();
    const estoqueRows = itensValidos.map((item) => ({
      codigo_vendedor,
      codigo_auxiliar: item.codigo_auxiliar,
      quantidade_real: 0,
      data_atualizacao: agora,
      inventario_id: null,
    }));
    for (let i = 0; i < estoqueRows.length; i += 500) {
      const batch = estoqueRows.slice(i, i + 500);
      const { error: erErr } = await supabaseAdmin.from('estoque_real').insert(batch);
      if (erErr) console.error('[WARN] estoque_real batch error:', erErr);
    }

    // === MARCA INVENTÁRIO COMO BAIXADO ===
    if (inventarioValidado) {
      const obsBaixa = `Nota de retorno ${numeroPedido} gerada em ${new Date().toLocaleString('pt-BR')}`;
      const { error: invUpdErr } = await supabaseAdmin
        .from('inventarios')
        .update({
          status: 'baixado',
          observacoes_gerente: observacoes
            ? `${observacoes}\n\n${obsBaixa}`
            : obsBaixa,
          updated_at: agora,
        })
        .eq('id', inventarioValidado.id);
      if (invUpdErr) console.error('[WARN] Falha ao marcar inventário baixado:', invUpdErr);
    }

    const totalUnidades = itensValidos.reduce((acc, i) => acc + i.quantidade, 0);

    return new Response(
      JSON.stringify({
        message: 'Nota de retorno criada com sucesso!',
        numero_pedido: numeroPedido,
        pedido_id: pedido.id,
        total_itens: itensValidos.length,
        total_unidades: totalUnidades,
        valor_total: valorTotal,
        inventario_id: inventarioValidado?.id ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[ERROR]', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
