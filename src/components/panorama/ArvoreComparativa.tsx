import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import { chaveDoCaminho, type FonteDetalhe, type NoArvore } from '@/lib/panoramaComparativo';
import type { Medida } from '@/lib/panorama';
import { curto, exato, inteiro, moedaCurta, percentual } from '@/lib/panoramaFormato';

/**
 * A árvore do Panorama: a hierarquia inteira num scroll, com as fontes na mesma linha.
 *
 * Substitui a navegação de um nível por vez, que era visão de túnel — para comparar
 * OBEN com POWER dentro de RECEITUARIO era preciso subir e descer duas vezes,
 * guardando o primeiro número de cabeça. Aqui os dois ficam abertos lado a lado.
 *
 * **Cada linha tem as fontes do ERP na mesma linha**, e é isso que acaba com a
 * segmentação: fluxo (entrou/saiu) e posição (interno/mala) do MESMO recorte, sem
 * trocar de tela. A contagem do representante é a sexta coluna e entra só quando pedida
 * — ver `mostrarInventario`.
 *
 * ## Três decisões que vieram de uma revisão pensando em quem não conhece a tela
 *
 * 1. **Os números clicáveis se anunciam.** Eles abrem o detalhe da fonte, mas antes só
 *    se revelavam no hover — que não existe em toque e que ninguém procura. Metade da
 *    tela era invisível. Agora levam sublinhado pontilhado, a convenção de "tem mais
 *    aqui", e cada linha tem um botão explícito de produtos.
 * 2. **Abaixo de `md` vira cartão.** A tabela tem 52rem de largura mínima; num celular
 *    isso é rolagem horizontal obrigatória, e rolar para ver "Contado" faz perder a
 *    linha que se estava lendo.
 * 3. **O detalhe abre ANCORADO na linha.** Antes aparecia depois da tabela inteira,
 *    possivelmente fora da tela: a pessoa clicava e parecia que nada tinha acontecido.
 */

