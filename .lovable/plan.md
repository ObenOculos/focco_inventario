

# Gerar XML Ciclone na Pagina Nota de Retorno

## Resumo

Adicionar um botao "Exportar XML Ciclone" na pagina Nota de Retorno existente. Ao clicar, o sistema gera um arquivo XML no formato exato do Ciclone (estrutura `pedidovenda`) com os itens selecionados para retorno e faz o download automatico.

## Abordagem

A geracao do XML sera feita diretamente no frontend (sem necessidade de edge function), pois todos os dados necessarios ja estao disponiveis na pagina: codigo do vendedor, itens com quantidades, valores e codigo do produto. O XML sera montado em memoria e baixado como arquivo.

## Estrutura do XML Ciclone

O XML seguira exatamente o modelo fornecido:

```text
<ciclone>
  <id>pedidovenda</id>
  <registro>
    <id>ws_api_pedido</id>
    <ws_api_pedido_uuid>[UUID gerado]</ws_api_pedido_uuid>
    <pgemp_codigo>1</pgemp_codigo>
    <pgfll_codigo>1</pgfll_codigo>
    <pgwsm_codigo>4</pgwsm_codigo>
    <wsapd_empresa>1.:.1</wsapd_empresa>
    <wsapd_origem>STORMSYSTEM</wsapd_origem>
    <wsapd_vendedor>[codigo_vendedor]</wsapd_vendedor>
    <wsapd_valortotal>[valor total]</wsapd_valortotal>
    ... (demais campos do pedido)
    <subregistro>
      <id>ws_api_cliente</id>
      ... (vendedor como "cliente" para ajuste interno)
    </subregistro>
    <subregistro>
      <id>ws_api_pedidoitem</id>
      <wsapi_produtocodigo>[codigo_produto]</wsapi_produtocodigo>
      <wsapi_quantidade>[quantidade]</wsapi_quantidade>
      <wsapi_valorunitario>[valor]</wsapi_valorunitario>
      ...
    </subregistro>
  </registro>
</ciclone>
```

## Alteracoes Necessarias

### 1. Buscar `codigo_produto` dos produtos (src/hooks/useNotaRetornoQuery.ts)

O XML precisa do campo `codigo_produto` (codigo do produto no Ciclone), que atualmente nao e buscado pelo hook `useEstoqueRealVendedorQuery`. Sera adicionado ao SELECT da tabela `produtos` e incluido no retorno do hook.

### 2. Funcao de geracao XML (src/lib/gerarXmlCiclone.ts)

Criar um arquivo utilitario com a funcao `gerarXmlRetornoCiclone()` que:
- Recebe os itens de retorno (com codigo_produto, quantidade, valor), dados do vendedor e timestamp
- Gera um UUID para o pedido
- Monta a string XML com todos os campos no formato Ciclone
- Campos fixos: `pgemp_codigo=1`, `pgfll_codigo=1`, `pgwsm_codigo=4`
- Sub-registro `ws_api_cliente`: usa codigo_vendedor como cliente (operacao interna)
- Sub-registros `ws_api_pedidoitem`: um por item, com sequencia, codigo_produto, nome, quantidade, valor
- Retorna a string XML pronta

### 3. Botao na pagina NotaRetorno (src/pages/NotaRetorno.tsx)

- Adicionar botao "Exportar XML Ciclone" ao lado do botao "Exportar Excel" existente (linha 370)
- Ao clicar, chama a funcao de geracao e dispara download do arquivo `.xml`
- O botao so aparece quando ha itens com quantidade de retorno > 0

### Mapeamento de Campos

| Campo XML | Origem no Sistema |
|---|---|
| `wsapd_vendedor` | `profiles.codigo_vendedor` |
| `wsapi_produtocodigo` | `produtos.codigo_produto` |
| `wsapi_quantidade` | Quantidade de retorno definida pelo usuario |
| `wsapi_valorunitario` | `produtos.valor_produto` |
| `wsapi_produtonome` | `produtos.nome_produto` |
| `wsapd_valortotal` | Soma de (quantidade x valor) de todos os itens |

### Arquivos a Criar

- `src/lib/gerarXmlCiclone.ts` - Funcao utilitaria de geracao do XML

### Arquivos a Modificar

- `src/hooks/useNotaRetornoQuery.ts` - Incluir `codigo_produto` na busca de produtos
- `src/pages/NotaRetorno.tsx` - Adicionar botao de exportacao XML e handler de download

