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
 */
export function normalizarCodigoErp(codigo: string | null | undefined): string {
  let s = String(codigo ?? '').trim().toUpperCase();
  s = s.replace(/\s+/g, ' ');
  // Equivale ao Python: re.sub(r"([A-Z])0*(\d+)$", r"\1\2", s)
  s = s.replace(/([A-Z])0*(\d+)$/, '$1$2');
  return s;
}
