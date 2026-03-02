

# Analise de Redundancias no Projeto

## 1. Arquivo de tipos duplicado: `src/types/database.ts`

O arquivo `src/types/database.ts` e uma copia quase identica de `src/types/app.ts`. Ambos definem os mesmos tipos: `Profile`, `Produto`, `Pedido`, `ItemPedido`, `Inventario`, `ItemInventario`, `UserRole`, `InventoryStatus`, `DivergenciaItem`, `MetricConfig`, `MetricDataPoint`, `EstoqueItem`, `ExcelRow`.

**Nenhum arquivo no projeto importa de `src/types/database.ts`** — todos usam `src/types/app.ts`.

**Acao:** Deletar `src/types/database.ts` completamente. E codigo morto.

---

## 2. MobileContext e redundante com useIsMobile

O `MobileContext` (`src/contexts/MobileContext.tsx`) e apenas um wrapper fino em volta do hook `useIsMobile`. Ele nao adiciona nenhuma logica extra — so repassa o valor.

Porem, ele e usado em 2 componentes (`ControleVendedores`, `VendedorEstoqueCard`), enquanto `useIsMobile` e usado diretamente em outros 2 (`Inventario`, `sidebar.tsx`). Isso cria inconsistencia — metade do codigo usa o Context, metade usa o hook direto.

**Acao sugerida:** Padronizar para usar `useIsMobile` direto em todos os lugares e remover o `MobileContext` e o `MobileProvider` do `App.tsx`. O hook ja faz exatamente a mesma coisa sem a complexidade extra do Context.

**Impacto:** 4 arquivos alterados (`App.tsx`, `ControleVendedores.tsx`, `VendedorEstoqueCard.tsx`, deletar `MobileContext.tsx`).

---

## 3. Tipo `EstoqueAteDataItem` e `ComparacaoInventarioItem` nao utilizados

Em `src/types/app.ts`, os tipos `EstoqueAteDataItem` e `ComparacaoInventarioItem` estao definidos mas nao sao importados em nenhum outro arquivo do projeto.

**Acao:** Remover esses dois tipos de `src/types/app.ts`.

---

## 4. Formatacao de data duplicada em `gerarXmlCiclone.ts`

As funcoes `generatePedidoNumero` e `formatDateTime` fazem a mesma extracao de componentes de data (ano, mes, dia, hora, minuto, segundo) de formas levemente diferentes. Poderiam compartilhar a logica de extracao.

**Acao:** Refatorar para extrair os componentes de data uma unica vez e reutilizar. E um corte menor, mas melhora legibilidade.

---

## Resumo de acoes

| Prioridade | Acao | Tipo |
|---|---|---|
| Alta | Deletar `src/types/database.ts` | Codigo morto |
| Media | Remover `MobileContext`, usar `useIsMobile` direto | Redundancia |
| Baixa | Remover tipos nao usados de `app.ts` | Limpeza |
| Baixa | Unificar formatacao de data no XML | Refatoracao menor |

