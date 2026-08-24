import type { NoComparativo } from '@/lib/panoramaComparativo';
import type { Medida } from '@/lib/panorama';

/**
 * Faixa de indicadores — a equação do período e a posição de hoje, lado a lado.
 *
 * Ela acompanha o RECORTE ABERTO, não o período inteiro: com OBEN aberto, os números
 * são de OBEN. Um total que não fosse o da lista logo abaixo seria pior que nenhum.
 *
 * A ordem conta a história na sequência em que se lê: o que entrou, o que saiu, o que
 * sobrou disso, onde está hoje, por quanto tempo dá, e se a contagem confirma.
 */

import { comSinal, curto, exato, inteiro, moeda, moedaCurta } from '@/lib/panoramaFormato';

function Indicador({
  rotulo,
  valor,
  apoio,
  titulo,
  ajuda,
  heroi,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  /** O valor exato, para quem passa o mouse conferindo. */
  titulo?: string;
  /** Explicação do conceito, para quem não é do ramo. Vira `title` do rótulo. */
  ajuda?: string;
  /**
   * UM cartão manda na faixa, e é sempre o mesmo.
   *
   * Antes três dos seis tinham borda de destaque, o que anulava o destaque: se tudo é
   * importante, nada é. Quem chega na tela precisa de um número para ancorar a leitura,
   * e esse número é o estoque de hoje — é a pergunta que trouxe a pessoa aqui.
   */
  heroi?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card px-3.5 py-2.5 shadow-xs ${
        heroi
          ? 'min-w-[13rem] flex-[2] border-primary/50'
          : 'min-w-[8.5rem] flex-1 border-border/80'
      }`}
    >
      <p
        className={`text-2xs font-semibold uppercase tracking-wider ${
          heroi ? 'text-primary' : 'text-muted-foreground'
        } ${ajuda ? 'cursor-help' : ''}`}
        title={ajuda}
      >
        {rotulo}
        {ajuda && <span aria-hidden> ⓘ</span>}
      </p>
      {/* `truncate` + `title`: o cartão tem largura mínima e o número curto quase
          sempre cabe, mas "quase sempre" não é garantia — e cortar é melhor que
          transbordar por cima do cartão vizinho. */}
      <p
        className={`truncate font-bold tabular-nums ${heroi ? 'text-2xl' : 'text-lg'}`}
        title={titulo}
      >
        {valor}
      </p>
      <p className="truncate text-2xs tabular-nums text-muted-foreground">{apoio}</p>
    </div>
  );
}

interface Props {
  total: NoComparativo;
  medida: Medida;
  /** Ex.: `mai–jul/26`. A base da cobertura, exibida junto do número. */
  baseCobertura: string;
}

export function FaixaIndicadores({ total, medida, baseCobertura }: Props) {
  const numero = (t: { quantidade: number; valor: number }) => curto(t, medida);
  const estoque = { quantidade: total.estoqueTotal, valor: total.interno.valor + total.externo.valor };

  return (
    <div className="flex flex-wrap gap-3">
      {/* O herói vem PRIMEIRO: é o que a pessoa veio ver, e a leitura em português é da
          esquerda para a direita. Depois dele, a história do período. */}
      <Indicador
        rotulo="Estoque hoje"
        valor={numero(estoque)}
        titulo={exato(estoque)}
        apoio={`${inteiro(total.interno.quantidade)} na empresa · ${inteiro(total.externo.quantidade)} nas malas`}
        ajuda="Quanto existe agora, somando o que está na empresa e o que está nas malas dos representantes. Não muda com o período escolhido."
        heroi
      />
      <Indicador
        rotulo="Entrou"
        valor={numero(total.entrou)}
        titulo={exato(total.entrou)}
        ajuda="Compras e devoluções recebidas no período. Remessa para representante não conta: ela só troca a mercadoria de lugar."
        apoio={medida === 'valor' ? `${inteiro(total.entrou.quantidade)} un.` : moeda(total.entrou.valor)}
      />
      <Indicador
        rotulo="Saiu"
        valor={numero(total.saiu)}
        titulo={exato(total.saiu)}
        ajuda="Vendas e bonificações no período. Remessa para representante não conta: a mercadoria continua sendo nossa, só mudou de lugar."
        apoio={medida === 'valor' ? `${inteiro(total.saiu.quantidade)} un.` : moeda(total.saiu.valor)}
      />
      <Indicador
        rotulo="Saldo do período"
        valor={comSinal(total.saldoPeriodo)}
        apoio={`${comSinal(total.paraMala)} foram para as malas`}
        ajuda="O que entrou menos o que saiu no período. Positivo, o estoque cresceu; negativo, encolheu."
      />
      <Indicador
        rotulo="Cobertura"
        ajuda={
          'Por quantos meses o estoque de hoje dura, no ritmo de saída dos últimos meses ' +
          'completos. A base é fixa e não muda com o período que você escolheu para ver. ' +
          'Em linha sazonal (solar), prefira a base de 12 meses.'
        }
        valor={total.cobertura === null ? '—' : `${total.cobertura.toFixed(1)} meses`}
        apoio={
          total.cobertura === null
            ? `sem saída em ${baseCobertura}`
            : `${inteiro(total.porMes)} un./mês · base ${baseCobertura}`
        }
      />
      {/* Só aparece onde houve contagem. Sem inventário não há divergência: há ausência
          de medida, e um número ali acusaria um sumiço que ninguém apurou. */}
      {total.divergencia !== null && (
        <Indicador
          rotulo="Diferença na contagem"
          ajuda="O que os representantes contaram menos o que o sistema diz que está com eles. Diferente de zero não é necessariamente erro — pode ser movimento posterior à contagem."
          valor={comSinal(total.divergencia)}
          apoio={`${inteiro(total.inventario.quantidade)} contados nas malas`}
        />
      )}
    </div>
  );
}
