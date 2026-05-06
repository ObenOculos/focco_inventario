
## Contexto

A aba **"Nota de Retorno"** em `/pedidos` é uma **tela de criação** de nova nota (mostra o estoque real atual do vendedor para você decidir o que retornar). Não é histórico.

A nota que o Charles gerou (`RET-8-1778098588100`, 825 itens, 931 unidades, R$ 88.130,90) **existe e está íntegra** no banco. Ela aparece em **aba "Consultar Pedidos" → filtro Tipo: Retorno**.

Os "8 itens" que aparecem são o que sobrou de saldo no estoque real do Charles depois da nota de retorno e da aprovação do 3º inventário (que ele fez *depois* da nota).

## O problema real é de UX

O rótulo "Nota de Retorno" induz o gerente a pensar que vai ver a nota emitida. Vou ajustar a UI para deixar claro que é uma ferramenta de criação.

## Mudanças propostas em `src/pages/Pedidos.tsx`

1. **Renomear a aba** de "Nota de Retorno" → **"Gerar Nota de Retorno"**.
2. **Adicionar um banner contextual** no topo da aba quando o vendedor tem nota(s) de retorno recentes (últimas 24h):
   - "Última nota gerada: `RET-8-...` em 06/05/2026 — 825 itens, R$ 88.130,90. [Ver detalhes]"
   - O botão "Ver detalhes" leva para a aba **Consultar Pedidos** já filtrada por aquele vendedor + tipo Retorno.
3. **Atualizar o texto do header** do card "Selecionar Vendedor":
   - Antes: "Escolha o vendedor para gerar a nota de retorno do estoque"
   - Depois: "Esta tela cria uma **nova** nota de retorno com base no estoque real atual. Para consultar notas já emitidas, use a aba **Consultar Pedidos** (filtro: Retorno)."
4. **Reforçar o aviso azul** existente (linha 562-566) deixando explícito: "Se você já emitiu uma nota de retorno hoje, ela não aparece aqui — use Consultar Pedidos."

## Detalhe técnico

- Nenhuma migração SQL necessária.
- Para o banner do item 2, reaproveitar `usePedidosPaginatedQuery` filtrando `tipoFilter='3'`, `vendedorFilter=selectedVendedor`, `pageSize=1`, e exibir o pedido mais recente se `data_emissao` for de até 24h atrás.
- Sem mudanças em edge functions, hooks ou banco.

## Fora de escopo

- Não vou recriar/reaprovar nada no banco — os dados estão corretos.
- Não vou mudar o comportamento de `get_estoque_real_vendedor` (está certo: retornar o estado mais recente).
