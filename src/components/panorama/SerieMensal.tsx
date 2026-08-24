import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PontoMensalComparativo } from '@/lib/panoramaComparativo';
import type { Medida } from '@/lib/panorama';
import { curto, inteiro, moeda } from '@/lib/panoramaFormato';

/**
 * Entradas e saídas mês a mês, espelhadas em torno de uma linha.
 *
 * **Por que espelhado e não duas cores lado a lado.** As duas séries precisam ser
 * distinguidas, e a POSIÇÃO faz isso melhor que a cor: entrada sobe, saída desce, e
 * ninguém precisa consultar legenda. Isso também evita gastar um par de matizes
 * categóricas — e evita a tentação de usar `success`/`info`, que são tokens de STATUS
 * e não podem carregar identidade de série (DESIGN_SYSTEM.md, seção 2).
 *
 * A cor é reforço redundante: a mesma matiz em duas intensidades. Se ela sumisse, o
 * gráfico continuaria legível.
 *
 * **Uma escala só para os dois lados.** Metades com escalas próprias fariam um mês de
 * 200 entradas parecer do tamanho de um mês de 3.000 saídas — que é exatamente o erro
 * que um eixo duplo comete.
 *
 * **Os números aparecem em cima de cada barra.** Rotular todo ponto costuma ser ruído,
 * mas aqui são poucas colunas e a pergunta é quantitativa ("quanto entrou em março?"):
 * obrigar a passar o mouse para ler um número que cabe na tela é esconder o dado. Sem
 * centavos, porque dois dígitos de centavo numa coluna estreita só tiram espaço do que
 * importa — o valor exato continua no `title`.
 */

const mesCurto = (iso: string) => {
  try {
    // `locale: ptBR` porque o padrão do date-fns é inglês: sem ele o eixo lê
    // "Aug/26" numa tela inteiramente em português.
    return format(parseISO(iso), 'MMM/yy', { locale: ptBR });
  } catch {
    return iso;
  }
};

interface Props {
  pontos: PontoMensalComparativo[];
  medida: Medida;
  /** Mês em foco. Clicar de novo no mesmo tira o foco. */
  mesEmFoco: string | null;
  onMes: (mes: string | null) => void;
}

export function SerieMensal({ pontos, medida, mesEmFoco, onMes }: Props) {
  const maximo = Math.max(...pontos.flatMap((p) => [p.entrou, p.saiu]), 0);
  if (pontos.length === 0 || maximo === 0) return null;

  const formatar = (v: number) => curto({ quantidade: v, valor: v }, medida);
  const preciso = (v: number) => (medida === 'valor' ? moeda(v) : `${inteiro(v)} un.`);
  const altura = (v: number) => `${Math.max((v / maximo) * 100, v > 0 ? 3 : 0)}%`;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-3 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-primary/45" aria-hidden />
          Entrou
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-primary" aria-hidden />
          Saiu
        </span>
        <span className="ms-auto">clique num mês para focar</span>
      </div>

      <div className="flex items-stretch gap-[2px] sm:gap-1">
        {pontos.map((p) => {
          const emFoco = mesEmFoco === p.mes;
          // Sem foco nenhum, todos os meses ficam cheios. Com um mês em foco, os demais
          // recuam — o recorte precisa ser visível sem apagar o contexto ao redor.
          const opacidade = mesEmFoco && !emFoco ? 'opacity-40' : '';
          return (
            <button
              key={p.mes}
              type="button"
              aria-pressed={emFoco}
              onClick={() => onMes(emFoco ? null : p.mes)}
              title={`${mesCurto(p.mes)} — entrou ${preciso(p.entrou)}, saiu ${preciso(p.saiu)}`}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-colors hover:bg-muted/40 ${
                emFoco ? 'bg-muted/60' : ''
              }`}
            >
              <span className="w-full truncate text-center text-2xs tabular-nums text-muted-foreground">
                {p.entrou > 0 ? formatar(p.entrou) : ''}
              </span>
              <div className={`flex h-14 w-full items-end ${opacidade}`}>
                <div
                  className="w-full rounded-t bg-primary/45 transition-[height]"
                  style={{ height: altura(p.entrou) }}
                />
              </div>
              <div className="h-px w-full bg-border" />
              <div className={`flex h-14 w-full items-start ${opacidade}`}>
                <div
                  className="w-full rounded-b bg-primary transition-[height]"
                  style={{ height: altura(p.saiu) }}
                />
              </div>
              <span className="w-full truncate text-center text-2xs font-medium tabular-nums text-foreground/80">
                {p.saiu > 0 ? formatar(p.saiu) : ''}
              </span>
              <span
                className={`w-full truncate text-center text-2xs ${
                  emFoco ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {mesCurto(p.mes)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
