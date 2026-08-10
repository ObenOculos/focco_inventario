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
      q.set('base_data', baseData(p.base_data));
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
  return bruto.map((v) => String(exigirInteiro(v, campo)));
}

function baseData(valor: unknown): string {
  if (valor === undefined || valor === null) return 'movimento';
  if (valor !== 'movimento' && valor !== 'emissao') {
    throw new ErroDeEntrada("'base_data' deve ser 'movimento' ou 'emissao'.");
  }
  return valor;
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
