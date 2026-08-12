import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NIVEIS,
  opcoesDoNivel,
  sanearSelecao,
  type ComCategorias,
  type NivelCategoria,
  type SelecaoCategorias,
} from '@/lib/categoriasProduto';

/**
 * Recorte por categoria de produto — Marca, Tipo, Subtipo e Grupo, a hierarquia que o
 * Ciclone já entrega em cada linha da comparação.
 *
 * Os quatro níveis são ENCADEADOS, não independentes: escolher OBEN faz o seletor de
 * Tipo oferecer só os tipos que existem dentro de OBEN. Quatro listas soltas ofereceriam
 * recortes que devolvem zero linhas, e quem escolheu só descobre depois de aplicar.
 *
 * O valor de "todos" é a string `todos`, e não `''`: o Select do Radix trata string
 * vazia como "sem valor" e volta a mostrar o placeholder — o item ficaria inselecionável.
 */

/** Sentinela de "sem recorte neste nível". Ver o comentário acima. */
const TODOS = 'todos';

interface Props {
  /** Linhas ANTES do recorte por categoria — são elas que definem o que existe para oferecer. */
  linhas: readonly ComCategorias[];
  selecao: SelecaoCategorias;
  onSelecao: (s: SelecaoCategorias) => void;
  /**
   * Traço que separa este bloco do que vem antes dele na mesma barra.
   *
   * Só faz sentido onde existe algo à esquerda para separar — a barra do Comparativo,
   * que mistura filtro de produto com filtro de resultado. Na contagem os seletores
   * abrem a linha, e o traço apareceria como um risco solto na margem.
   */
  comSeparador?: boolean;
}

export function FiltroCategorias({ linhas, selecao, onSelecao, comSeparador = true }: Props) {
  const niveis = NIVEIS.map((nivel) => ({
    ...nivel,
    opcoes: opcoesDoNivel(linhas, selecao, nivel.chave),
  }));

  /**
   * Um nível só aparece quando há escolha a fazer.
   *
   * Com uma opção só, o seletor não recorta nada — e o catálogo real tem níveis assim
   * (Tipo tem dois valores, Grupo às vezes um). Quatro seletores sempre visíveis
   * gastariam a linha inteira para oferecer, em metade deles, um clique sem efeito.
   * O nível escolhido continua visível mesmo sozinho: é preciso poder desfazer.
   */
  const visiveis = niveis.filter((n) => n.opcoes.length > 1 || selecao[n.chave] !== null);
  if (visiveis.length === 0) return null;

  const trocar = (chave: NivelCategoria, valor: string) => {
    const bruta: SelecaoCategorias = { ...selecao, [chave]: valor === TODOS ? null : valor };
    // Sanear aqui, e não no consumidor, porque é aqui que se sabe quais linhas estavam
    // na mesa quando a escolha foi feita.
    onSelecao(sanearSelecao(linhas, bruta));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Separa, dentro da barra de recorte, o filtro POR PRODUTO do filtro PELO
          RESULTADO da contagem. Só no desktop: empilhado, a quebra de linha já separa.
          Mora aqui para nascer e morrer junto dos seletores. */}
      {comSeparador && <div className="hidden h-8 w-px shrink-0 bg-border lg:block" />}

      {visiveis.map(({ chave, rotulo, opcoes }) => {
        const valor = selecao[chave];
        return (
          <Select
            key={chave}
            value={valor ?? TODOS}
            onValueChange={(v) => trocar(chave, v)}
          >
            <SelectTrigger
              aria-label={rotulo}
              className={`w-full font-normal sm:w-44 ${valor !== null ? 'border-primary/60' : ''}`}
            >
              {/* O rótulo do nível viaja junto do valor: fora de contexto, "ACETATO"
                  sozinho num seletor não diz se é Grupo, Subtipo ou Marca. */}
              <span className="truncate">
                <span className="text-muted-foreground">{rotulo}: </span>
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              <SelectSeparator />
              {opcoes.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.valor} ({o.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

    </div>
  );
}
