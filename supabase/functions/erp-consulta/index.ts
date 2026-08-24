import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.44.2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Edge Function: Consulta ao ERP Ciclone
 *
 * Ponte entre o app e o `erp-gateway`, que roda na máquina com acesso à VPN do
 * Ciclone. Existe por dois motivos, e o segundo é o que importa:
 *
 *   1. O Ciclone não é alcançável da Vercel (Postgres atrás de VPN).
 *   2. É AQUI que a autorização acontece. O gateway não sabe quem é o usuário —
 *      ele só confere um segredo compartilhado. Quem identifica a pessoa e
 *      exige `role='gerente'` é esta função, contra `profiles`, no mesmo padrão
 *      de `criar-vendedor` e `reverter-aprovacao-inventario`.
 *
 * Consequência prática: o segredo do gateway NUNCA chega ao browser, e o
 * gateway nunca precisa saber o que é um `profile`.
 */

const GATEWAY_URL = Deno.env.get('ERP_GATEWAY_URL') ?? '';
const GATEWAY_SECRET = Deno.env.get('ERP_GATEWAY_SECRET') ?? '';

// Teto de espera pelo gateway. A reconciliação de uma janela larga leva ~5 s
// medidos; 60 s é folga para o pior caso sem deixar a função pendurada quando
// a máquina do escritório trava no meio da resposta.
const TIMEOUT_MS = 60_000;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Operações permitidas. É uma ALLOWLIST de propósito: o cliente escolhe uma
 * chave desta tabela, nunca um caminho. Sem isso, um `rota` vindo do corpo da
 * requisição deixaria o gateway alcançável em qualquer endpoint que ele venha
 * a ter no futuro.
 */
const OPERACOES: Record<string, { caminho: string; montar: (p: Params) => URLSearchParams }> = {
  vendedores: {
    caminho: '/vendedores',
    montar: () => new URLSearchParams(),
  },
  pedidos: {
    caminho: '/pedidos',
    montar: (p) => {
      const q = new URLSearchParams();
      q.set('de', exigirData(p.de, 'de'));
      q.set('ate', exigirData(p.ate, 'ate'));
      for (const v of listaInteiros(p.vendedores, 'vendedores')) q.append('vendedores', v);
      for (const e of listaInteiros(p.empresas, 'empresas')) q.append('empresas', e);
      q.set('base_data', baseData(p.base_data));
      return q;
    },
  },
  movimentos: {
    caminho: '/movimentos',
    montar: (p) => {
      const q = new URLSearchParams();
      q.set('vendedor', String(exigirInteiro(p.vendedor, 'vendedor')));
      q.set('de', exigirData(p.de, 'de'));
      q.set('ate', exigirData(p.ate, 'ate'));
      for (const e of listaInteiros(p.empresas, 'empresas')) q.append('empresas', e);
      // Regras de conciliação. Omitidas, o gateway usa os padrões de
      // `movimentos.py` — os mesmos da ferramenta local.
      //
      // NENHUM_TIPO existe porque lista vazia não trafega em query string: sem ele,
      // "desmarquei todos os tipos" chegaria como "não informei nada" e o gateway
      // devolveria os padrões, mostrando números que o usuário não pediu.
      const NENHUM_TIPO = '-1';
      for (const [campo, valor] of [
        ['tipos_venda', p.tipos_venda],
        ['tipos_remessa', p.tipos_remessa],
      ] as const) {
        if (valor === undefined) continue;
        const lista = listaInteiros(valor, campo);
        if (lista.length === 0) q.append(campo, NENHUM_TIPO);
        else for (const t of lista) q.append(campo, t);
      }
      // Operações seguem outra regra no gateway: omitido = TODAS contam. Lista
      // vazia aqui significaria "nenhuma operação", que zera tudo — e é uma escolha
      // legítima do usuário, então passa como está.
      if (p.operacoes !== undefined) {
        const ops = listaInteiros(p.operacoes, 'operacoes');
        if (ops.length === 0) q.append('operacoes', NENHUM_TIPO);
        else for (const o of ops) q.append('operacoes', o);
      }
      q.set('base_data', baseData(p.base_data));
      return q;
    },
  },
  regras: {
    caminho: '/regras',
    montar: () => new URLSearchParams(),
  },
  produtos: {
    caminho: '/produtos',
    montar: (p) => {
      const q = new URLSearchParams();
      for (const e of listaInteiros(p.empresas, 'empresas')) q.append('empresas', e);
      return q;
    },
  },
  saidas: {
    caminho: '/saidas',
    montar: (p) => {
      const q = new URLSearchParams();
      q.set('de', exigirData(p.de, 'de'));
      q.set('ate', exigirData(p.ate, 'ate'));
      q.set('nivel', nivel(p.nivel));
      q.set('base_data', baseData(p.base_data));
      if (p.incluir_canceladas !== undefined) {
        q.set('incluir_canceladas', String(booleano(p.incluir_canceladas, 'incluir_canceladas')));
      }
      for (const e of listaInteiros(p.empresas, 'empresas')) q.append('empresas', e);

      // Recortes do drill-down. Categoria e CFOP viajam como TEXTO porque o cliente
      // devolve exatamente o valor que o gateway emitiu — e "sem categoria" é a
      // string VAZIA, que `listaInteiros` rejeitaria e um filtro de vazio descartaria.
      for (const campo of ['marcas', 'tipos', 'subtipos', 'grupos', 'cfops'] as const) {
        for (const v of listaTextos(p[campo], campo)) q.append(campo, v);
      }
      for (const campo of ['tipos_pedido', 'operacoes'] as const) {
        for (const v of listaInteiros(p[campo], campo)) q.append(campo, v);
      }
      return q;
    },
  },
  entradas: {
    caminho: '/entradas',
    montar: (p) => {
      const q = new URLSearchParams();
      q.set('de', exigirData(p.de, 'de'));
      q.set('ate', exigirData(p.ate, 'ate'));
      q.set('nivel', nivel(p.nivel));
      q.set('base_data', baseData(p.base_data));
      if (p.incluir_canceladas !== undefined) {
        q.set('incluir_canceladas', String(booleano(p.incluir_canceladas, 'incluir_canceladas')));
      }
      // Ligar isto DOBRA a compra — a mesma nota entra duas vezes no Ciclone, uma
      // com código genérico que não movimenta estoque. Passa adiante porque é
      // escolha legítima para conferência fiscal, mas nunca por omissão.
      if (p.incluir_sem_movimento !== undefined) {
        q.set(
          'incluir_sem_movimento',
          String(booleano(p.incluir_sem_movimento, 'incluir_sem_movimento'))
        );
      }
      for (const e of listaInteiros(p.empresas, 'empresas')) q.append('empresas', e);
      for (const campo of ['marcas', 'tipos', 'subtipos', 'grupos', 'cfops'] as const) {
        for (const v of listaTextos(p[campo], campo)) q.append(campo, v);
      }
      for (const campo of ['fornecedores', 'operacoes'] as const) {
        for (const v of listaInteiros(p[campo], campo)) q.append(campo, v);
      }
      return q;
    },
  },
};

