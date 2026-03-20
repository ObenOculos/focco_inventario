interface ItemXmlCiclone {
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
}

interface GerarXmlParams {
  codigoVendedor: string;
  nomeVendedor: string;
  codigoLoja: number;
  itens: ItemXmlCiclone[];
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDateParts(date: Date) {
  return {
    yyyy: date.getFullYear(),
    mm: String(date.getMonth() + 1).padStart(2, '0'),
    dd: String(date.getDate()).padStart(2, '0'),
    hh: String(date.getHours()).padStart(2, '0'),
    min: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  };
}

function generatePedidoNumero(codigoVendedor: string, date: Date): string {
  const digits = codigoVendedor.replace(/\D/g, '');
  const { yyyy, mm, dd, hh, min, ss } = getDateParts(date);
  return `${digits}${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

function formatDateTime(date: Date): string {
  const { dd, mm, yyyy, hh, min, ss } = getDateParts(date);
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function gerarXmlRetornoCiclone({ codigoVendedor, nomeVendedor, codigoLoja, itens }: GerarXmlParams): string {
  const pedidoUuid = generateUUID();
  const clienteUuid = generateUUID();
  const now = new Date();
  const dataHora = formatDateTime(now);
  const dataEmissao = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} 00:00:00`;

  const valorTotal = itens.reduce((acc, item) => acc + item.quantidade * item.valor_unitario, 0);

  // Build item sub-registros
  const itensXml = itens
    .map((item, index) => {
      const subtotal = item.quantidade * item.valor_unitario;
      return `<subregistro><id>ws_api_pedidoitem</id><ws_api_pedido_uuid>${pedidoUuid}</ws_api_pedido_uuid><wsapi_sequecia>${index + 1}</wsapi_sequecia><wsapi_datahoraregistro>${dataHora}</wsapi_datahoraregistro><wsapi_produtocodigo>${escapeXml(item.codigo_auxiliar)}</wsapi_produtocodigo><wsapi_produtonome>${escapeXml(item.nome_produto)}</wsapi_produtonome><wsapi_quantidade>${formatNumber(item.quantidade)}</wsapi_quantidade><wsapi_valorunitario>${formatNumber(item.valor_unitario)}</wsapi_valorunitario><wsapi_tabelapreco>0</wsapi_tabelapreco><wsapi_valortotal>${formatNumber(subtotal)}</wsapi_valortotal><wsapi_observacao></wsapi_observacao><wsapi_extras></wsapi_extras></subregistro>`;
    })
    .join('');

  // Build cliente sub-registro (vendedor as "cliente" for internal adjustment)
  const clienteXml = `<subregistro><id>ws_api_cliente</id><ws_api_cliente_uuid>${clienteUuid}</ws_api_cliente_uuid><ws_api_pedido_uuid>${pedidoUuid}</ws_api_pedido_uuid><pgemp_codigo>1</pgemp_codigo><pgfll_codigo>1</pgfll_codigo><pgwsm_codigo>1</pgwsm_codigo><wsacl_datahoraregistro>${dataHora}</wsacl_datahoraregistro><wsacl_cliente>${escapeXml(codigoVendedor)}</wsacl_cliente><wsacl_razaosocial>${escapeXml(nomeVendedor)}</wsacl_razaosocial><wsacl_nomefantasia>${escapeXml(nomeVendedor)}</wsacl_nomefantasia><wsacl_cpfcnpj></wsacl_cpfcnpj><wsacl_rgie></wsacl_rgie><wsacl_iesuframa></wsacl_iesuframa><wsacl_cep></wsacl_cep><wsacl_rua></wsacl_rua><wsacl_numero></wsacl_numero><wsacl_complemento></wsacl_complemento><wsacl_bairro></wsacl_bairro><wsacl_cidade></wsacl_cidade><wsacl_estado></wsacl_estado><wsacl_entregacep></wsacl_entregacep><wsacl_entregarua></wsacl_entregarua><wsacl_entreganumero></wsacl_entreganumero><wsacl_entregacomplemento></wsacl_entregacomplemento><wsacl_entregabairro></wsacl_entregabairro><wsacl_entregacidade></wsacl_entregacidade><wsacl_entregaestado></wsacl_entregaestado><wsacl_atividade></wsacl_atividade><wsacl_contatonome></wsacl_contatonome><wsacl_telefone></wsacl_telefone><wsacl_celular></wsacl_celular><wsacl_extras></wsacl_extras></subregistro>`;

  const xml = `<ciclone><id>pedidovenda</id><registro><id>ws_api_pedido</id><ws_api_pedido_uuid>${pedidoUuid}</ws_api_pedido_uuid><pgemp_codigo>1</pgemp_codigo><pgfll_codigo>1</pgfll_codigo><pgwsm_codigo>1</pgwsm_codigo><wsapd_empresa>1.:.1</wsapd_empresa><wsapd_origem>FOCCO_BRASIL</wsapd_origem><wsapd_datahoraregistro>${dataHora}</wsapd_datahoraregistro><wsapd_situacao>D</wsapd_situacao><wsapd_pedidouuid></wsapd_pedidouuid><wsapd_pedidonumero>${generatePedidoNumero(codigoVendedor, now)}</wsapd_pedidonumero><wsapd_datahoraaberturaemissao>${dataEmissao}</wsapd_datahoraaberturaemissao><wsapd_datahorafechamento>${dataHora}</wsapd_datahorafechamento><wsapd_valorfrete></wsapd_valorfrete><wsapd_valortotal>${formatNumber(valorTotal)}</wsapd_valortotal><wsapd_valortotalliquido>${formatNumber(valorTotal)}</wsapd_valortotalliquido><wsapd_tipopedido>0</wsapd_tipopedido><wsapd_vendedor>${escapeXml(codigoVendedor)}</wsapd_vendedor><wsapd_condicaopagamento>0</wsapd_condicaopagamento><wsapd_condicaopagamentodesc>A VISTA.</wsapd_condicaopagamentodesc><wsapd_formapagamento>0</wsapd_formapagamento><wsapd_transportadora>0</wsapd_transportadora><wsapd_transportadoradesc></wsapd_transportadoradesc><wsapd_observacao>RETORNO DE ESTOQUE - GERADO AUTOMATICAMENTE</wsapd_observacao><wsapd_versaodados></wsapd_versaodados><wsapd_extras></wsapd_extras>${clienteXml}${itensXml}</registro></ciclone>`;

  return xml;
}

export function downloadXml(xmlContent: string, fileName: string) {
  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
