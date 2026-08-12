import { RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsHandheld } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CampoQuantidade } from './CampoQuantidade';
import type { ItemContagem } from '@/lib/recontagem';

/**
 * Uma linha da contagem.
 *
 * NÃO É UMA `<table>`: é lista. Numa tabela, código, nome, `−`, número, `+` e a ação
 * disputavam a mesma largura de 360px, e o nome do produto — a única coisa que o vendedor
 * lê para saber se bipou o certo — era o que sobrava truncado. Aqui os controles descem
 * para a própria linha no celular e no tablet, com 44px cada, e o nome fica inteiro.
 *
 * Em recontagem a linha diz três coisas sem exigir interpretação: quanto tinha antes,
 * quanto tem agora, e se este produto já foi recontado ou ainda está com o número antigo.
 * O caso perigoso — recontado e terminou em zero — é o único que ganha cor de aviso,
 * porque é o único que apaga estoque.
 */
interface Props {
  item: ItemContagem;
  emRevisao: boolean;
  recontado: boolean;
  /** Acabou de ser bipado: recebe realce por alguns segundos. */
  destacado: boolean;
  onQuantidade: (quantidade: number) => void;
  onRemover: () => void;
  onDesfazerRecontagem: () => void;
}

export function LinhaContagem({
  item,
  emRevisao,
  recontado,
  destacado,
  onQuantidade,
  onRemover,
  onDesfazerRecontagem,
}: Props) {
  const handheld = useIsHandheld();
  const anterior = item.quantidade_anterior;
  const zeradoNaRecontagem = recontado && item.quantidade_fisica === 0 && (anterior ?? 0) > 0;

  return (
    <li
      className={cn(
        'border-b border-border/60 p-4 transition-colors last:border-b-0',
        destacado ? 'bg-primary/5' : 'hover:bg-muted/30'
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[10rem] flex-1">
          {/* HIERARQUIA: o código vem primeiro e maior; a descrição é apoio.
              Estava invertido — código em `text-xs` cinza, nome em `text-sm` escuro — e é
              o código que o vendedor confere contra a etiqueta que tem na mão. A descrição
              serve para confirmar que ele bipou o produto certo, não para identificá-lo. */}
          <p className="font-mono text-base font-bold leading-tight tracking-wide text-foreground">
            {item.codigo_auxiliar}
          </p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">
            {item.nome_produto || 'Produto sem nome cadastrado'}
          </p>

          {emRevisao && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {recontado ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    Antes <span className="font-semibold tabular-nums">{anterior ?? 0}</span> → agora{' '}
                    <span className="font-semibold tabular-nums text-foreground">
                      {item.quantidade_fisica}
                    </span>
                  </span>
                  {zeradoNaRecontagem && (
                    <Badge variant="warning" className="px-2.5 py-0.5 text-2xs">
                      Não encontrado
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="neutral" className="px-2.5 py-0.5 text-2xs">
                  Contagem original
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* `ml-auto` mantém os controles à direita mesmo quando quebram para a linha
            de baixo — encostados à esquerda eles ficariam sob o texto e o polegar
            passaria por cima do nome do produto para chegar no `−`. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CampoQuantidade
            id={`qtd-${item.codigo_auxiliar}`}
            valor={item.quantidade_fisica}
            onChange={onQuantidade}
            rotulo={item.codigo_auxiliar}
          />

          {recontado ? (
            <Button
              variant="ghost"
              size={handheld ? 'icon' : 'iconSm'}
              aria-label={`Voltar ${item.codigo_auxiliar} para a contagem anterior`}
              title="Voltar para a contagem anterior"
              onClick={onDesfazerRecontagem}
            >
              <RotateCcw size={16} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size={handheld ? 'icon' : 'iconSm'}
              aria-label={`Remover ${item.codigo_auxiliar} do inventário`}
              className="text-destructive hover:bg-destructive/10"
              onClick={onRemover}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