type Params = Record<string, unknown>;

class ErroDeEntrada extends Error {}

function exigirData(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !DATA_ISO.test(valor)) {
    throw new ErroDeEntrada(`'${campo}' deve ser uma data no formato AAAA-MM-DD.`);
  }
  return valor;
}

function exigirInteiro(valor: unknown, campo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new ErroDeEntrada(`'${campo}' deve ser um número inteiro.`);
  return n;
}

function listaInteiros(valor: unknown, campo: string): string[] {
  if (valor === undefined || valor === null) return [];
  const bruto = Array.isArray(valor) ? valor : [valor];
  if (bruto.length > MAX_ITENS_RECORTE) {
    throw new ErroDeEntrada(`'${campo}' aceita no máximo ${MAX_ITENS_RECORTE} itens.`);
  }
  return bruto.map((v) => String(exigirInteiro(v, campo)));
}

function baseData(valor: unknown): string {
  if (valor === undefined || valor === null) return 'movimento';
  if (valor !== 'movimento' && valor !== 'emissao') {
    throw new ErroDeEntrada("'base_data' deve ser 'movimento' ou 'emissao'.");
  }
  return valor;
}

function nivel(valor: unknown): string {
  if (valor === undefined || valor === null) return 'categoria';
  if (valor !== 'categoria' && valor !== 'produto') {
    throw new ErroDeEntrada("'nivel' deve ser 'categoria' ou 'produto'.");
  }
  return valor;
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') throw new ErroDeEntrada(`'${campo}' deve ser true ou false.`);
  return valor;
}

/**
 * Teto de itens por lista de recorte.
 *
 * Não é sobre segurança — a allowlist e os parâmetros já cuidam disso. É sobre a
 * QUERY STRING: cada item vira um par `campo=valor`, e uma seleção acidental de
 * milhares de CFOPs produziria uma URL que o gateway recusa antes de olhar o
 * conteúdo, com um erro que não explica nada.
 */
