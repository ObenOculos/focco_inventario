import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudOff, Search, X } from 'lucide-react';
import { agrupar, eixoDe, type EixoId, type Medida } from '@/lib/panorama';
import type { LinhaPanorama } from '@/hooks/usePanoramaQuery';
import {
  EIXOS_DA_FONTE,
  TITULO_DA_FONTE,
  type FonteDetalhe,
} from '@/lib/panoramaComparativo';

/**
 * O detalhe de uma célula da árvore — a lente antiga, agora alcançada por clique.
 *
 * É aqui que voltam os eixos que não cabem no comparativo: tipo de saída, fornecedor,
 * quem está com a mercadoria, qual vendedor contou. Eles não são telas paralelas; são
 * o aprofundamento de um número que o gestor apontou.
 *
 * Tudo é calculado sobre o que a tela JÁ carregou — abrir um detalhe não custa rede.
 * A exceção é a lista de produtos, que vem do servidor porque o nível de produto não
 * cabe nas respostas de entrada.
 */

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function Linha({
  rotulo,
  valor,
  apoio,
  participacao,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  participacao: number;
}) {
  return (
    <div className="flex items-center gap-4 px-3.5 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{rotulo}</span>
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {PORCENTAGEM.format(participacao)}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${participacao * 100}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">{valor}</p>
        <p className="text-2xs tabular-nums text-muted-foreground">{apoio}</p>
      </div>
    </div>
  );
}

interface Props {
  titulo: string;
  fonte: FonteDetalhe;
  /** As linhas da fonte já recortadas pelo caminho da árvore. */
  linhas: readonly LinhaPanorama[];
  medida: Medida;
  /** Produtos do recorte, quando pedidos. `null` = ainda não foram pedidos. */
  produtos: readonly LinhaPanorama[] | null;
  carregandoProdutos: boolean;
  erroProdutos: string | null;
  onProdutos: () => void;
  onFechar: () => void;
}

export function PainelDetalhe({
  titulo,
  fonte,
  linhas,
  medida,
  produtos,
  carregandoProdutos,
  erroProdutos,
  onProdutos,
  onFechar,
}: Props) {
  const eixos = EIXOS_DA_FONTE[fonte];
  const [eixo, setEixo] = useState<EixoId>(eixos[0]);
  const [busca, setBusca] = useState('');

  const nos = useMemo(() => agrupar(linhas, eixo, medida), [linhas, eixo, medida]);

  const produtosFiltrados = useMemo(() => {
    if (!produtos) return [];
    const alvo = busca.trim().toLowerCase();
    const porSku = new Map<string, { rotulo: string; quantidade: number; valor: number }>();
    for (const p of produtos) {
      const chave = p.codigo_auxiliar ?? String(p.codigo_produto ?? '');
      const atual = porSku.get(chave) ?? {
        rotulo: p.nome_produto ? `${chave} · ${p.nome_produto}` : chave,
        quantidade: 0,
        valor: 0,
      };
      atual.quantidade += Number(p.quantidade) || 0;
      atual.valor += Number(p.valor) || 0;
      porSku.set(chave, atual);
    }
    const lista = [...porSku.values()];
    // Busca sobre o rótulo já montado: ele carrega código e nome, que são as duas
    // coisas pelas quais alguém procura um óculos.
    const visiveis = alvo ? lista.filter((l) => l.rotulo.toLowerCase().includes(alvo)) : lista;
    return visiveis.sort((a, b) => b[medida] - a[medida]);
  }, [produtos, busca, medida]);

  const numero = (t: { quantidade: number; valor: number }) =>
    medida === 'valor' ? MOEDA.format(t.valor) : INTEIRO.format(t.quantidade);

  const totalProdutos = produtosFiltrados.reduce((s, p) => s + p[medida], 0);

  return (
    <div className="rounded-2xl border border-primary/40 bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3.5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="text-2xs text-muted-foreground">{TITULO_DA_FONTE[fonte]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {eixos.length > 1 &&
            eixos.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={eixo === id}
                onClick={() => setEixo(id)}
                className={`rounded-lg px-2.5 py-1 text-2xs font-semibold transition-colors ${
                  eixo === id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {eixoDe(id).rotulo}
              </button>
            ))}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar detalhe"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {nos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada neste recorte.</p>
        ) : (
          nos.map((no) => (
            <Linha
              key={no.chave}
              rotulo={no.rotulo}
              valor={numero(no)}
              apoio={medida === 'valor' ? `${INTEIRO.format(no.quantidade)} un.` : MOEDA.format(no.valor)}
              participacao={no.participacao}
            />
          ))
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        {produtos === null && !carregandoProdutos && (
          <Button variant="outline" size="sm" onClick={onProdutos}>
            <Search className="h-4 w-4" />
            Ver produtos deste recorte
          </Button>
        )}

        {carregandoProdutos && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        )}

        {erroProdutos && (
          <Alert variant="destructive">
            <CloudOff className="h-4 w-4" />
            <AlertDescription>{erroProdutos}</AlertDescription>
          </Alert>
        )}

        {produtos !== null && !carregandoProdutos && !erroProdutos && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por código ou nome"
                aria-label="Buscar produto"
              />
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {INTEIRO.format(produtosFiltrados.length)} SKUs
              </span>
            </div>
            {/* Lista alta rola dentro de si: no recorte de uma marca inteira são
                centenas de SKUs, e empurrar a página inteira faria perder a árvore. */}
            <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
              {produtosFiltrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum produto com esse termo.
                </p>
              ) : (
                produtosFiltrados.map((p) => (
                  <Linha
                    key={p.rotulo}
                    rotulo={p.rotulo}
                    valor={numero(p)}
                    apoio={medida === 'valor' ? `${INTEIRO.format(p.quantidade)} un.` : MOEDA.format(p.valor)}
                    participacao={totalProdutos > 0 ? p[medida] / totalProdutos : 0}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
