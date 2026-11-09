import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Gerente define a senha de um vendedor direto, sem depender do email de definição.
 *
 * Existe porque o email de recuperação pode não chegar (spam, email digitado errado) e o
 * vendedor precisa entrar no mesmo dia. Só alcança perfis `vendedor`: senha de gerente
 * não é trocada por outro gerente por aqui.
 */

const DefinirSenhaSchema = z.object({
  user_id: z.string().uuid(),
  // 6 é o mínimo do Supabase Auth; 72 é o limite do bcrypt — acima disso o resto é ignorado.
  senha: z.string().min(6, 'A senha precisa de pelo menos 6 caracteres').max(72),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: 'JSON inválido' }, 400);
    }
    const parsed = DefinirSenhaSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { user_id, senha } = parsed.data;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Token de autorização ausente ou inválido' }, 401);
    }
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return json({ error: 'Token de autorização inválido' }, 401);
    }

    const { data: solicitante } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (solicitante?.role !== 'gerente') {
      return json({ error: 'Apenas gerentes podem definir senhas' }, 403);
    }

    const { data: alvo } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .maybeSingle();
    if (!alvo) {
      return json({ error: 'Vendedor não encontrado' }, 404);
    }
    if (alvo.role !== 'vendedor') {
      return json({ error: 'Só é possível definir a senha de vendedores' }, 403);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: senha,
    });
    if (updateError) {
      console.error('Erro ao definir senha:', updateError);
      return json({ error: `Erro ao definir senha: ${updateError.message}` }, 400);
    }

    return json({ success: true });
  } catch (error) {
    console.error('Erro inesperado:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido no servidor' },
      500
    );
  }
});
