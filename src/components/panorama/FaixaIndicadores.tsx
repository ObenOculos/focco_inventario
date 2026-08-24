import type { NoComparativo } from '@/lib/panoramaComparativo';
import type { Medida } from '@/lib/panorama';

/**
 * Faixa de indicadores — a equação do período e a posição de hoje, lado a lado.
 *
 * Ela acompanha o RECORTE ABERTO, não o período inteiro: com OBEN aberto, os números
 * são de OBEN. Um total que não fosse o da lista logo abaixo seria pior que nenhum.
 *
 * A ordem conta a história na sequência em que se lê: o que entrou, o que saiu, o que
 * sobrou disso, onde está hoje, por quanto tempo dá.
 *
 * **Os cinco primeiros são do ERP e estão sempre lá.** A contagem entra por último e só
 * quando pedida — ver `mostrarInventario`.
 */

import {
  comSinal,
  curto,
  exato,
  inteiro,
  moeda,
  moedaCurta,
  percentual,
} from '@/lib/panoramaFormato';

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
  /**
   * Acrescentar a diferença da contagem ao fim da faixa.
   *
   * Desligado, a faixa é só ERP — que é a hierarquia da tela. Ligado, o cartão vem
   * DEPOIS de todos os outros, de propósito: é complemento da leitura, não a manchete.
   */
  mostrarInventario: boolean;
  /**
   * Acrescentar lucro e margem, e trocar a base do cartão-herói para CUSTO.
   *
   * O herói muda porque a pergunta muda de sentido: "estoque hoje" a preço de tabela é
   * quanto a mercadoria renderia se fosse toda vendida; a custo é quanto dinheiro está
   * parado nela. Quem liga custo está fazendo a segunda pergunta.
   */
  mostrarCusto: boolean;
}

export function FaixaIndicadores({
  total,
  medida,
  baseCobertura,
  mostrarInventario,
  mostrarCusto,
}: Props) {
  const numero = (t: { quantidade: number; valor: number }) => curto(t, medida);
  const estoque = { quantidade: total.estoqueTotal, valor: total.interno.valor + total.externo.valor };
  /** O mesmo estoque valorizado a custo — a quantidade é a mesma, o dinheiro não. */
  const estoqueACusto = { quantidade: total.estoqueTotal, valor: total.estoqueCusto };

  return (
    <div className="flex flex-wrap gap-3">
      {/* O herói vem PRIMEIRO: é o que a pessoa veio ver, e a leitura em português é da
          esquerda para a direita. Depois dele, a história do período. */}
      <Indicador
        rotulo="Estoque hoje"
        valor={numero(mostrarCusto ? estoqueACusto : estoque)}
        titulo={exato(mostrarCusto ? estoqueACusto : estoque)}
        // Em unidades o custo não muda nada — a quantidade é a mesma —, então o apoio
        // só troca no modo valor, que é onde a distinção existe.
        apoio={
          mostrarCusto && medida === 'valor'
            ? `${moedaCurta(estoque.valor)} a preço de tabela`
            : `${inteiro(total.interno.quantidade)} na empresa · ${inteiro(total.externo.quantidade)} nas malas`
        }
        ajuda={
          mostrarCusto
            ? 'Quanto existe agora na empresa mais o que está nas malas, valorizado a CUSTO — o dinheiro parado em mercadoria. Não muda com o período escolhido.'
            : 'Quanto existe agora, somando o que está na empresa e o que está nas malas dos representantes. Não muda com o período escolhido.'
        }
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
      {/* Lucro e margem vêm DEPOIS da história do ERP e ANTES da contagem: são
          derivados dos números do ERP, então pertencem a esse bloco; mas continuam
          sendo camada opcional, então não se metem no meio da leitura padrão.

          Os dois são sempre em REAIS e em porcentagem, nunca na medida ativa: lucro em
          unidades não existe, e margem é razão — ela não tem unidade para trocar. */}
      {mostrarCusto && (
        <>
          <Indicador
            rotulo="Lucro bruto"
            valor={moedaCurta(total.lucroBruto)}
            titulo={`${moeda(total.saiu.valor)} de receita − ${moeda(total.saiu.custo)} de custo = ${moeda(total.lucroBruto)}`}
            ajuda="Receita das vendas do período menos o custo da mercadoria vendida. É BRUTO: não desconta imposto, frete nem comissão. O custo usado é o do cadastro de hoje — o Ciclone não guarda o custo da época."
            apoio={`${moedaCurta(total.saiu.valor)} de receita`}
          />
          <Indicador
            rotulo="Margem bruta"
            valor={percentual(total.margemBruta)}
            ajuda="Quanto do faturamento sobra depois do custo da mercadoria. Não desconta imposto, frete nem comissão, e usa o custo de hoje — trate como ordem de grandeza, não como número contábil."
            // O apoio muda de assunto quando há furo de cadastro, e isso é deliberado:
            // custo faltando não derruba a margem, INFLA. Um aviso discreto vale mais
            // que o custo total, que ninguém confere de cabeça.
            apoio={
              total.saiu.semCusto > 0
                ? `${inteiro(total.saiu.semCusto)} un. sem custo cadastrado`
                : `custo ${moedaCurta(total.saiu.custo)}`
            }
          />
        </>
      )}
      {/* Só existe quando pedido. E, pedido, aparece MESMO sem contagem no recorte —
          com um traço: ligar a chave e não ver nada mudar parece defeito, e "não há
          inventário aqui" é uma resposta, não uma ausência de resposta.

          O que continua proibido é o número: sem contagem, `0 − externo` acusaria um
          sumiço que ninguém apurou. */}
      {mostrarInventario && (
        <Indicador
          rotulo="Diferença na contagem"
          ajuda="O que os representantes contaram menos o que o sistema diz que está com eles. Diferente de zero não é necessariamente erro — pode ser movimento posterior à contagem."
          valor={total.divergencia === null ? '—' : comSinal(total.divergencia)}
          apoio={
            total.divergencia === null
              ? 'sem inventário aprovado neste recorte'
              : `${inteiro(total.inventario.quantidade)} contados nas malas`
          }
        />
      )}
    </div>
  );
}
