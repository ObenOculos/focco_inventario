## Objetivo

Permitir, ao gerar o XML Ciclone de retorno, dividir os itens em **N pedidos** (de 1 a 10). Cada pedido segmentado terá um `pedido_uuid` e `pedido_numero` próprios (IDs distintos), mas representará o mesmo retorno do mesmo vendedor, distribuído em vários XMLs.

## Comportamento

- No diálogo "Gerar XML Ciclone" (`src/pages/Pedidos.tsx`), além da escolha de Tabela de Preço e Loja, adicionar um campo **"Segmentar em quantos pedidos?"** (Select de 1 a 10, padrão = 1).
- Ao clicar na loja:
  - Se segmentos = 1 → comportamento atual (1 XML único).
  - Se segmentos > 1 → gerar **N XMLs separados**, cada um com seu próprio `pedidoUuid`, `clienteUuid` e `pedidoNumero`, baixados em sequência. Nome do arquivo recebe sufixo `-parte{i}-de-{N}`.
- Distribuição dos itens: round-robin pelos itens com `quantidade_retorno > 0`. Cada item inteiro vai para um único pedido (não fracionamos a quantidade de um mesmo SKU). Se segmentos > nº de itens, geramos apenas até o nº de itens (avisando o usuário com toast).
- Cada XML continua válido individualmente: o `valor_total` é recalculado por segmento (já é feito dentro de `gerarXmlRetornoCiclone`).

## Por que round-robin de itens inteiros

- Mantém o XML simples e o ERP Ciclone recebendo quantidades íntegras por linha (sem quebrar SKU).
- Evita risco de divergência de arredondamento ao dividir quantidades.
- Se no futuro quiser dividir por quantidade (ex.: quebrar um item de 50 peças em 2x 25), abrimos como evolução.

## Detalhes técnicos

### `src/lib/gerarXmlCiclone.ts`
- `generatePedidoNumero` hoje usa `YYYYMMDDHHMMSS` + dígitos do vendedor. Para garantir IDs distintos quando vários XMLs são gerados no mesmo segundo, aceitar um parâmetro opcional `sequencia?: number` em `gerarXmlRetornoCiclone` e concatenar ao final do `pedidonumero` (ex.: `...HHMMSS01`, `...HHMMSS02`). O `pedidoUuid` já é aleatório por chamada — segue único naturalmente.
- Nenhuma mudança estrutural no XML.

### `src/pages/Pedidos.tsx`
- Novo estado `segmentos: number` (default 1).
- Novo `<Select>` no dialog (1..10) entre o bloco Tabela de Preço e o bloco Loja.
- Refatorar o `onClick` da loja para:
  1. Filtrar itens com `quantidade_retorno > 0`.
  2. Se `segmentos > itens.length`, ajustar `effectiveSegmentos = itens.length` e exibir toast informativo.
  3. Distribuir em `effectiveSegmentos` arrays via round-robin.
  4. Para cada bucket: chamar `gerarXmlRetornoCiclone({...itens: bucket, sequencia: i+1})` e `downloadXml` com nome `retorno-ciclone-{tabelaPreco}-loja{codigo}-{vendedor}-parte{i+1}-de-{N}-{data}.xml`. Quando `N=1`, manter nome atual (sem sufixo de parte).
  5. Toast final com total de arquivos gerados; fechar dialog.
- Resetar `segmentos` para 1 quando o dialog fechar.

## Arquivos a alterar

- `src/lib/gerarXmlCiclone.ts` — adicionar parâmetro opcional `sequencia` para diferenciar `pedidonumero`.
- `src/pages/Pedidos.tsx` — novo Select de segmentos + lógica de distribuição e download múltiplo.

## Fora de escopo

- Dividir quantidades de um mesmo SKU entre pedidos (pode virar evolução futura).
- Alterar a edge function `criar-nota-retorno` (continua gerando 1 nota só, como hoje).
