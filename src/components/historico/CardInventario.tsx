import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, FileDown, Pencil } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusInventarioBadge } from '@/components/StatusInventarioBadge';
import { useIsHandheld } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

export type InventarioComItens = Database['public']['Tables']['inventarios']['Row'] & {
  itens_inventario: Database['public']['Tables']['itens_inventario']['Row'][];
};

/**
 * Um inventário do histórico.
 *
 * O QUE ESTAVA RUIM NO CELULAR:
 *
 * 1. O NOME DO PRODUTO SUMIA. A tabela escondia a coluna com `hidden sm:table-cell`, e
 *    sobrava `OB1111 A01` e um número — a única coisa que o vendedor lê para reconhecer
 *    o que contou era exatamente a que não cabia. Agora é lista, e o nome fica sempre.
 * 2. O CABEÇALHO ESTOURAVA. Data, contagem, status, exportar, Corrigir, Recontar e a
 *    seta na mesma linha viravam três fileiras de controles antes de qualquer conteúdo.
 *    As ações desceram para dentro do cartão aberto, com largura total no aparelho de mão.
 * 3. NÃO ERA BOTÃO. O cabeçalho tinha `onClick` numa `div` e a seta era decorativa: sem
 *    teclado, sem `aria-expanded`, invisível para leitor de tela.
 * 4. A LISTA NÃO TINHA TETO. Um inventário de quatrocentos itens abria quatrocentas
 *    linhas dentro do cartão.
 */
interface Props {
  inventario: InventarioComItens;
  aberto: boolean;
  onAlternar: () => void;
}

/** Acima disto o cartão mostra uma amostra: o resto vem sob pedido. */
const LIMITE_ITENS = 40;

export function CardInventario({ inventario, aberto, onAlternar }: Props) {
  const navigate = useNavigate();
  const handheld = useIsHandheld();
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const itens = inventario.itens_inventario;
  const pecas = itens.reduce((soma, i) => soma + i.quantidade_fisica, 0);
  const data = new Date(inventario.data_inventario);
  const podeMexer = inventario.status !== 'aprovado';
  const visiveis = mostrarTodos ? itens : itens.slice(0, LIMITE_ITENS);
  const idPainel = `inventario-${inventario.id}`;

  const exportarExcel = () => {
    const linhas = itens.map((item) => ({
      'Código Auxiliar': item.codigo_auxiliar,
      Produto: item.nome_produto || '',
      'Quantidade Física': item.quantidade_fisica,
      'Contagem Anterior': item.quantidade_anterior ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `inventario_${format(data, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <Card className="overflow-hidden">
      {/* Botão de verdade, e não `div` com `onClick`: é o que dá teclado, foco visível e
          o estado aberto/fechado para quem usa leitor de tela. */}
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">
            {format(data, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground tabular-nums">
            {itens.length} produtos · {pecas} peças · às {format(data, 'HH:mm')}
          </p>
        </div>

        <StatusInventarioBadge status={inventario.status} />

        <ChevronDown
          size={20}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180'
          )}
        />
      </button>

      {aberto && (
        <CardContent id={idPainel} className="space-y-4 border-t border-border/80 pt-5">
          {/* As ações moram aqui e não no cabeçalho: no celular elas ganham largura
              total e 44px de altura, em vez de disputarem a linha com o status. */}
          <div className={cn('flex gap-2', handheld ? 'flex-col' : 'flex-wrap')}>
            {/* UM botão, não dois. "Corrigir" e "Recontar" eram a mesma tela: enquanto o
                vendedor não manda recontar um recorte, nada foi zerado e ele pode ajustar
                os números na mão. Separar os dois obrigava a classificar a intenção antes
                de saber o que ele ia fazer. A recontagem é uma ferramenta lá dentro. */}
            {podeMexer && (
              <Button
                className={handheld ? 'w-full font-semibold' : 'font-semibold'}
                onClick={() => navigate(`/inventario/${inventario.id}`)}
              >
                <Pencil className="mr-2" size={16} />
                Corrigir contagem
              </Button>
            )}
            <Button
              variant="outline"
              className={handheld ? 'w-full' : undefined}
              onClick={exportarExcel}
            >
              <FileDown className="mr-2" size={16} />
              Exportar Excel
            </Button>
          </div>

          {inventario.observacoes && (
            <div className="rounded-xl border border-border/60 bg-muted/50 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suas observações
              </p>
              <p className="mt-1 text-sm text-foreground">{inventario.observacoes}</p>
            </div>
          )}

          {inventario.observacoes_gerente && (
            <div className="rounded-xl border border-warning/30 bg-warning-subtle p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-warning-strong">
                O gerente pediu
              </p>
              <p className="mt-1 text-sm font-medium text-warning-strong">
                {inventario.observacoes_gerente}
              </p>
            </div>
          )}

          {itens.length === 0 ? (
            <p className="rounded-xl border border-border/80 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Este inventário não tem itens.
            </p>
          ) : (
            <>
              <ul className="overflow-hidden rounded-xl border border-border/80">
                {visiveis.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border/60 p-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Mesma hierarquia da tela de contagem: código primeiro, descrição
                          como apoio. Duas telas que mostram a mesma linha não podem
                          discordar sobre qual informação é a principal. */}
                      <p className="font-mono text-base font-bold leading-tight tracking-wide text-foreground">
                        {item.codigo_auxiliar}
                      </p>
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">
                        {item.nome_produto || 'Produto sem nome cadastrado'}
                      </p>
                      {/* Só quando o número mudou: repetir "antes 4 → 4" em toda linha
                          esconderia, no meio do ruído, as poucas que de fato mudaram. */}
                      {item.quantidade_anterior !== null &&
                        item.quantidade_anterior !== item.quantidade_fisica && (
                          <p className="mt-0.5 text-2xs text-muted-foreground tabular-nums">
                            recontado · antes {item.quantidade_anterior}
                          </p>
                        )}
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums">
                      {item.quantidade_fisica}
                    </span>
                  </li>
                ))}
              </ul>

              {!mostrarTodos && itens.length > LIMITE_ITENS && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setMostrarTodos(true)}
                >
                  Ver os outros {itens.length - LIMITE_ITENS} produtos
                </Button>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
