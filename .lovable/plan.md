

# Gerar numero de pedido unico no XML Ciclone

## Problema
O campo `<wsapd_pedidonumero>` no XML esta vazio. O usuario quer um codigo de pedido unico, somente numerico.

## Solucao

Gerar um numero de pedido no formato: `{codigoVendedor}{YYYYMMDD}{HHmmss}`

Exemplo: `2720260302143025` (vendedor 27, em 02/03/2026 as 14:30:25)

Somente numeros, sem letras. Unicidade garantida pela combinacao de vendedor + data/hora com precisao de segundo.

## Alteracao tecnica

### `src/lib/gerarXmlCiclone.ts`
- Criar funcao `generatePedidoNumero(codigoVendedor: string)` que extrai apenas os digitos do codigo do vendedor e concatena com `YYYYMMDDHHmmss`
- Preencher `<wsapd_pedidonumero>` com o valor gerado

Apenas 1 arquivo alterado, ~5 linhas adicionadas.

