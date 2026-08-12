import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsHandheld } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Quantidade com `−` e `+` ao lado do número.
 *
 * POR QUE OS BOTÕES: o campo era só um `<input type="number">`. Corrigir 3 para 2 no
 * celular exigia focar o campo, abrir o teclado numérico, apagar e digitar — quatro
 * gestos para tirar uma unidade, no meio de uma contagem. O ajuste de uma unidade é o
 * mais frequente da tela e agora custa um toque.
 *
 * O campo continua editável para quem precisa saltar de 0 para 40 sem quarenta toques.
 */
interface Props {
  valor: number;
  onChange: (valor: number) => void;
  /** `destaque` é o bloco do último bipe; `linha` é a lista. */
  tamanho?: 'destaque' | 'linha';
  /** Identificação do produto, para o rótulo acessível dos botões. */
  rotulo: string;
  id?: string;
}

export function CampoQuantidade({ valor, onChange, tamanho = 'linha', rotulo, id }: Props) {
  const handheld = useIsHandheld();
  const destaque = tamanho === 'destaque';
  // Nunca abaixo de zero: quantidade negativa não existe no estoque e só entraria por
  // engano de toque repetido no `−`.
  const ajustar = (delta: number) => onChange(Math.max(0, valor + delta));

  // No celular e no tablet a linha também usa 44px. Os 36px do `iconSm` cabem no mouse,
  // mas aqui o alvo é o polegar em movimento, e errar o `−` do produto de cima é o tipo
  // de engano que só aparece depois, na conferência.
  const botao = destaque || handheld ? 'icon' : 'iconSm';
  const icone = destaque ? 20 : 16;

  return (
    <div className={cn('flex items-center', destaque ? 'gap-3' : 'gap-2')}>
      <Button
        type="button"
        variant="outline"
        size={botao}
        aria-label={`Diminuir 1 de ${rotulo}`}
        disabled={valor <= 0}
        onClick={() => ajustar(-1)}
      >
        <Minus size={icone} />
      </Button>

      <Input
        id={id}
        name={id}
        type="number"
        inputMode="numeric"
        min="0"
        aria-label={`Quantidade de ${rotulo}`}
        value={valor}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className={cn(
          'text-center font-bold tabular-nums',
          destaque ? 'h-14 w-24 text-3xl' : handheld ? 'w-16' : 'h-9 w-16 rounded-lg'
        )}
      />

      <Button
        type="button"
        variant="outline"
        size={botao}
        aria-label={`Somar 1 em ${rotulo}`}
        onClick={() => ajustar(1)}
      >
        <Plus size={icone} />
      </Button>
    </div>
  );
}
