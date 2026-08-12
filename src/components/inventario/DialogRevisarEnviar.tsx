import { ArrowDown, ArrowUp, CircleAlert, Plus, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Balanco, ItemContagem } from '@/lib/recontagem';

/**
 * Confirmação antes de enviar.
 *
 * O momento de maior risco de uma recontagem não é o bipe — é o envio. É ali que uma
 * contagem some sem ninguém ter percebido, e depois não há de onde tirá-la de volta:
 * `salvar_inventario` substitui os itens. Por isso o vendedor vê o que vai mudar ANTES
 * de gravar, com os produtos que caíram a zero em primeiro lugar e em cor de aviso — são
 * eles que apagam estoque.
 *
 * As observações moram aqui, e não no meio da lista, onde eram um campo que todo mundo
 * rolava por cima durante a contagem inteira.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balanco: Balanco;
  emRevisao: boolean;
  totalProdutos: number;
  observacoes: string;
  onObservacoes: (valor: string) => void;
  onConfirmar: () => void;
  enviando: boolean;
}

const AMOSTRA = 6;

function Grupo({
  titulo,
  itens,
  icone,
  destaque = false,
}: {
  titulo: string;
  itens: ItemContagem[];
  icone: React.ReactNode;
  destaque?: boolean;
}) {
  if (itens.length === 0) return null;
  const resto = itens.length - AMOSTRA;

  return (
    <div
      className={
        destaque
          ? 'rounded-xl border border-warning/30 bg-warning-subtle p-3.5'
          : 'rounded-xl border border-border/80 p-3.5'
      }
    >
      <p
        className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
          destaque ? 'text-warning-strong' : 'text-muted-foreground'
        }`}
      >
        {icone}
        {titulo} ({itens.length})
      </p>
      <ul className="mt-2 space-y-1">
        {itens.slice(0, AMOSTRA).map((i) => (
          <li key={i.codigo_auxiliar} className="flex items-baseline justify-between gap-3 text-sm">
            {/* Código em destaque também aqui: é por ele que o vendedor reconhece a linha
                que está prestes a confirmar. */}
            <span className="min-w-0 truncate">
              <span className="font-mono font-bold tracking-wide text-foreground">
                {i.codigo_auxiliar}
              </span>{' '}
              <span className="text-xs text-muted-foreground">{i.nome_produto}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {i.quantidade_anterior !== null && (
                <>
                  <span className="line-through">{i.quantidade_anterior}</span>
                  {' → '}
                </>
              )}
              <span className="font-semibold text-foreground">{i.quantidade_fisica}</span>
            </span>
          </li>
        ))}
      </ul>
      {resto > 0 && <p className="mt-2 text-xs text-muted-foreground">e mais {resto}…</p>}
    </div>
  );
}

export function DialogRevisarEnviar({
  open,
  onOpenChange,
  balanco,
  emRevisao,
  totalProdutos,
  observacoes,
  onObservacoes,
  onConfirmar,
  enviando,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revisar e enviar</DialogTitle>
          <DialogDescription>
            Confira o que vai ser gravado antes de mandar para o gerente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/80 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Produtos
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{totalProdutos}</p>
            </div>
            <div className="rounded-xl border border-border/80 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Peças
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{balanco.totalPecas}</p>
            </div>
          </div>

          {emRevisao && (
            <div className="space-y-3">
              {/* Primeiro e em cor de aviso: é a única mudança que apaga estoque. */}
              <Grupo
                titulo="Foram a zero"
                itens={balanco.zerados}
                icone={<CircleAlert size={14} />}
                destaque
              />
              <Grupo titulo="Aumentaram" itens={balanco.subiram} icone={<ArrowUp size={14} />} />
              <Grupo titulo="Diminuíram" itens={balanco.desceram} icone={<ArrowDown size={14} />} />
              <Grupo titulo="Novos" itens={balanco.novos} icone={<Plus size={14} />} />

              <p className="text-xs text-muted-foreground">
                {balanco.confirmados > 0 && (
                  <>
                    {balanco.confirmados} produto(s) recontado(s) bateram com a contagem anterior.{' '}
                  </>
                )}
                {balanco.intocados.length > 0 && (
                  <>
                    {balanco.intocados.length} produto(s) não foram recontados e mantêm a contagem
                    original.
                  </>
                )}
              </p>
            </div>
          )}

          <div>
            <Label
              htmlFor="observacoes-envio"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Observações para o gerente (opcional)
            </Label>
            <Textarea
              id="observacoes-envio"
              name="observacoes"
              placeholder="Algo que o gerente precise saber sobre esta contagem…"
              value={observacoes}
              onChange={(e) => onObservacoes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={onConfirmar} disabled={enviando}>
            <Send className="mr-2" size={16} />
            {enviando ? 'Enviando…' : 'Enviar para o gerente conferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
