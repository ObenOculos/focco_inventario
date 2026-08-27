import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudOff, Search, X } from 'lucide-react';
import { agrupar, eixoDe, type EixoId, type Medida, type NoAgregado } from '@/lib/panorama';
import type { LinhaPanorama } from '@/hooks/usePanoramaQuery';
import {
  EIXOS_DA_FONTE,
  rotuloLinhas,
  SAIDA_TRANSFERENCIA,
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

/**
 * A margem de um grupo, pronta para virar texto de apoio.
 *
 * `null` quando não houve receita — e aqui isso acontece de verdade: a BONIFICAÇÃO sai
 * com valor perto de zero e custo real. É justamente a linha que este painel existe
 * para revelar, e "—" com o valor em reais ao lado conta a história melhor que um
 * "−12.400%" que ninguém consegue ler.
 */
const margemDe = (t: { valor: number; custo: number }) =>
  t.valor > 0 ? `${PORCENTAGEM.format((t.valor - t.custo) / t.valor)} margem` : null;

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
  /**
   * Anexar margem ao apoio de cada linha. Só faz sentido em SAÍDA: é a única fonte
   * com receita e custo do mesmo movimento.
   */
  mostrarCusto: boolean;
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
  mostrarCusto,
  carregandoProdutos,
  erroProdutos,
  onProdutos,
  onFechar,
}: Props) {
  const eixos = EIXOS_DA_FONTE[fonte];
  const [eixo, setEixo] = useState<EixoId>(eixos[0]);
  const [busca, setBusca] = useState('');

  /**
   * O eixo aberto pertence à FONTE, e a fonte troca sem o painel desmontar.
   *
   * ⚠️ Clicar em "Saiu" na mesma linha que estava aberta em "Entrou" mantém este
   * componente montado — mesma posição na árvore, mesmo estado. Sem esta sincronização
   * o painel continuava agrupando por `classifEntrada`, que não existe em saída: a lista
   * inteira virava "Sem classificação" e nenhum botão de eixo aparecia marcado. Fechar e
   * reabrir "consertava" porque aí sim havia desmontagem.
   *
   * A busca vai junto: a lista de produtos é refeita a cada troca de fonte, e um termo
   * herdado da fonte anterior esconderia produtos sem dizer por quê.
   */
  const [fonteMontada, setFonteMontada] = useState<FonteDetalhe>(fonte);
  if (fonteMontada !== fonte) {
    setFonteMontada(fonte);
    setEixo(eixos[0]);
    setBusca('');
  }

  const nos = useMemo(() => agrupar(linhas, eixo, medida), [linhas, eixo, medida]);

  /**
   * Receita e custo por grupo do eixo aberto — calculado aqui, não em `agrupar`.
   *
   * `agrupar` serve a todas as lentes do Panorama e a maioria não tem custo nenhum;
   * carregar o campo lá obrigaria entrada, inventário e série mensal a somar zeros.
   * A passada extra é sobre um array que já está em memória e já foi recortado pelo
   * caminho da árvore.
   */
  const custoPorChave = useMemo(() => {
    if (!mostrarCusto || fonte !== 'saiu') return null;
    const e = eixoDe(eixo);
    const mapa = new Map<string, { valor: number; custo: number }>();
    for (const l of linhas) {
      // Remessa fica de fora e o grupo dela acaba com receita zero — que é como
      // `margemDe` devolve `null` e a linha simplesmente não ganha margem nenhuma.
      // Sem invenção de caso especial no lugar que desenha.
      if (l.classif_operacao === SAIDA_TRANSFERENCIA) continue;
      const chave = e.chaveDe(l);
      const atual = mapa.get(chave) ?? { valor: 0, custo: 0 };
      atual.valor += Number(l.valor) || 0;
      atual.custo += Number(l.custo) || 0;
      mapa.set(chave, atual);
    }
    return mapa;
  }, [mostrarCusto, fonte, linhas, eixo]);

  /**
   * A DATA da contagem de cada grupo — só faz sentido na fonte inventário.
   *
   * ⚠️ É a informação que faltava para o número ser conferível. O Panorama usa o ÚLTIMO
   * inventário aprovado de cada vendedor, e a última contagem pode ser um FRAGMENTO:
   * quem manda a mala em dois ou três inventários no mesmo dia, ou faz uma recontagem
   * de um recorte só, tem aqui um total menor que a contagem completa que fez antes.
   * Sem a data na tela isso parece número errado; com ela, parece o que é.
   */
  const contagemPorChave = useMemo(() => {
    if (fonte !== 'inventario') return null;
    const e = eixoDe(eixo);
    const mapa = new Map<string, { de: string; ate: string }>();
    for (const l of linhas) {
      const dia = l.data_inventario;
      if (!dia) continue;
      const chave = e.chaveDe(l);
      const atual = mapa.get(chave);
      // Comparação de string ISO: `AAAA-MM-DD` ordena igual à cronologia e não
      // arrasta fuso horário para dentro da conta.
      if (!atual) mapa.set(chave, { de: dia, ate: dia });
      else {
        if (dia < atual.de) atual.de = dia;
        if (dia > atual.ate) atual.ate = dia;
      }
    }
    return mapa;
  }, [fonte, linhas, eixo]);

  const produtosFiltrados = useMemo(() => {
    if (!produtos) return [];
    const alvo = busca.trim().toLowerCase();
    const porSku = new Map<
      string,
      { rotulo: string; quantidade: number; valor: number; custo: number }
    >();
    for (const p of produtos) {
      const chave = p.codigo_auxiliar ?? String(p.codigo_produto ?? '');
      const atual = porSku.get(chave) ?? {
        rotulo: p.nome_produto ? `${chave} · ${p.nome_produto}` : chave,
        quantidade: 0,
        valor: 0,
        custo: 0,
      };
      atual.quantidade += Number(p.quantidade) || 0;
      atual.valor += Number(p.valor) || 0;
      // Zero nas fontes sem custo — a margem por SKU só aparece em saída, de qualquer
      // forma, e ali o gateway manda o campo.
      atual.custo += Number(p.custo) || 0;
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

  /**
   * O texto de apoio: a OUTRA grandeza, mais a margem quando ela existe.
   *
   * "A outra" porque repetir a medida ativa embaixo dela não diz nada — em valor o
   * apoio traz as unidades, em unidades traz os reais. A margem entra no fim porque é
   * a camada opcional, e some junto com ela.
   */
  const apoio = (t: { quantidade: number; valor: number }, comCusto?: { valor: number; custo: number }) => {
    const base = medida === 'valor' ? `${INTEIRO.format(t.quantidade)} un.` : MOEDA.format(t.valor);
    const margem = comCusto ? margemDe(comCusto) : null;
    return margem ? `${base} · ${margem}` : base;
  };

  const dataBr = (iso: string) => {
    try {
      return format(parseISO(iso), 'dd/MM/yyyy');
    } catch {
      return iso;
    }
  };

  /**
   * O apoio de um grupo: a outra grandeza, de quantos itens ela saiu, e — só na
   * contagem — de quando.
   *
   * O substantivo vem de `rotuloLinhas` porque `linhas` não conta a mesma coisa nas
   * cinco fontes: produto nos estoques, linha de NOTA no fluxo. Escrever "produtos"
   * em toda parte deixaria o rótulo mais uniforme e o número errado.
   */
  const apoioDoGrupo = (no: NoAgregado) => {
    const partes = [apoio(no, custoPorChave?.get(no.chave))];
    partes.push(`${INTEIRO.format(no.linhas)} ${rotuloLinhas(fonte, no.linhas)}`);
    const quando = contagemPorChave?.get(no.chave);
    if (quando) {
      partes.push(
        quando.de === quando.ate
          ? `contagem de ${dataBr(quando.ate)}`
          : `contagens de ${dataBr(quando.de)} a ${dataBr(quando.ate)}`
      );
    }
    return partes.join(' · ');
  };

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
              apoio={apoioDoGrupo(no)}
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
                    apoio={apoio(p, mostrarCusto && fonte === 'saiu' ? p : undefined)}
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
