import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampoQuantidade } from './CampoQuantidade';
import type { ItemContagem } from '@/lib/recontagem';

/**
 * O produto que acabou de ser bipado, em destaque.
 *
 * POR QUE ESTE BLOCO EXISTE: o único retorno de um bipe era um toast — "'Óculos X'
 * incrementado" — que sumia em segundos e não dizia o número. A pergunta do vendedor
 * depois de bipar é uma só, "quantos tem agora?", e a tela não respondia. Sem resposta,
 * ele bipa de novo por via das dúvidas, e é assim que a contagem infla.
 *
 * O `desfazer` mora aqui pelo mesmo motivo: bipar errado precisa custar um toque para
 * corrigir, senão o vendedor hesita antes de cada bipe.
 */
interface Props {
  item: ItemContagem;
  onQuantidade: (quantidade: number) => void;
  onDesfazer: () => void;
  /** Só há o que desfazer se o último gesto foi um bipe, não uma digitação. */
  podeDesfazer: boolean;
}

export function UltimoBipe({ item, onQuantidade, onDesfazer, podeDesfazer }: Props) {
  const anterior = item.quantidade_anterior;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[10rem] flex-1">
          {/* O código é o que o vendedor confere contra a etiqueta na mão — é ele que
              ganha o tamanho. A descrição confirma que o produto é o certo. */}
          <p className="font-mono text-xl font-bold leading-tight tracking-wide text-foreground">
            {item.codigo_auxiliar}
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {item.nome_produto || 'Produto sem nome cadastrado'}
          </p>
        </div>

        {/* Quando não cabe ao lado do nome, o controle desce para uma linha própria e
            centralizada, em vez de espremer os dois — é o gesto mais repetido da tela. */}
        <div className="flex w-full justify-center sm:w-auto sm:justify-end">
          <CampoQuantidade
            id={`qtd-destaque-${item.codigo_auxiliar}`}
            valor={item.quantidade_fisica}
            onChange={onQuantidade}
            tamanho="destaque"
            rotulo={item.codigo_auxiliar}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {anterior !== null ? (
          <p className="text-sm text-muted-foreground">
            Antes eram <span className="font-semibold tabular-nums text-foreground">{anterior}</span>
          </p>
        ) : (
          <span />
        )}

        {podeDesfazer && (
          <Button variant="ghost" size="sm" onClick={onDesfazer}>
            <Undo2 className="mr-2" size={16} />
            Desfazer este bipe
          </Button>
        )}
      </div>
    </div>
  );
}
