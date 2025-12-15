import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0';
import { corsHeaders } from '../_shared/cors.ts';

// Tipos para melhor type safety
interface CriarVendedorRequest {
  email: string;
  nome: string;
  codigo_vendedor?: string;
  telefone?: string;
}

interface CriarVendedorResponse {
  success: boolean;
  message: string;
  user_id: string;
}

/**
 * Edge Function para criar novo vendedor
 *
 * Esta função:
 * 1. Valida permissões do usuário (apenas gerentes)
 * 2. Valida dados de entrada obrigatórios
 * 3. Cria usuário no Supabase Auth
 * 4. Cria perfil na tabela profiles
 * 5. Envia email de redefinição de senha
 * 6. Rollback automático em caso de falha
 *
 * @param email - Email do vendedor (obrigatório)
 * @param nome - Nome do vendedor (obrigatório)
 * @param codigo_vendedor - Código identificador (opcional)
 * @param telefone - Telefone de contato (opcional)
 * @returns Status da criação e ID do usuário criado
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validação da entrada
    const body: CriarVendedorRequest = await req.json();
    const { email, nome, codigo_vendedor, telefone } = body;

    // Validações obrigatórias
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email válido é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome é obrigatório e deve ter pelo menos 2 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validações opcionais
    if (codigo_vendedor && typeof codigo_vendedor !== 'string') {
      return new Response(JSON.stringify({ error: 'Código do vendedor deve ser uma string' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (telefone && typeof telefone !== 'string') {
      return new Response(JSON.stringify({ error: 'Telefone deve ser uma string' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cliente admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verificar se o usuário que está fazendo a requisição é gerente
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Token de autorização ausente ou inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token de autorização inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar perfil do usuário
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Erro ao buscar perfil:', profileError);
      return new Response(JSON.stringify({ error: 'Erro ao verificar permissões do usuário' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile || profile.role !== 'gerente') {
      return new Response(JSON.stringify({ error: 'Apenas gerentes podem criar vendedores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar se já existe um usuário com este email
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUser.users.some((user) => user.email === email.toLowerCase());

    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'Já existe um usuário cadastrado com este email' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se o código do vendedor já está em uso (se fornecido)
    if (codigo_vendedor) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('codigo_vendedor', codigo_vendedor)
        .single();

      if (existingProfile) {
        return new Response(JSON.stringify({ error: 'Este código de vendedor já está em uso' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Criar usuário no Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true, // Email já confirmado
      user_metadata: {
        nome: nome.trim(),
        codigo_vendedor,
        telefone,
      },
    });

    if (createError) {
      console.error('Erro ao criar usuário:', createError);
      return new Response(
        JSON.stringify({ error: `Erro ao criar usuário: ${createError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: 'Falha ao criar usuário - resposta vazia' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Criar perfil na tabela profiles
    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      id: newUser.user.id,
      email,
      nome,
      codigo_vendedor,
      telefone,
      role: 'vendedor',
      ativo: true,
    });

    if (insertProfileError) {
      console.error('Erro ao criar perfil:', insertProfileError);
      // Deletar usuário do auth se falhar ao criar perfil
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);

      return new Response(JSON.stringify({ error: 'Erro ao criar perfil do vendedor' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enviar email de redefinição de senha
    const origin =
      req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const redirectTo = origin ? `${origin}/auth` : undefined;

    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
      email.toLowerCase(),
      {
        redirectTo,
      }
    );

    if (resetError) {
      console.error('Erro ao enviar email de redefinição:', resetError);
      // Não falhar a operação por causa do email, apenas logar
    }

    const response: CriarVendedorResponse = {
      success: true,
      message: resetError
        ? 'Vendedor criado com sucesso. Não foi possível enviar o email de definição de senha.'
        : 'Vendedor criado com sucesso. Um email foi enviado para definir a senha.',
      user_id: newUser.user.id,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro inesperado:', error);

    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido no servidor';

    return new Response(
      JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