/** Número clicável de uma célula. Zerado não é clicável: não há o que investigar em 0. */
function Celula({
  valor,
  titulo,
  onAbrir,
}: {
  valor: string;
  titulo: string;
  onAbrir?: () => void;
}) {
  // `truncate` é a rede de segurança: mesmo com o formato curto, um valor fora do comum
  // não pode empurrar as colunas vizinhas. O exato vive no `title`.
  const base = 'block w-full truncate text-right text-sm tabular-nums';
  if (!onAbrir) return <span className={`${base} text-muted-foreground`}>{valor}</span>;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${titulo} — clique para detalhar`}
      className={`${base} rounded px-1 font-medium underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:bg-muted/60 hover:text-foreground hover:decoration-foreground`}
    >
      {valor}
    </button>
  );
}

interface Props {
  nos: NoArvore[];
  medida: Medida;
  /** Ex.: `01/01/26 a 24/08/26`. Vai no andar de cima, sobre as colunas de fluxo. */
  rotuloPeriodo?: string;
  /** Ex.: `mai–jul/26`. A base da cobertura, que NÃO é o período exibido. */
  baseCobertura?: string;
  /**
   * Acrescentar a coluna "Contado" e a diferença contra o ERP.
   *
   * Desligado, a tabela é só ERP e fica **mais estreita** — some uma coluna de 7rem, o
   * que é a diferença entre caber e não caber num notebook. Não basta esconder o
   * conteúdo: a largura mínima tem de encolher junto, senão a rolagem horizontal
   * continua lá pagando por uma coluna que não existe.
   */
  mostrarInventario: boolean;
  /**
   * Acrescentar margem e custo às células que já existem.
   *
   * **Sem coluna nova, de propósito.** A tabela já disputa largura a 52rem; três
   * colunas a mais forçariam rolagem horizontal justamente na leitura em que se
   * compara uma linha com a outra. Custo e margem viram SUBLINHA da célula de que
   * falam — o mesmo recurso que "Contado / vs sistema" já usa, e que custa altura em
   * vez de largura.
   */
  mostrarCusto: boolean;
  expandidos: ReadonlySet<string>;
  /** Caminho do nó com o detalhe aberto — é onde o painel é ancorado. */
  caminhoAberto?: string;
  onAlternar: (chave: string) => void;
  onDetalhe: (no: NoArvore, fonte: FonteDetalhe) => void;
  onProdutos: (no: NoArvore) => void;
  /** O painel de detalhe, renderizado logo abaixo da linha que o abriu. */
  renderDetalhe?: () => ReactNode;
}

export function ArvoreComparativa({
  nos,
  medida,
  rotuloPeriodo,
  baseCobertura,
  mostrarInventario,
  mostrarCusto,
  expandidos,
  caminhoAberto,
  onAlternar,
  onDetalhe,
  onProdutos,
  renderDetalhe,
}: Props) {
  const numero = (t: { quantidade: number; valor: number }) => curto(t, medida);

  /** As células de uma linha, na ordem em que a história se conta. */
  const celulas = (no: NoArvore) => [
    {
      id: 'entrou' as const,
      rotulo: 'Entrou',
      valor: numero(no.entrou),
      titulo: `Entradas de ${no.rotulo} — ${exato(no.entrou)}`,
      abre: no.entrou.quantidade !== 0,
    },
    {
      id: 'saiu' as const,
      rotulo: 'Saiu',
      valor: numero(no.saiu),
      titulo: `Saídas de ${no.rotulo} — ${exato(no.saiu)}`,
      abre: no.saiu.quantidade !== 0,
    },
    {
      id: 'interno' as const,
      rotulo: 'Interno',
      valor: numero(no.interno),
      titulo: `Na empresa — ${exato(no.interno)}`,
      abre: false,
    },
    {
      id: 'externo' as const,
      rotulo: 'Mala',
      valor: numero(no.externo),
      titulo: `Na mala, pelo sistema — ${exato(no.externo)}`,
      abre: no.externo.quantidade !== 0,
    },
    ...(mostrarInventario
      ? [
          {
            id: 'inventario' as const,
            rotulo: 'Contado',
            valor: no.divergencia === null ? '—' : numero(no.inventario),
            titulo:
              no.divergencia === null
                ? 'Sem inventário aprovado neste recorte'
                : `Contagem do representante — ${exato(no.inventario)}`,
            abre: no.divergencia !== null,
          },
        ]
      : []),
  ];

  /**
   * A sublinha de uma célula: o que a camada de custo acrescenta sem pedir largura.
   *
   * Sob "Saiu" vai a MARGEM, porque é dela que a receita fala. Sob "Interno" e "Mala"
   * vai o custo em reais — o dinheiro parado ali. Sob "Entrou" não vai nada: entrada já
   * chega pelo valor de aquisição, e repetir "custo" ali seria o mesmo número com
   * outro nome.
   *
   * Margem `null` vira traço em vez de sumir: a linha existir e estar vazia significa
   * "saiu sem receita" (leia-se bonificação), que é informação, não ausência dela.
   */
  const subCusto = (no: NoArvore, id: string): string | null => {
    if (!mostrarCusto) return null;
    if (id === 'saiu') return no.saiu.quantidade === 0 ? null : `${percentual(no.margemBruta)} margem`;
    if (id === 'interno') return no.interno.quantidade === 0 ? null : `${moedaCurta(no.interno.custo)} custo`;
    if (id === 'externo') return no.externo.quantidade === 0 ? null : `${moedaCurta(no.externo.custo)} custo`;
    return null;
  };

  const diferenca = (no: NoArvore) =>
    !mostrarInventario || no.divergencia === null
      ? null
      : `${no.divergencia >= 0 ? '+' : '−'}${inteiro(Math.abs(no.divergencia))} vs sistema`;

  const gatilho = (no: NoArvore, chave: string, aberto: boolean) =>
    no.temFilhos ? (
      <button
        type="button"
        onClick={() => onAlternar(chave)}
        aria-expanded={aberto}
        aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${no.rotulo}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
    ) : (
      <span className="w-[22px] shrink-0" />
    );

  return (
    <>
      {/* ── Tabela (md+) ──────────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        {/* As larguras andam juntas: cada coluna é `w-28` (7rem) e o `gap-2` entre elas
            é 0,5rem. Ligar "Contado" acrescenta 7,5rem à faixa "Hoje" e à largura
            mínima da tabela — mexer numa sem a outra desalinha o andar de cima. */}
        <div className={mostrarInventario ? 'min-w-[52rem]' : 'min-w-[44.5rem]'}>
          {/*
            Cabeçalho em DOIS ANDARES, e isso não é enfeite: as colunas têm duas
            naturezas, e lê-las como se fossem do mesmo intervalo é o erro mais fácil
            de cometer aqui. Fluxo é do PERÍODO; posição é de HOJE, sempre — trocar o
            período para "Mês" não muda uma unidade de estoque, porque saldo é foto.
          */}
          <div className="flex items-end gap-2 px-2 text-2xs font-semibold uppercase tracking-wider">
            <span className="flex-1" />
            <span className="w-[14.5rem] rounded-t-lg bg-muted/50 px-2 py-1 text-center text-muted-foreground">
              No período{rotuloPeriodo ? ` · ${rotuloPeriodo}` : ''}
            </span>
            <span
              className={`${
                mostrarInventario ? 'w-[22rem]' : 'w-[14.5rem]'
              } rounded-t-lg bg-primary/10 px-2 py-1 text-center text-primary`}
            >
              Hoje
            </span>
            <span className="w-16" />
            <span className="w-9" />
          </div>
          <div className="flex items-end gap-2 border-b border-border px-2 pb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Categoria</span>
            <span className="w-28 text-right">Entrou</span>
            <span className="w-28 text-right">Saiu</span>
            <span className="w-28 text-right">Interno</span>
            <span className="w-28 text-right">Mala</span>
            {mostrarInventario && <span className="w-28 text-right">Contado</span>}
            <span
              className="w-16 text-right"
              title={`Meses que o estoque de hoje dura no ritmo de saída${baseCobertura ? ` de ${baseCobertura}` : ''}. A base é fixa e não muda com o período exibido.`}
            >
              Cobert.
            </span>
            <span className="w-9" />
          </div>

          <div className="divide-y divide-border/60">
            {nos.map((no) => {
              const chave = chaveDoCaminho(no.caminho);
              const aberto = expandidos.has(chave);
              const comDetalhe = caminhoAberto === chave;
              return (
                <div key={chave}>
                  <div
                    className={`flex items-center gap-2 px-2 py-2 transition-colors ${
                      comDetalhe ? 'bg-muted/40' : 'hover:bg-muted/20'
                    }`}
                  >
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1"
                      // A indentação sai do nível e não de um wrapper por camada: mantém
                      // a lista plana no DOM, o que é o que deixa a rolagem contínua.
                      style={{ paddingLeft: `${no.nivel * 1.25}rem` }}
                    >
                      {gatilho(no, chave, aberto)}
                      <span className="truncate text-sm font-semibold">{no.rotulo}</span>
                    </div>

                    {celulas(no).map((c) => {
                      /* Uma sublinha por célula, venha de onde vier. A diferença da
                         contagem e a margem nunca disputam o mesmo lugar — são de
                         colunas diferentes —, então um campo só basta e o layout
                         continua o mesmo com uma camada ou com as duas.

                         Sem cor semântica em nenhuma das duas: nem toda variação de
                         contagem é erro e nem toda margem baixa é problema (bonificação
                         é margem negativa por definição). Vermelho aqui transformaria
                         rotina em alarme. */
                      const sub = c.id === 'inventario' ? diferenca(no) : subCusto(no, c.id);
                      return (
                        <span key={c.id} className="w-28">
                          <Celula
                            valor={c.valor}
                            titulo={c.titulo}
                            onAbrir={c.abre ? () => onDetalhe(no, c.id) : undefined}
                          />
                          {sub && (
                            <span className="block truncate px-1 text-right text-2xs tabular-nums text-muted-foreground">
                              {sub}
                            </span>
                          )}
                        </span>
                      );
                    })}

                    <span className="w-16 text-right text-2xs tabular-nums text-muted-foreground">
                      <span
                        title={
                          no.cobertura === null
                            ? `Sem saída em ${baseCobertura ?? 'na base'}`
                            : `${inteiro(no.porMes)} un./mês em ${baseCobertura ?? 'na base'}`
                        }
                      >
                        {no.cobertura === null ? '—' : `${no.cobertura.toFixed(1)}m`}
                      </span>
                    </span>
                    <span className="w-9 text-right">
                      <button
                        type="button"
                        onClick={() => onProdutos(no)}
                        aria-label={`Ver produtos de ${no.rotulo}`}
                        title="Ver os produtos desta categoria"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        <Package size={15} />
                      </button>
                    </span>
                  </div>
                  {comDetalhe && renderDetalhe && (
                    <div className="border-y border-primary/30 bg-muted/20 p-3">
                      {renderDetalhe()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Cartões (abaixo de md) ────────────────────────────────────────── */}
      <div className="space-y-2 md:hidden">
        {nos.map((no) => {
          const chave = chaveDoCaminho(no.caminho);
          const aberto = expandidos.has(chave);
          const comDetalhe = caminhoAberto === chave;
          const [entrou, saiu, ...posicao] = celulas(no);
          return (
            <div key={chave} style={{ marginLeft: `${no.nivel * 0.75}rem` }}>
              <div
                className={`rounded-xl border p-3 ${
                  comDetalhe ? 'border-primary/40 bg-muted/30' : 'border-border/80 bg-card'
                }`}
              >
                <div className="flex items-center gap-1">
                  {gatilho(no, chave, aberto)}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {no.rotulo}
                  </span>
                  <button
                    type="button"
                    onClick={() => onProdutos(no)}
                    aria-label={`Ver produtos de ${no.rotulo}`}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60"
                  >
                    <Package size={15} />
                  </button>
                </div>

                <p className="mt-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  No período{rotuloPeriodo ? ` · ${rotuloPeriodo}` : ''}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[entrou, saiu].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={c.abre ? () => onDetalhe(no, c.id) : undefined}
                      disabled={!c.abre}
                      className="rounded-lg border border-border/60 px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/50 disabled:opacity-60"
                    >
                      <span className="block text-2xs text-muted-foreground">{c.rotulo}</span>
                      <span className="block truncate text-sm font-semibold tabular-nums">
                        {c.valor}
                      </span>
                      {subCusto(no, c.id) && (
                        <span className="block truncate text-2xs tabular-nums text-muted-foreground">
                          {subCusto(no, c.id)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <p className="mt-2.5 text-2xs font-semibold uppercase tracking-wider text-primary">
                  Hoje
                </p>
                <div
                  className={`mt-1 grid gap-2 ${
                    mostrarInventario ? 'grid-cols-3' : 'grid-cols-2'
                  }`}
                >
                  {posicao.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={c.abre ? () => onDetalhe(no, c.id) : undefined}
                      disabled={!c.abre}
                      className="rounded-lg border border-border/60 px-2 py-1.5 text-left transition-colors enabled:hover:bg-muted/50 disabled:opacity-60"
                    >
                      <span className="block text-2xs text-muted-foreground">{c.rotulo}</span>
                      <span className="block truncate text-sm font-semibold tabular-nums">
                        {c.valor}
                      </span>
                      {subCusto(no, c.id) && (
                        <span className="block truncate text-2xs tabular-nums text-muted-foreground">
                          {subCusto(no, c.id)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <p className="mt-2 text-2xs tabular-nums text-muted-foreground">
                  {no.cobertura === null
                    ? `Sem saída em ${baseCobertura ?? 'na base'}`
                    : `Cobertura ${no.cobertura.toFixed(1)} meses (base ${baseCobertura ?? '—'})`}
                  {diferenca(no) ? ` · ${diferenca(no)}` : ''}
                </p>
              </div>
              {comDetalhe && renderDetalhe && <div className="mt-2">{renderDetalhe()}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
