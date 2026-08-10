import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudOff, RotateCcw, TriangleAlert } from 'lucide-react';
import type { ErroErp, ItemCodigo, RegrasErp } from '@/hooks/useConsultaErpQuery';

/**
 * Regras de conciliação — o que conta como venda, como remessa, e quais operações
 * fiscais entram.
 *
 * São as mesmas regras de `movimentos.py` (`TIPOS_VENDA`, `TIPOS_REMESSA`,
 * `OPERACOES_SEM_MOVIMENTO_ESTOQUE`), que na ferramenta local o usuário edita por
 * checkbox. A lista de tipos e operações continua vindo inteira do gateway — o
 * cliente não inventa código nenhum. O que ele define é quais vêm MARCADOS, e aí
 * há um desvio deliberado do servidor: `TIPOS_VENDA_FORA_DO_PADRAO`.
 *
 * Fica em modal porque se configura de vez em quando, e porque a lista de
 * operações fiscais tem dezenas de itens: inline, empurraria o resultado para
 * fora da tela em toda consulta.
 */

export interface SelecaoRegras {
  tiposVenda: number[];
  tiposRemessa: number[];
  operacoes: number[];
}

/** Marcadas por padrão: todas as operações menos as que não movimentam estoque. */
export function operacoesPadrao(regras: RegrasErp): number[] {
  const excluidas = new Set(regras.padroes.operacoes_sem_movimento_estoque);
  return regras.operacoes.map((o) => o.codigo).filter((c) => !excluidas.has(c));
}

/**
 * Tipos de pedido que o gateway conta como saída da mala mas a TELA deixa
 * desmarcados. Hoje: 13 (venda-mala Rodrigo/RN).
 *
 * É a única regra que o app decide por conta própria, e é o motivo de a seleção
 * viajar em toda consulta em vez de só quando o usuário mexe no modal — omiti-la
 * faria o gateway aplicar o padrão dele, e a tela mostraria 13 desmarcado
 * enquanto o número na tabela o incluía. Desmarcar é um clique; descobrir que o
 * total não corresponde ao que a tela declara, não.
 *
 * A ferramenta local (`comparativo.py`) segue com o padrão do módulo, que inclui
 * o 13 — ao conferir um relatório contra o outro, é aqui que eles divergem.
 */
const TIPOS_VENDA_FORA_DO_PADRAO = [13];

export function selecaoPadrao(regras: RegrasErp): SelecaoRegras {
  return {
    tiposVenda: regras.padroes.tipos_venda.filter(
      (t) => !TIPOS_VENDA_FORA_DO_PADRAO.includes(t)
    ),
    tiposRemessa: [...regras.padroes.tipos_remessa],
    operacoes: operacoesPadrao(regras),
  };
}

const mesmoConjunto = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export function ehPadrao(selecao: SelecaoRegras | null, regras?: RegrasErp): boolean {
  if (!selecao || !regras) return true;
  const p = selecaoPadrao(regras);
  return (
    mesmoConjunto(selecao.tiposVenda, p.tiposVenda) &&
    mesmoConjunto(selecao.tiposRemessa, p.tiposRemessa) &&
    mesmoConjunto(selecao.operacoes, p.operacoes)
  );
}

function ListaCheck({
  itens,
  marcados,
  onToggle,
  alturaMax,
}: {
  itens: ItemCodigo[];
  marcados: number[];
  onToggle: (codigo: number, ligado: boolean) => void;
  alturaMax?: string;
}) {
  const set = useMemo(() => new Set(marcados), [marcados]);
  return (
    <div
      className={`space-y-1 overflow-y-auto rounded-xl border border-border/80 p-3 ${alturaMax ?? ''}`}
    >
      {itens.map((i) => (
        <label
          key={i.codigo}
          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-muted/50"
        >
          <Checkbox
            checked={set.has(i.codigo)}
            onCheckedChange={(v) => onToggle(i.codigo, v === true)}
          />
          <span className="tabular-nums text-muted-foreground">{i.codigo}</span>
          <span className="min-w-0 truncate">{i.descricao}</span>
        </label>
      ))}
      {itens.length === 0 && (
        <p className="py-3 text-center text-sm text-muted-foreground">Nada a exibir.</p>
      )}
    </div>
  );
}

export function RegrasConciliacaoDialog({
  aberto,
  onOpenChange,
  regras,
  carregando,
  erro,
  selecao,
  onChange,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  regras?: RegrasErp;
  carregando: boolean;
  erro: ErroErp | null;
  selecao: SelecaoRegras | null;
  onChange: (s: SelecaoRegras) => void;
}) {
  const atual = selecao ?? (regras ? selecaoPadrao(regras) : null);

  const alterna = (campo: keyof SelecaoRegras) => (codigo: number, ligado: boolean) => {
    if (!atual) return;
    const lista = atual[campo];
    onChange({
      ...atual,
      [campo]: ligado ? [...lista, codigo] : lista.filter((c) => c !== codigo),
    });
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Regras de conciliação</DialogTitle>
          <DialogDescription>
            Definem o que conta como entrada e saída da mala do representante. Valem só para
            esta consulta — não alteram a configuração do servidor.
          </DialogDescription>
        </DialogHeader>

        {erro ? (
          <Alert variant={erro.indisponivel ? 'warning' : 'destructive'}>
            {erro.indisponivel ? <CloudOff /> : <TriangleAlert />}
            <AlertDescription>
              {erro.indisponivel
                ? 'ERP indisponível — não deu para carregar os tipos de pedido e operações fiscais.'
                : erro.message}
            </AlertDescription>
          </Alert>
        ) : carregando || !regras || !atual ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Entram na mala (remessa)</h3>
                <p className="text-xs text-muted-foreground">
                  Tipos de pedido que somam à quantidade esperada.
                </p>
                <ListaCheck
                  itens={regras.tipos_pedido}
                  marcados={atual.tiposRemessa}
                  onToggle={alterna('tiposRemessa')}
                  alturaMax="max-h-56"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Saem da mala (venda)</h3>
                <p className="text-xs text-muted-foreground">
                  Tipos de pedido que subtraem da quantidade esperada.
                </p>
                <ListaCheck
                  itens={regras.tipos_pedido}
                  marcados={atual.tiposVenda}
                  onToggle={alterna('tiposVenda')}
                  alturaMax="max-h-56"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Operações fiscais consideradas</h3>
                  <p className="text-xs text-muted-foreground">
                    As que não movimentam estoque vêm desmarcadas —{' '}
                    <span className="tabular-nums">
                      {regras.padroes.operacoes_sem_movimento_estoque.join(', ')}
                    </span>
                    .
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      onChange({ ...atual, operacoes: regras.operacoes.map((o) => o.codigo) })
                    }
                  >
                    Marcar todas
                  </Button>
                  <Button variant="outline" onClick={() => onChange({ ...atual, operacoes: [] })}>
                    Desmarcar todas
                  </Button>
                </div>
              </div>
              <ListaCheck
                itens={regras.operacoes}
                marcados={atual.operacoes}
                onToggle={alterna('operacoes')}
                alturaMax="max-h-64"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => onChange(selecaoPadrao(regras))}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar padrão
              </Button>
              <Button onClick={() => onOpenChange(false)}>Aplicar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
