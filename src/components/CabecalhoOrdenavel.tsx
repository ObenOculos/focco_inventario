import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import type { Ordenacao } from '@/lib/ordenacao';

/**
 * Cabeçalho de coluna que ordena a tabela ao ser clicado.
 *
 * POR QUE UM COMPONENTE E NÃO `onClick` no `<TableHead>`: um `<th>` com `onClick` não
 * recebe foco, não responde a Enter e não anuncia nada — quem navega por teclado
 * simplesmente não alcança a ordenação. O botão interno resolve os três, e o `aria-sort`
 * no `<th>` é o que faz o leitor de tela dizer "ordenado crescente" ao entrar na coluna.
 *
 * O ÍCONE MOSTRA O ESTADO. A ordenação que já existia em `Vendedores` usa `ArrowUpDown`
 * fixo em todas as colunas: clicando, a tabela reordena, mas nada na tela diz por qual
 * coluna nem em que direção — o usuário tem de deduzir olhando os dados. Aqui a coluna
 * ativa recebe a seta da direção e as demais ficam com o ícone neutro, esmaecido.
 */

interface Props<T extends string> {
  rotulo: string;
  campo: T;
  ordenacao: Ordenacao<T>;
  onOrdenar: (campo: T) => void;
  /** Acompanha o alinhamento do conteúdo da coluna, senão o rótulo descola dos dados. */
  alinhamento?: 'left' | 'center' | 'right';
  className?: string;
}

export function CabecalhoOrdenavel<T extends string>({
  rotulo,
  campo,
  ordenacao,
  onOrdenar,
  alinhamento = 'left',
  className = '',
}: Props<T>) {
  const ativo = ordenacao.campo === campo;
  const Icone = !ativo ? ArrowUpDown : ordenacao.direcao === 'asc' ? ArrowUp : ArrowDown;

  const justificar =
    alinhamento === 'right'
      ? 'justify-end'
      : alinhamento === 'center'
        ? 'justify-center'
        : 'justify-start';

  return (
    <TableHead
      aria-sort={ativo ? (ordenacao.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`font-semibold ${className}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        // `-mx-2 px-2` mantém a área de clique maior que o texto sem deslocar o rótulo
        // em relação às células da coluna.
        className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${justificar} ${
          ativo ? 'text-foreground' : ''
        }`}
      >
        {rotulo}
        <Icone
          size={13}
          className={`shrink-0 ${ativo ? '' : 'opacity-40'}`}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}
