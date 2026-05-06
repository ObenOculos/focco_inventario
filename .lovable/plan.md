## Reverter aprovação de inventário

Sim, é totalmente possível. Vou adicionar uma ação "Reverter Aprovação" para o gerente, que devolve o inventário ao status `pendente` e desfaz o snapshot de estoque real criado pela aprovação.

### Comportamento

- Disponível **apenas para gerentes** e **apenas em inventários com status `aprovado`**.
- Acessível na página **Conferência**, dentro do menu de ações do card do inventário (mesmo lugar de "Gerar Nota de Retorno").
- Abre um diálogo de confirmação explicando o impacto antes de executar.

### O que acontece ao reverter

1. Status do inventário volta de `aprovado` para `pendente` (gerente pode aprovar/rejeitar de novo, e vendedor não consegue editar pois não está em `revisao`).
2. Os registros de `estoque_real` criados por essa aprovação (filtrados por `inventario_id = X`) são **deletados**, restaurando o snapshot anterior daquele vendedor como o mais recente.
3. `updated_at` do inventário é atualizado.
4. Cache do React Query é invalidado (`inventariosPendentes`, `estoqueReal`, `estoqueTeorico`, dashboard) para refletir imediatamente.

### Salvaguardas

- **Bloqueio se não for o snapshot mais recente do vendedor**: se já existir um inventário aprovado mais recente do mesmo vendedor (ou seja, este não é mais o "ativo"), reverter quebraria o histórico subsequente. Nesse caso bloqueamos com mensagem clara: "Existe um inventário mais recente aprovado em DD/MM/AAAA. Reverta-o primeiro."
- **Aviso se já houver Nota de Retorno gerada a partir deste inventário**: mostramos alerta no diálogo, mas permitimos prosseguir (a nota já foi exportada, é responsabilidade do gerente).
- Confirmação obrigatória via texto/switch para evitar clique acidental.

### Implementação técnica

**Edge function nova:** `supabase/functions/reverter-aprovacao-inventario/index.ts`
- Valida JWT e role `gerente`.
- Verifica que o inventário está `aprovado`.
- Verifica que é o aprovado mais recente do vendedor (consulta `inventarios` por `codigo_vendedor`, status `aprovado`, `data_inventario > X`).
- `DELETE FROM estoque_real WHERE inventario_id = :id`.
- `UPDATE inventarios SET status='pendente', updated_at=now() WHERE id=:id`.
- Retorna contagem de registros removidos.
- Registrada em `supabase/config.toml` com `verify_jwt = false` (validação manual no código, padrão das outras funções).

**Frontend:**
- `src/hooks/useConferenciaQuery.ts`: adicionar `useReverterAprovacaoMutation` que invoca a edge function e invalida caches relevantes.
- `src/pages/Conferencia.tsx`:
  - Novo item "Reverter Aprovação" no `DropdownMenu`/diálogo de ações de gerente para inventários aprovados.
  - Novo `AlertDialog` de confirmação com texto explicando o impacto e o `Switch` "Confirmo que entendo".
  - Mostrar erro retornado pela edge function (ex.: "existe inventário mais recente").

### Arquivos afetados

- `supabase/functions/reverter-aprovacao-inventario/index.ts` (novo)
- `supabase/config.toml` (registrar função)
- `src/hooks/useConferenciaQuery.ts` (nova mutation)
- `src/pages/Conferencia.tsx` (UI de ação + diálogo)

Sem mudanças de schema.