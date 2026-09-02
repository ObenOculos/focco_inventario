import { Checkbox } from '@/components/ui/checkbox';

/**
 * Caixa de marcação com rótulo clicável e uma linha de explicação.
 *
 * Saiu de dentro da `BarraEscopo` quando a Reposição da mala passou a ter os mesmos
 * recortes que SUBTRAEM linhas ("ocultar acessórios", "só o que falta"). Uma segunda
 * cópia significaria duas caixas com espaçamento e tamanho de fonte diferentes para o
 * mesmo gesto — que é exatamente o tipo de divergência que o `DESIGN_SYSTEM` existe
 * para evitar.
 *
 * A `descricao` é obrigatória de propósito: toda caixa deste tipo esconde ou revela
 * dados, e uma caixa que muda o número da tela sem dizer o que faz é a pior variante
 * possível de um controle.
 */
export function CaixaDeMarcacao({
  marcado,
  onMarcado,
  children,
  descricao,
}: {
  marcado: boolean;
  onMarcado: (v: boolean) => void;
  children: React.ReactNode;
  descricao: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-start gap-2.5">
      <Checkbox
        checked={marcado}
        onCheckedChange={(v) => onMarcado(v === true)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{children}</span>
        <span className="block text-2xs text-muted-foreground">{descricao}</span>
      </span>
    </label>
  );
}
