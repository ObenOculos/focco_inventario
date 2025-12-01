import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.86.0'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { email, nome, codigo_vendedor, telefone } = await req.json()

    // Validação
    if (!email || !nome) {
      return new Response(
        JSON.stringify({ error: 'Email e nome são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verificar se o usuário que está fazendo a requisição é gerente
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'gerente') {
      return new Response(
        JSON.stringify({ error: 'Apenas gerentes podem criar vendedores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar usuário no Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Email já confirmado
      user_metadata: {
        nome,
        codigo_vendedor,
        telefone
      }
    })

    if (createError) {
      console.error('Erro ao criar usuário:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar perfil na tabela profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user.id,
        email,
        nome,
        codigo_vendedor,
        telefone,
        role: 'vendedor',
        ativo: true
      })

    if (profileError) {
      console.error('Erro ao criar perfil:', profileError)
      // Deletar usuário do auth se falhar ao criar perfil
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      
      return new Response(
        JSON.stringify({ error: 'Erro ao criar perfil do vendedor' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Enviar email de redefinição de senha
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.headers.get('origin')}/auth`
    })

    if (resetError) {
      console.error('Erro ao enviar email de redefinição:', resetError)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Vendedor criado com sucesso. Um email foi enviado para definir a senha.',
        user_id: newUser.user.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})