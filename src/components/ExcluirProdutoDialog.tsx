import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TriangleAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Produto } from '@/types/app';

/**
 * Exclusão de produtos do catálogo — um ou vários.
 *
 * Antes de perguntar, conta em quantos itens de inventário os códigos aparecem,
 * porque a resposta muda o que se deve fazer:
 *
 *  - **Sem histórico**: apagar é inofensivo.
 *  - **Com histórico**: o nome sobrevive (`itens_inventario.nome_produto` é
 *    gravado na contagem), mas o VALOR não. Comparações antigas passariam a
 *    calcular "Dif. em R$" com zero para aqueles itens. Aí inativar quase sempre
 *    é melhor, e o diálogo oferece as duas saídas.
 *
 * Não há FK entre as tabelas, então apagar não derruba contagem nenhuma — o item
 * de inventário continua com seu código e sua quantidade.
 */

/** Limite do `.in()` por requisição; acima disso o PostgREST recusa a URL. */
const LOTE = 200;

async function emLotes<T>(itens: T[], fn: (lote: T[]) => Promise<void>) {
  for (let i = 0; i < itens.length; i += LOTE) {
    await fn(itens.slice(i, i + LOTE));
  }
}

export function ExcluirProdutoDialog({
  produtos,
  onOpenChange,
  onConcluido,
}: {
  /** Vazio fecha o diálogo. Um item usa o texto no singular. */
  produtos: Produto[];
  onOpenChange: (v: boolean) => void;
  onConcluido: () => void;
}) {
  const [usos, setUsos] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const aberto = produtos.length > 0;
  const varios = produtos.length > 1;

  useEffect(() => {
    if (!aberto) {
      setUsos(null);
      return;
    }
    let cancelado = false;
    (async () => {
      const codigos = produtos.map((p) => p.codigo_auxiliar);
      let total = 0;
      for (let i = 0; i < codigos.length; i += LOTE) {
        // `head: true` traz só a contagem: um código pode aparecer em milhares de
        // itens e nenhum deles interessa aqui.
        const { count } = await supabase
          .from('itens_inventario')
          .select('id', { count: 'exact', head: true })
          .in('codigo_auxiliar', codigos.slice(i, i + LOTE));
        total += count ?? 0;
      }
      if (!cancelado) setUsos(total);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, produtos.map((p) => p.id).join(',')]);

  const encerrar = (mensagem: string) => {
    toast.success(mensagem);
    onConcluido();
    onOpenChange(false);
  };

  const excluir = async () => {
    setOcupado(true);
    try {
      await emLotes(produtos.map((p) => p.id), async (ids) => {
        const { error } = await supabase.from('produtos').delete().in('id', ids);
        if (error) throw error;
      });
      encerrar(varios ? `${produtos.length} produtos excluídos.` : `${produtos[0].codigo_auxiliar} excluído.`);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível excluir. Nada foi alterado nos lotes seguintes.');
    } finally {
      setOcupado(false);
    }
  };

  const inativar = async () => {
    setOcupado(true);
    try {
      await emLotes(produtos.map((p) => p.id), async (ids) => {
        const { error } = await supabase.from('produtos').update({ ativo: false }).in('id', ids);
        if (error) throw error;
      });
      encerrar(varios ? `${produtos.length} produtos inativados.` : `${produtos[0].codigo_auxiliar} inativado.`);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível inativar.');
    } finally {
      setOcupado(false);
    }
  };

  const temHistorico = (usos ?? 0) > 0;

  return (
    <AlertDialog open={aberto} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {varios
              ? `Excluir ${produtos.length} produtos?`
              : `Excluir ${produtos[0]?.codigo_auxiliar}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {varios
              ? produtos
                  .slice(0, 3)
                  .map((p) => p.codigo_auxiliar)
                  .join(', ') + (produtos.length > 3 ? ` e mais ${produtos.length - 3}` : '')
              : produtos[0]?.nome_produto}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {usos === null ? (
          <Skeleton className="h-16 w-full" />
        ) : temHistorico ? (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              {varios ? 'Estes produtos aparecem' : 'Este produto aparece'} em{' '}
              <strong>{usos.toLocaleString('pt-BR')} item(ns) de inventário</strong>. As contagens
              não são afetadas e o nome delas se mantém — mas o <strong>valor se perde</strong>, e
              comparações antigas passarão a calcular a diferença em reais como zero.
              <span className="mt-1 block">
                Nesses casos, <strong>inativar</strong> costuma ser melhor: some dos filtros do dia
                a dia e preserva o histórico.
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum inventário usou {varios ? 'estes códigos' : 'este código'}. A exclusão não
            afeta nada.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          {temHistorico && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                inativar();
              }}
              disabled={ocupado}
            >
              Inativar
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              excluir();
            }}
            disabled={ocupado || usos === null}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
