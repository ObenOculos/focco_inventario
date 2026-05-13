## Objetivo

Adicionar uma nova aba em `Pedidos & Notas` que permite gerar XMLs no mesmo formato Ciclone usado hoje, lendo os dados diretamente de um arquivo Excel — sem consultar banco.

## Onde

`src/pages/Pedidos.tsx` — adicionar uma terceira aba (junto às atuais), chamada **"XML por Excel"**.

## Fluxo da nova aba

1. **Campos do cabeçalho** (preenchidos pelo usuário na tela):
   - Código do vendedor (texto)
   - Nome do vendedor (texto)
   - Loja (select com as mesmas lojas usadas hoje no fluxo de XML)
   - Tabela de preço: Venda / Remessa (informativo — o valor unitário virá do Excel; este campo só compõe o nome do arquivo)
   - Segmentos (1–10), igual ao fluxo atual

2. **Upload do Excel** (`.xlsx` / `.csv`) com as colunas:
   - `codigo_auxiliar` (string, formato `[MODELO] [COR]`)
   - `nome_produto` (string)
   - `quantidade` (número > 0)
   - `valor_unitario` (número ≥ 0)
   
   Botão "Baixar modelo" gera um xlsx vazio com esses cabeçalhos.

3. **Pré-visualização** dos itens lidos em tabela compacta, com:
   - Total de itens, soma de quantidades, valor total
   - Lista de erros de validação (linha X: coluna Y inválida) — bloqueia geração se houver erros
   - Linhas com quantidade 0 ou inválida são descartadas/avisadas

4. **Botão "Gerar XML"**:
   - Reaproveita `gerarXmlRetornoCiclone` de `src/lib/gerarXmlCiclone.ts`
   - Aplica a mesma segmentação por buckets (round-robin) já existente
   - 1 segmento → download direto `.xml`; 2+ → ZIP via `downloadXmlsAsZip`
   - Nome dos arquivos segue o padrão atual: `retorno-ciclone-{tabela}-loja{loja}-{vendedor}{sufixo}-{dataIso}.xml`

## Detalhes técnicos

- Leitura do Excel com `xlsx` (já presente no projeto — confirmar em `package.json`; se não, usar `bun add xlsx`).
- Toda a lógica fica em `src/pages/Pedidos.tsx` + um pequeno helper `src/lib/lerPlanilhaXmlCiclone.ts` (parse + validação) para manter o componente enxuto.
- Sem chamadas a Supabase nesta aba.
- Reutiliza `LOJAS` e os componentes de UI (Card, Tabs, Table, Button, Input, Select) já em uso na página.
- Acessibilidade: todos os inputs com `id`, `name` e `autoComplete` adequados (regra do projeto).

## Não faz parte deste plano

- Nenhuma mudança nas outras abas, no fluxo atual de geração via inventário, nem nas SQL functions / status `baixado` discutidos antes.
