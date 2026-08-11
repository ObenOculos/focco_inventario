/**
 * Alternador segmentado — escolha exclusiva entre poucas opções, todas visíveis.
 *
 * POR QUE NÃO UM SELECT: com duas ou três opções mutuamente exclusivas, o Select
 * esconde metade da escolha atrás de um clique para não mostrar nada além do que já
 * cabia na tela. O segmentado também deixa a opção ATIVA legível de relance, que é o
 * que um controle de "forma de leitura" precisa.
 *
 * POR QUE COMPARTILHADO: a tela usa dois deles em sequência — modo de leitura e submodo
 * do gestor — e o segundo é subordinado ao primeiro. Dois desenhos ligeiramente
 * diferentes (um com `shadow-xs`, outro com `shadow-2xs`) já leriam como dois controles
 * sem relação, que é exatamente o oposto do que a disposição quer dizer.
 */

interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: string;
}

interface Props<T extends string> {
  /** Vira o `aria-label` do grupo: o alternador não tem rótulo visível. */
  nome: string;
  opcoes: readonly OpcaoSegmento<T>[];
  /**
   * Aceita valor FORA das opções — nenhum segmento fica ativo.
   *
   * É o caso do submodo `detalhado` do gestor: ele não é opção do alternador (ver
   * `sufixo`), mas é o valor corrente do estado. Restringir a `T` obrigaria quem chama
   * a mentir sobre o próprio estado para satisfazer o tipo.
   */
  valor: string | null;
  onValor: (v: T) => void;
  /**
   * Segmento fixo à direita, exibido como ativo e sem ser clicável.
   *
   * Existe para o "Produtos" do gestor: é ONDE VOCÊ ESTÁ depois de descer até a folha,
   * não uma terceira opção — oferecê-lo como botão significaria "listar todos os
   * produtos", que é a listagem que o modo gestor existe para evitar.
   */
  sufixo?: string;
  /** Compacto para o alternador subordinado, que não deve competir com o principal. */
  tamanho?: 'md' | 'sm';
}

export function Segmentado<T extends string>({
  nome,
  opcoes,
  valor,
  onValor,
  sufixo,
  tamanho = 'md',
}: Props<T>) {
  // `shadow-2xs` é o repouso de controle sobre superfície no design system; `shadow-xs`
  // é o do próprio Card, e usá-lo aqui faria a pastilha flutuar acima do cartão.
  const segmento =
    tamanho === 'sm' ? 'rounded-lg px-2.5 py-1 text-2xs' : 'rounded-lg px-3 py-1.5 text-xs';

  return (
    <div
      role="group"
      aria-label={nome}
      className="flex shrink-0 items-center rounded-xl bg-muted/60 p-1"
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onValor(o.valor)}
          className={`whitespace-nowrap font-semibold transition-colors ${segmento} ${
            valor === o.valor
              ? 'bg-card text-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
      {sufixo && (
        <span
          className={`whitespace-nowrap bg-card font-semibold shadow-2xs ${segmento}`}
        >
          {sufixo}
        </span>
      )}
    </div>
  );
}
