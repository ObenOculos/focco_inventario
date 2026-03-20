

# Modal de seleção de loja no export XML Ciclone

## O que muda

Ao clicar em "Exportar XML Ciclone", em vez de exportar direto, abre um modal (Dialog) para o usuário escolher entre **Loja 01** e **Loja 02**. Após selecionar, o XML é gerado e baixado.

O valor da loja selecionada será usado no campo `<pgemp_codigo>` do XML (atualmente fixo em `1`). Loja 01 = `1`, Loja 02 = `2`.

## Alterações

### `src/pages/NotaRetorno.tsx`
- Adicionar estado `lojaDialogOpen` e `selectedLoja`
- No botão "Exportar XML Ciclone", ao invés de gerar direto, abrir um Dialog com duas opções (Loja 01 / Loja 02)
- Ao selecionar a loja, chamar `gerarXmlRetornoCiclone` passando o código da loja e fazer o download
- Usar o componente `Dialog` já existente no projeto

### `src/lib/gerarXmlCiclone.ts`
- Adicionar `codigoLoja` (number) ao `GerarXmlParams`
- Usar `codigoLoja` no campo `<pgemp_codigo>` em vez do valor fixo `1` (aparece 3 vezes: registro principal + sub-registro cliente)

2 arquivos alterados.

