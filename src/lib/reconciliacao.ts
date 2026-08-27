/**
 * A conta que reconcilia uma contagem física com os movimentos do ERP.
 *
 * ESTE ARQUIVO É A ÚNICA CÓPIA DA FÓRMULA. Duas telas fazem a mesma pergunta —
 * Comparar Inventários ("qual produto divergiu entre A e B") e Conferência ("o que
 * esta contagem deveria ter, segundo as notas") — e o gateway devolve de propósito
 * só o FATO (`/movimentos` agrega remessa e venda por produto e para por aí), para
 * que a conta exista num lugar só. Se ela for reescrita numa das telas, as duas
 * discordam meses depois e ninguém sabe qual está certa.
 */

/**
 * Estoque que a papelada prevê para a contagem seguinte.
 *
 * `ancora` é a quantidade GRAVADA do inventário anterior — não a original, a
 * corrigida. É isso que faz a correção manual fechar: ver `janelaDeReconciliacao`.
 */
export function calcularEsperado(ancora: number, remessa: number, venda: number): number {
  return ancora + remessa - venda;
}

/** `2026-06-11` → `2026-06-12`. Sem passar por Date local, que desloca por fuso. */
export function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface Janela {
  de: string;
  ate: string;
}

/**
 * A janela de movimentos entre duas contagens.
 *
 * COMEÇA NO DIA SEGUINTE À ÂNCORA, e esse `+1` é o que impede a duplicidade de
 * borda. O gateway filtra com `BETWEEN de AND ate` — inclusivo dos dois lados (ver
 * `db.consultar_pedidos`). Com `[dA, dB]` seguido de `[dB, dC]`, a nota emitida
 * exatamente em `dB` entra nas DUAS janelas e a peça é contada duas vezes, sem que
 * nada na tela indique isso. Com `[dA+1, dB]` e `[dB+1, dC]` as janelas ladrilham a
 * linha do tempo, cada nota cai em exatamente uma.
 *
 * O lado escolhido também é o honesto: a contagem de `dA` já reflete tudo que
 * aconteceu até o fim de `dA`. A consulta ao ERP é por DATA e `data_inventario` tem
 * hora, então uma das duas pontas do dia sempre erra — errar por omissão é melhor:
 * omissão vira uma divergência visível uma vez, duplicidade infla em silêncio.
 *
 * ⚠️ O QUE ESTA FUNÇÃO NÃO RESOLVE: a nota emitida DEPOIS do envio físico. A
 * mercadoria saiu antes da contagem de 11/06 (e está contada nela), mas a nota é de
 * 18/06 e cai na janela seguinte — a peça aparece duas vezes. Nenhuma regra de data
 * conserta isso, porque o ERP não guarda a data física. O que salva é a defasagem ser
 * de FASE, não de quantidade: a mesma nota vira SOBRA na janela que termina antes da
 * emissão e FALTA na janela que a contém. Corrigir o inventário anterior para o
 * Esperado acerta as duas de uma vez — e acerta em definitivo porque a âncora da
 * próxima janela é a quantidade GRAVADA, já corrigida.
 */
export function janelaDeReconciliacao(dataAncora: string, dataFinal: string): Janela {
  return { de: diaSeguinte(dataAncora), ate: dataFinal };
}

/** Início posterior ao fim é janela vazia — e uma consulta que não pode dar certo. */
export function janelaValida(j: { de: string | null; ate: string | null }): boolean {
  return !!j.de && !!j.ate && j.de <= j.ate;
}

/** O movimento agregado de um produto, como o gateway devolve. */
export interface MovimentoDoProduto {
  remessa: number;
  venda: number;
}

export const SEM_MOVIMENTO_DO_PRODUTO: MovimentoDoProduto = { remessa: 0, venda: 0 };

/**
 * Lê os dois mapas de movimento de uma vez.
 *
 * São dois porque cada lado tem a SUA janela: a data em que o ERP registra a remessa
 * não é a em que a mercadoria entra na mala, e a venda costuma ser faturada depois da
 * entrega. Quando as janelas coincidem — que é o padrão — as chaves de cache ficam
 * idênticas e o react-query faz uma requisição só.
 */
export function movimentoDoProduto(
  chave: string,
  remessaPorChave: ReadonlyMap<string, { remessa: number }>,
  vendaPorChave: ReadonlyMap<string, { venda: number }>
): MovimentoDoProduto {
  return {
    remessa: remessaPorChave.get(chave)?.remessa ?? 0,
    venda: vendaPorChave.get(chave)?.venda ?? 0,
  };
}
