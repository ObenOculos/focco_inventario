# Solução para Limite de 1000 Linhas em RPCs do Supabase

## Problema Identificado

As funções RPC (Remote Procedure Call) do Supabase via PostgREST têm um **limite hardcoded de 1000 linhas** por chamada. Mesmo usando `.limit(10000)` no cliente JavaScript, o limite permanece em 1000 linhas.

Isso afetava a página **EstoqueTeorico** que precisa carregar mais de 1366 produtos.

## Solução Implementada

### 1. Funções SQL Paginadas

Foram criadas versões paginadas das seguintes funções RPC:

- `comparar_estoque_teorico_vs_real_paginado`
- `calcular_estoque_vendedor_paginado`
- `comparar_estoque_inventario_paginado`
- `get_entradas_pedidos_paginado`
- `get_saidas_pedidos_paginado`

Cada função aceita parâmetros `p_limit` (padrão: 500) e `p_offset` (padrão: 0).

### 2. Função de Busca em Lotes no Frontend

Implementada `fetchComparacaoInBatches()` que:
- Faz múltiplas chamadas RPC paginadas
- Busca em lotes de 500 registros
- Continua até não haver mais dados
- Consolida todos os resultados

### 3. Atualização do Hook

O `useEstoqueTeoricoQuery` agora usa a função paginada para:
- Vendedores individuais
- Cenário "Todos Vendedores" (consolidado)

## Como Aplicar a Solução

### 1. Executar o SQL

Execute o arquivo `fix_supabase_rpc_pagination.sql` no seu banco Supabase:

```sql
-- Execute todo o conteúdo do arquivo fix_supabase_rpc_pagination.sql
```

### 2. Atualizar Tipos (já feito)

Os tipos TypeScript foram atualizados em `src/integrations/supabase/types.ts` para incluir a nova função paginada.

### 3. Testar

A página EstoqueTeorico agora deve carregar todos os produtos corretamente, mesmo acima de 1000 registros.

## Benefícios

- ✅ Remove limite de 1000 linhas para funções críticas
- ✅ Solução escalável para crescimento futuro
- ✅ Mantém compatibilidade com código existente
- ✅ Padrão consistente para todas as RPCs afetadas

## Monitoramento

Após aplicar, verifique se:
- A página EstoqueTeorico carrega todos os produtos
- Não há erros de timeout ou performance
- Os filtros e paginação continuam funcionando