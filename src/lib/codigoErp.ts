/**
 * Regras de casamento entre o código auxiliar do inventário e o do Ciclone.
 *
 * ⚠️ ESTE ARQUIVO É UM ESPELHO DE `movimentos.py` (no `erp-gateway`).
 *
 * Em todo o resto da integração o app não duplica regra nenhuma: o gateway
 * devolve o dado já classificado. Aqui não há como evitar — o gateway normaliza
 * o código que *ele* vê, mas os códigos do inventário nascem no app e precisam
 * passar pela mesma normalização para os dois lados se encontrarem.
 *
 * Se `movimentos.py` mudar (ACESSORIOS ou normalizar_codigo), este arquivo tem
 * de mudar junto. O sintoma de divergência é cruel: nenhum erro, só produtos
 * aparecendo com movimento zero e divergência igual à contagem inteira.
 */

/** Espelha `movimentos.ACESSORIOS`. Itens que não entram no inventário físico. */
const ACESSORIOS = ['DISPLAY', 'ESTOJO', 'FLANELA', 'EXP M3', 'ARM DIVERSOS'];

/** Espelha `movimentos.eh_acessorio`. */
export function ehAcessorio(codigo: string | null | undefined): boolean {
  const s = String(codigo ?? '').toUpperCase();
  return ACESSORIOS.some((a) => s.includes(a));
}

/**
 * Espelha `movimentos.normalizar_codigo`.
 *
 * Colapsa espaços e remove o zero à esquerda do sufixo de cor:
 * `'OB1038  C02'` → `'OB1038 C2'`. Sem isso, o mesmo produto entra como duas
 * chaves distintas e a reconciliação acusa divergência em tudo.
 *
 * ## ⚠️ NÃO troque este colapso por casamento exato. Já foi investigado.
 *
 * Em 2026-09-02 descobriu-se que o Ciclone tem grades DIFERENTES colapsando na mesma
 * chave — `OB1107 C01` (saldo zero) e `OB1107 C1` (cor 'PRETO V', 214 unidades). A
 * tentação óbvia é passar a casar por grafia exata aqui também. **Seria pior**, e foi
 * medido antes de decidir:
 *
 * - As grafias são cadastros DUPLICADOS da mesma cor física, não produtos distintos.
 *   O `OB1101` tem três: cores `'C 1'`, `'C01'` e `'C001'`, com referências cruzadas.
 * - Nas notas de 2026 (escopo da mala, 10.511 linhas, 1.669 chaves), só **5 chaves**
 *   colidem, somando **56 unidades** — e as duas pontas da reconciliação passam pela
 *   MESMA normalização, então a conta sempre fechou.
 * - Separá-las criaria divergência FALSA: o representante conta 10 de um produto, o
 *   ERP registra 8 numa grafia e 2 na outra, e a segunda linha acusaria falta.
 *
 * Onde a colisão MACHUCA é onde os dois lados não passam pela mesma normalização — o
 * saldo por SKU da Reposição da mala, que casa o ERP contra o catálogo do app. Lá a
 * regra é outra e está em `lib/reposicaoMala.ts`: o colapso vale enquanto for
 * reversível, e chave alcançada por duas grafias exige grafia exata.
 *
 * O que mudou de verdade em `movimentos.py` foi só o RÓTULO da linha agregada: era a
 * primeira grafia que o banco devolvesse, agora é a que carrega mais unidades.
 */
export function normalizarCodigoErp(codigo: string | null | undefined): string {
  let s = String(codigo ?? '').trim().toUpperCase();
  s = s.replace(/\s+/g, ' ');
  // Equivale ao Python: re.sub(r"([A-Z])0*(\d+)$", r"\1\2", s)
  s = s.replace(/([A-Z])0*(\d+)$/, '$1$2');
  return s;
}
