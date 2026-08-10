import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Download, RefreshCw, TriangleAlert } from 'lucide-react';
import { useSincronizarProdutos } from '@/hooks/useSincronizarProdutos';
import type { EscolhaEmpresa } from '@/hooks/useConsultaErpQuery';

/**
 * Atualiza o catálogo de produtos a partir do Ciclone.
 *
 * A prévia é obrigatória: a operação mexe no catálogo inteiro, e o número que
 * mais importa nela é o de **inativados** — se vier alto, é sinal de que a busca
 * trouxe menos produtos do que devia, e aplicar apagaria a situação de milhares
 * de itens de uma vez.
 */

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${cor ?? ''}`}>
        {valor.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}

export function SincronizarProdutosDialog({
  aberto,
  onOpenChange,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [empresa, setEmpresa] = useState<EscolhaEmpresa>('ambas');
  const { etapa, preparar, aplicar, cancelar } = useSincronizarProdutos();

  const ocupado =
    etapa.fase === 'buscando' || etapa.fase === 'enviando' || etapa.fase === 'aplicando';

  const fechar = (v: boolean) => {
    if (ocupado) return; // fechar no meio deixaria a área de espera suja
    if (!v) cancelar();
    onOpenChange(v);
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Atualizar produtos do Ciclone</DialogTitle>
          <DialogDescription>
            Traz o catálogo de óculos direto do ERP. Nada é gravado antes de você conferir a
            prévia.
          </DialogDescription>
        </DialogHeader>

        {etapa.fase === 'ocioso' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="empresa-sinc">Empresa</Label>
              <Select value={empresa} onValueChange={(v) => setEmpresa(v as EscolhaEmpresa)}>
                <SelectTrigger id="empresa-sinc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ambas">Ambas (1 e 2)</SelectItem>
                  <SelectItem value="1">Empresa 1</SelectItem>
                  <SelectItem value="2">Empresa 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              Sobem apenas os tipos <strong>Óculos Receituário</strong> e{' '}
              <strong>Óculos Solar</strong>. Estojos, flanelas, expositores, brindes e cadastros
              genéricos ficam de fora. Produtos inativos no Ciclone sobem marcados como inativos.
            </p>
            <Button onClick={() => preparar(empresa)} className="w-full">
              <Download className="mr-2 size-4" />
              Buscar do Ciclone
            </Button>
          </div>
        )}

        {(etapa.fase === 'buscando' || etapa.fase === 'enviando') && (
          <div className="space-y-3 py-4">
            <p className="text-sm">
              {etapa.fase === 'buscando'
                ? 'Consultando o Ciclone…'
                : `Enviando ${etapa.enviados.toLocaleString('pt-BR')} de ${etapa.total.toLocaleString('pt-BR')} produtos…`}
            </p>
            <Progress
              value={etapa.fase === 'enviando' ? (etapa.enviados / etapa.total) * 100 : undefined}
            />
            <p className="text-xs text-muted-foreground">
              O catálogo é enviado em lotes. Nenhuma alteração foi gravada ainda.
            </p>
          </div>
        )}

        {etapa.fase === 'aguardando' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Numero rotulo="Novos" valor={etapa.previa.inseridos} cor="text-info-strong" />
              <Numero rotulo="Alterados" valor={etapa.previa.alterados} />
              <Numero rotulo="Sem mudança" valor={etapa.previa.inalterados} />
              <Numero
                rotulo="Inativados"
                valor={etapa.previa.inativados}
                cor={etapa.previa.inativados > 0 ? 'text-warning-strong' : undefined}
              />
            </div>

            {etapa.previa.inativados > 50 && (
              <Alert variant="warning">
                <TriangleAlert />
                <AlertDescription>
                  <strong>
                    {etapa.previa.inativados.toLocaleString('pt-BR')} produtos seriam inativados.
                  </strong>{' '}
                  Número alto costuma significar que a busca trouxe menos produtos do que devia —
                  vale conferir antes de aplicar. Eles não são apagados: continuam no histórico,
                  apenas marcados como inativos.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={cancelar}>
                Cancelar
              </Button>
              <Button onClick={() => aplicar(etapa.id)}>
                <RefreshCw className="mr-2 size-4" />
                Aplicar ao catálogo
              </Button>
            </div>
          </div>
        )}

        {etapa.fase === 'aplicando' && (
          <div className="space-y-3 py-4">
            <p className="text-sm">Aplicando ao catálogo…</p>
            <Progress />
          </div>
        )}

        {etapa.fase === 'concluido' && (
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle2 />
              <AlertDescription>
                Catálogo atualizado a partir do Ciclone.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-3 gap-2.5">
              <Numero rotulo="Novos" valor={etapa.resultado.inseridos} />
              <Numero rotulo="Atualizados" valor={etapa.resultado.atualizados} />
              <Numero rotulo="Inativados" valor={etapa.resultado.inativados} />
            </div>
            <Button onClick={() => fechar(false)} className="w-full">
              Fechar
            </Button>
          </div>
        )}

        {etapa.fase === 'erro' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                {etapa.mensagem}
                <span className="mt-1 block text-xs">
                  O catálogo não foi alterado — a gravação só acontece no passo final.
                </span>
              </AlertDescription>
            </Alert>
            <Button variant="outline" onClick={cancelar} className="w-full">
              Tentar de novo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
