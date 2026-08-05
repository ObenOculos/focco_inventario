import { useMemo, useState } from 'react';

/**
 * Recorte por ano para listas de inventário.
 *
 * As telas que listam inventários mostram *todo* o histórico, e a lista só cresce. O ano é
 * o recorte mais amplo, sempre aplicado antes de vendedor e status.
 *
 * **Padrão com recuo.** O ano corrente vence quando tem inventários — o caso normal. Quando
 * não tem (janeiro, ou um ano ainda sem contagens), cai para o ano mais recente com dados,
 * porque abrir a tela com a lista vazia parece defeito. Por isso o estado guardado é `null`
 * até o usuário escolher: fixar o ano corrente no `useState` travaria justamente esse caso.
 */
export function useFiltroAno<T extends { data_inventario: string }>(itens: T[]) {
  const [anoEscolhido, setAno] = useState<string | null>(null);

  /** Anos com inventário, do mais recente para o mais antigo. */
  const anos = useMemo(
    () =>
      Array.from(
        new Set(itens.map((i) => String(new Date(i.data_inventario).getFullYear())))
      ).sort((a, b) => b.localeCompare(a)),
    [itens]
  );

  const ano = useMemo(() => {
    if (anoEscolhido) return anoEscolhido;
    if (anos.length === 0) return 'todos';
    const atual = String(new Date().getFullYear());
    return anos.includes(atual) ? atual : anos[0];
  }, [anoEscolhido, anos]);

  const itensDoAno = useMemo(
    () =>
      ano === 'todos'
        ? itens
        : itens.filter((i) => String(new Date(i.data_inventario).getFullYear()) === ano),
    [itens, ano]
  );

  return { anos, ano, setAno, itensDoAno };
}