const MAX_ITENS_RECORTE = 200;

/**
 * Lista de textos, preservando a string vazia.
 *
 * O vazio é o sentinela de "sem categoria" no `/saidas` — descartá-lo aqui faria
 * o recorte por categoria ausente virar silenciosamente "sem recorte nenhum", que
 * devolve o universo inteiro em vez de um subconjunto.
 */
function listaTextos(valor: unknown, campo: string): string[] {
  if (valor === undefined || valor === null) return [];
  const bruto = Array.isArray(valor) ? valor : [valor];
  if (bruto.length > MAX_ITENS_RECORTE) {
    throw new ErroDeEntrada(`'${campo}' aceita no máximo ${MAX_ITENS_RECORTE} itens.`);
  }
  return bruto.map((v) => {
    if (typeof v !== 'string' && typeof v !== 'number') {
      throw new ErroDeEntrada(`'${campo}' deve conter apenas texto ou número.`);
    }
    return String(v);
  });
}

function responder(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GATEWAY_URL || !GATEWAY_SECRET) {
      console.error('ERP_GATEWAY_URL ou ERP_GATEWAY_SECRET não configurados.');
      return responder({ error: 'Integração com o ERP não está configurada.' }, 500);
    }

    // ── Autenticação ────────────────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return responder({ error: 'Token não fornecido.' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return responder({ error: 'Token inválido.' }, 401);
    }

    // ── Autorização ─────────────────────────────────────────────────────────
    // A consulta ao ERP expõe dados de TODOS os vendedores (vendas, clientes,
    // valores). Por isso é restrita a gerente, e não filtrada por vendedor.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'gerente') {
      return responder({ error: 'Acesso negado. Apenas gerentes consultam o ERP.' }, 403);
    }

    // ── Validação da operação ───────────────────────────────────────────────
    const { operacao, params } = (await req.json()) as {
      operacao?: string;
      params?: Params;
    };

    const definicao = operacao ? OPERACOES[operacao] : undefined;
    if (!definicao) {
      return responder(
        {
          error: `Operação desconhecida: '${operacao ?? ''}'.`,
          operacoes: Object.keys(OPERACOES),
        },
        400
      );
    }

    let query: URLSearchParams;
    try {
      query = definicao.montar(params ?? {});
    } catch (e) {
      if (e instanceof ErroDeEntrada) return responder({ error: e.message }, 422);
      throw e;
    }

    // ── Chamada ao gateway ──────────────────────────────────────────────────
    const alvo = `${GATEWAY_URL.replace(/\/$/, '')}${definicao.caminho}?${query}`;
    const controller = new AbortController();
    const relogio = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resposta: Response;
    try {
      resposta = await fetch(alvo, {
        headers: { 'X-Gateway-Secret': GATEWAY_SECRET },
        signal: controller.signal,
      });
    } catch (e) {
      // Gateway inalcançável é 503, não 500: a máquina do escritório estar fora
      // do ar não é um bug do app, e a tela precisa distinguir os dois casos
      // para mostrar "ERP indisponível" em vez de "erro inesperado".
      const abortou = e instanceof Error && e.name === 'AbortError';
      console.error('Falha ao alcançar o gateway:', e);
      return responder(
        {
          error: abortou
            ? 'A consulta ao ERP demorou demais e foi cancelada.'
            : 'ERP indisponível: não foi possível alcançar o servidor de consulta.',
        },
        503
      );
    } finally {
      clearTimeout(relogio);
    }

    const texto = await resposta.text();
    if (!resposta.ok) {
      console.error(`Gateway respondeu ${resposta.status}: ${texto}`);
      // 401 aqui significa segredo errado — problema de configuração NOSSO, que
      // não deve vazar para o usuário como "não autorizado" (ele é gerente e
      // está autorizado). Vira 500.
      const status = resposta.status === 401 ? 500 : resposta.status;
      let detalhe = 'Falha na consulta ao ERP.';
      try {
        detalhe = JSON.parse(texto).detail ?? detalhe;
      } catch { /* corpo não-JSON: fica a mensagem genérica */ }
      return responder({ error: detalhe }, status);
    }

    return new Response(texto, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro inesperado em erp-consulta:', e);
    return responder({ error: 'Erro inesperado ao consultar o ERP.' }, 500);
  }
});
