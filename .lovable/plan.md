
# Usar codigo_auxiliar no XML Ciclone

## Alteracao

Trocar o campo usado como codigo do produto no XML de `codigo_produto` para `codigo_auxiliar` em todos os pontos:

### 1. `src/lib/gerarXmlCiclone.ts`
- Renomear o campo `codigo_produto` para `codigo_auxiliar` na interface `ItemXmlCiclone`
- Atualizar a referencia no template XML: `<wsapi_produtocodigo>${escapeXml(item.codigo_auxiliar)}</wsapi_produtocodigo>`

### 2. `src/pages/NotaRetorno.tsx`
- Na montagem do array `itensXml` (linha 381), trocar `codigo_produto: item.codigo_produto` para `codigo_auxiliar: item.codigo_auxiliar`

Resultado: o campo `<wsapi_produtocodigo>` no XML passara a conter o valor do `codigo_auxiliar` (ex: "OB1007 A01") em vez do `codigo_produto`.
