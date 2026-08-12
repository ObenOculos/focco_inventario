import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChevronDown,
  ChevronRight,
  Home,
  Layers,
  ListTree,
  Minus,
  Package,
  TriangleAlert,
} from 'lucide-react';
import type { LinhaExibida } from '@/hooks/useCompararInventariosQuery';
import {
  NIVEIS,
  SEM_CATEGORIA,
  categoriaDa,
  type NivelCategoria,
} from '@/lib/categoriasProduto';

/**
 * Leitura gerencial do comparativo.
 *
 * A tabela do modo normal responde "qual produto divergiu"; esta camada responde
 * "qual PARTE do estoque divergiu, e quanto isso custa" — que é a pergunta de quem
 * decide o que fazer, não de quem confere item a item.
 *
 * Três níveis de aproximação, sempre sobre a mesma hierarquia do Ciclone
 * (Marca → Tipo → Subtipo → Grupo):
 *
 *   Sintético  a árvore inteira num scroll, para escolher ONDE olhar
 *   Analítico  cards de um nível só, para comparar categorias irmãs
 *   Detalhado  os produtos de um recorte, com o código auxiliar
 *
 * O Detalhado não está no seletor de propósito: ele é o fim do caminho, alcançado
 * clicando numa folha. Oferecê-lo como opção solta significaria "listar todos os
 * produtos" — que é exatamente a listagem imensa que o modo gestor existe para
 * evitar, e que o Modo Tabela da tela já faz melhor.
 *
 * O alternador entre estes níveis é renderizado PELA PÁGINA, ao lado do alternador de
 * modo de leitura — ver o comentário na trilha, abaixo.
 */

export type SubmodoGestor = 'sintetico' | 'analitico' | 'detalhado';

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const unid = (v: number) => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1 });

interface Agregado {
  categoria: string;
  produtos: number;
  /**
   * O TAMANHO da categoria: unidades contadas e quanto elas valem (lado B, a contagem
   * final). Sem eles, "R$ 5 mil de impacto" não diz se a categoria vai bem ou mal — é
   * ótimo num estoque de R$ 500 mil e grave num de R$ 8 mil, e o card mostrava
   * exatamente o mesmo número nos dois casos.
   */
  unidades: number;
  valor: number;
  /**
   * O MOVIMENTO do período, vindo da reconciliação com o Ciclone.
   *
   * Fica zerado quando a reconciliação está desligada, e a tela esconde as colunas —
   * mostrar "0 un." de remessa onde ninguém consultou o ERP afirmaria que não houve
   * remessa, que é diferente de não ter perguntado.
   *
   * Os `Itens` contam PRODUTOS DISTINTOS com movimento, não linhas da categoria: numa
   * marca de 300 produtos onde 65 receberam remessa, é o 65 que diz o tamanho do que
   * entrou — e é a leitura que o total de unidades sozinho não dá.
   */
  remessaQtd: number;
  remessaItens: number;
  vendaQtd: number;
  vendaItens: number;
  /**
   * Os dois extremos da equação da reconciliação: `anterior` é a **Qtd A** — a contagem
   * do inventário escolhido como lado A, e NÃO o `quantidade_anterior` da recontagem,
   * que é outra coisa e vive na tela de contagem. `esperado` é `A + remessa − venda`.
   *
   * Sem eles a tela mostrava o movimento e a consequência (Falta e Sobra) sem o meio da
   * conta: dava para ver "+120 de remessa" e "12 faltando" sem nenhum jeito de saber
   * contra QUE número as unidades contadas foram medidas.
   */
  anterior: number;
  esperado: number;
  iguais: number;
  faltaQtd: number;
  faltaValor: number;
  faltaItens: number;
  sobraQtd: number;
  sobraValor: number;
  sobraItens: number;
  /**
   * Falta e sobra somadas em MÓDULO. O líquido serve para saber o resultado
   * financeiro; o módulo serve para saber onde está o problema — e é essa a
   * pergunta dos dois níveis agregados. Numa categoria com R$ 5 mil faltando e
   * R$ 5 mil sobrando o líquido é zero, e ela é justamente a que precisa ser aberta.
   */
  impacto: number;
}

function agregar(linhas: LinhaExibida[], nivel: NivelCategoria): Agregado[] {
  const mapa = new Map<string, Agregado>();

  for (const l of linhas) {
    const categoria = categoriaDa(l, nivel);
    let a = mapa.get(categoria);
    if (!a) {
      a = {
        categoria,
        produtos: 0,
        unidades: 0,
        valor: 0,
        remessaQtd: 0,
        remessaItens: 0,
        vendaQtd: 0,
        vendaItens: 0,
        anterior: 0,
        esperado: 0,
        iguais: 0,
        faltaQtd: 0,
        faltaValor: 0,
        faltaItens: 0,
        sobraQtd: 0,
        sobraValor: 0,
        sobraItens: 0,
        impacto: 0,
      };
      mapa.set(categoria, a);
    }

    a.produtos++;
    a.unidades += l.quantidade_b;
    a.valor += l.quantidade_b * l.valor_unitario;
    a.remessaQtd += l.remessa;
    if (l.remessa !== 0) a.remessaItens++;
    a.vendaQtd += l.venda;
    if (l.venda !== 0) a.vendaItens++;
    a.anterior += l.quantidade_a;
    a.esperado += l.esperado;
    const valor = l.diferenca * l.valor_unitario;
    if (l.diferenca < 0) {
      a.faltaQtd += l.diferenca;
      a.faltaValor += valor;
      a.faltaItens++;
    } else if (l.diferenca > 0) {
      a.sobraQtd += l.diferenca;
      a.sobraValor += valor;
      a.sobraItens++;
    } else {
      a.iguais++;
    }
    a.impacto += Math.abs(valor);
  }

  /**
   * Maior impacto primeiro — a primeira pergunta é "onde está o problema".
   *
   * O desempate por unidades não é detalhe: categoria inteira sem preço cadastrado
   * tem impacto zero em R$ e afundaria para o fim mesmo com dezenas de peças
   * faltando. É a mesma razão do desempate da tabela de produtos.
   */
  return [...mapa.values()].sort((x, y) => {
    if (y.impacto !== x.impacto) return y.impacto - x.impacto;
    const qx = Math.abs(x.faltaQtd) + x.sobraQtd;
    const qy = Math.abs(y.faltaQtd) + y.sobraQtd;
    if (qy !== qx) return qy - qx;
    return x.categoria.localeCompare(y.categoria);
  });
}

// ── Árvore do Sintético ──────────────────────────────────────────────────────

interface No {
  /** Caminho serializado; identidade estável do nó para o conjunto de expandidos. */
  chave: string;
  caminho: string[];
  /** Índice em `NIVEIS`. Vira a indentação da linha. */
  nivel: number;
  agregado: Agregado;
  filhos: No[];
}

/**
 * Monta a hierarquia inteira de uma vez, em memória.
 *
 * A recursão parece cara e não é: as linhas já estão todas no cliente (a comparação
 * as baixou para os cards e para a tabela), e o catálogo real tem ~17 combinações de
 * categoria. Carregar sob demanda a cada expansão só faria sentido se cada nível
 * custasse uma ida ao servidor — aqui não custa nenhuma, e a espera seria inventada.
 */
function construirArvore(linhas: LinhaExibida[], caminho: string[] = []): No[] {
  const nivel = caminho.length;
  if (nivel >= NIVEIS.length) return [];

  const chaveNivel = NIVEIS[nivel].chave;
  return agregar(linhas, chaveNivel).map((agregado) => {
    const doNo = linhas.filter((l) => categoriaDa(l, chaveNivel) === agregado.categoria);
    const novoCaminho = [...caminho, agregado.categoria];
    return {
      chave: novoCaminho.join(' › '),
      caminho: novoCaminho,
      nivel,
      agregado,
      filhos: construirArvore(doNo, novoCaminho),
    };
  });
}

/** Só os nós visíveis, na ordem da tela: um nó abre os filhos logo abaixo de si. */
function achatar(nos: No[], expandidos: Set<string>, saida: No[] = []): No[] {
  for (const no of nos) {
    saida.push(no);
    if (expandidos.has(no.chave)) achatar(no.filhos, expandidos, saida);
  }
  return saida;
}

function todasAsChaves(nos: No[], saida: string[] = []): string[] {
  for (const no of nos) {
    saida.push(no.chave);
    todasAsChaves(no.filhos, saida);
  }
  return saida;
}

/**
 * Um número do recorte aberto, na faixa acima do conteúdo.
 *
 * `flex-1` com largura mínima em vez de grade de N colunas: a faixa tem um, dois ou três
 * cartões conforme o que foi reconciliado, e uma grade fixa deixaria um cartão solto
 * ocupando um terço da largura quando a reconciliação está desligada.
 */
function CartaoResumo({
  rotulo,
  valor,
  apoio,
  nota,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  /** Linha extra, já colorida pelo chamador. Usada pelo desvio contra o esperado. */
  nota?: ReactNode;
  /** Marca o cartão como o RESULTADO da cadeia, não mais uma parcela dela. */
  destaque?: boolean;
}) {
  return (
    <div
      className={`min-w-[9rem] flex-1 rounded-xl border bg-card px-3.5 py-2.5 shadow-xs ${
        destaque ? 'border-primary/50' : 'border-border/80'
      }`}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="text-lg font-bold tabular-nums">{valor}</p>
      <p className="truncate text-2xs tabular-nums text-muted-foreground">{apoio}</p>
      {nota}
    </div>
  );
}

/** Barra de acuracidade da categoria: fração de produtos sem diferença nenhuma. */
function BarraAcuracidade({ iguais, produtos }: { iguais: number; produtos: number }) {
  const fracao = produtos > 0 ? iguais / produtos : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-2xs text-muted-foreground">
        <span>Acuracidade</span>
        <span className="tabular-nums">
          {pct(fracao)} · {iguais}/{produtos}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-success transition-[width]"
          style={{ width: `${fracao * 100}%` }}
        />
      </div>
    </div>
  );
}

function CardCategoria({
  a,
  onAbrir,
  comRemessa,
  comVenda,
}: {
  a: Agregado;
  onAbrir: () => void;
  comRemessa: boolean;
  comVenda: boolean;
}) {
  const semCadastro = a.categoria === SEM_CATEGORIA;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-xs transition-colors hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={a.categoria}>
            {a.categoria}
          </p>
          {/* Produtos, unidades e valor juntos: é o tamanho da categoria, e é contra ele
              que o Impacto logo abaixo passa a ser lido. */}
          <p className="text-2xs tabular-nums text-muted-foreground">
            {a.produtos} produto{a.produtos !== 1 ? 's' : ''} · {unid(a.unidades)} un. ·{' '}
            {moeda(a.valor)}
          </p>
          {/* Uma linha só, e só quando houve movimento: o cartão já carrega oito
              números, e "Remessa — · Venda —" em toda categoria parada gastaria a linha
              para não dizer nada. O total do recorte fica na faixa acima da grade. */}
          {(a.remessaQtd !== 0 || a.vendaQtd !== 0) && (
            <p className="text-2xs tabular-nums text-muted-foreground">
              {comRemessa && `Remessa +${unid(a.remessaQtd)}`}
              {comRemessa && comVenda && ' · '}
              {comVenda && `Venda −${unid(a.vendaQtd)}`}
            </p>
          )}
        </div>
        {semCadastro ? (
          <Badge variant="warning" className="shrink-0 px-2.5 py-0.5 text-2xs">
            Sem cadastro
          </Badge>
        ) : (
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Impacto
        </p>
        <p className="text-xl font-bold tabular-nums">
          {a.impacto === 0 ? '—' : moeda(a.impacto)}
        </p>
      </div>

      {/* Falta e sobra lado a lado, nunca somadas: são problemas de causas
          diferentes — falta costuma ser perda, sobra costuma ser remessa não
          baixada — e o gestor age de formas distintas em cada uma. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Falta
          </p>
          <p className="text-sm font-semibold tabular-nums text-warning-strong">
            {a.faltaQtd === 0 ? '—' : `${unid(a.faltaQtd)} un.`}
          </p>
          <p className="truncate text-2xs tabular-nums text-muted-foreground">
            {a.faltaValor === 0 ? `${a.faltaItens} produtos` : moeda(a.faltaValor)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sobra
          </p>
          <p className="text-sm font-semibold tabular-nums text-info-strong">
            {a.sobraQtd === 0 ? '—' : `+${unid(a.sobraQtd)} un.`}
          </p>
          <p className="truncate text-2xs tabular-nums text-muted-foreground">
            {a.sobraValor === 0 ? `${a.sobraItens} produtos` : `+${moeda(a.sobraValor)}`}
          </p>
        </div>
      </div>

      <BarraAcuracidade iguais={a.iguais} produtos={a.produtos} />
    </button>
  );
}

function CardProduto({ l, comEsperado }: { l: LinhaExibida; comEsperado: boolean }) {
  const impacto = l.diferenca * l.valor_unitario;
  const cor =
    l.diferenca > 0 ? 'text-info-strong' : l.diferenca < 0 ? 'text-warning-strong' : '';
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">{l.codigo_auxiliar}</p>
          {l.nome_produto !== l.codigo_auxiliar && (
            <p className="truncate text-xs text-muted-foreground" title={l.nome_produto}>
              {l.nome_produto}
            </p>
          )}
        </div>
        {l.so_movimento && (
          <Badge variant="warning" className="shrink-0 px-2.5 py-0.5 text-2xs">
            Só movimento
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex gap-4 text-xs">
          {/* "Esperado" só aparece quando existe reconciliação: sem ela o esperado é a
              própria Qtd A, e exibir os dois lado a lado sugeriria uma conta que não
              foi feita. */}
          {comEsperado && (
            <div>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                Esperado
              </p>
              <p className="font-medium tabular-nums">{l.esperado}</p>
            </div>
          )}
          <div>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">
              Contado
            </p>
            <p className="font-medium tabular-nums">{l.quantidade_b}</p>
            {/* Quanto vale o que está lá — não o quanto o erro custou, que é o número
                da direita. Produto sem preço cadastrado não ganha a linha: "R$ 0,00"
                se leria como mercadoria sem valor, e não como cadastro incompleto. */}
            {l.valor_unitario > 0 && (
              <p className="text-2xs tabular-nums text-muted-foreground">
                {moeda(l.quantidade_b * l.valor_unitario)}
              </p>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className={`text-lg font-bold tabular-nums ${cor}`}>
            {l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
          </p>
          <p className={`text-2xs tabular-nums ${cor}`}>
            {l.diferenca === 0 || l.valor_unitario === 0
              ? '—'
              : `${impacto > 0 ? '+' : ''}${moeda(impacto)}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Uma linha da árvore. Fora do componente-pai para não remontar a cada expansão. */
function LinhaArvore({
  no,
  aberto,
  onClicar,
  comRemessa,
  comVenda,
  comEsperado,
  temContagemA,
}: {
  no: No;
  aberto: boolean;
  onClicar: () => void;
  comRemessa: boolean;
  comVenda: boolean;
  comEsperado: boolean;
  temContagemA: boolean;
}) {
  const { agregado: a } = no;
  const folha = no.filhos.length === 0;
  const acuracidade = a.produtos > 0 ? a.iguais / a.produtos : 0;

  return (
    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={onClicar}>
      <TableCell className="py-2.5">
        {/* A indentação é o que comunica a hierarquia numa tabela plana; o nível
            entra como padding calculado porque é valor dinâmico. */}
        <div style={{ paddingLeft: `${no.nivel * 1.25}rem` }}>
          <div className="flex items-center gap-1.5">
            {folha ? (
              // Folha não expande: o passo seguinte é o produto, não outra categoria.
              <Package className="size-3.5 shrink-0 text-muted-foreground" />
            ) : aberto ? (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={`truncate ${no.nivel === 0 ? 'text-sm font-semibold' : 'text-sm'}`}
              title={a.categoria}
            >
              {a.categoria}
            </span>
            {a.categoria === SEM_CATEGORIA && (
              <Badge variant="warning" className="shrink-0 px-2 py-0 text-2xs">
                Sem cadastro
              </Badge>
            )}
          </div>
          {/* O número de produtos virou legenda do nome. Era uma coluna inteira para um
              número que só qualifica a categoria — e a coluna custava a largura de que
              Remessa e Venda precisavam. O recuo alinha com o texto, não com o ícone. */}
          <p className="mt-0.5 pl-[1.375rem] text-2xs tabular-nums text-muted-foreground">
            {a.produtos} produto{a.produtos !== 1 ? 's' : ''}
          </p>
        </div>
      </TableCell>

      {/* Movimento antes do Contado, na mesma ordem em que a conta é lida no Modo Tabela
          (A → remessa → venda → esperado → B). Os dois empilhados numa célula só: são o
          mesmo assunto, e o sinal já os distingue sem gastar duas colunas. Em cinza de
          propósito — são contexto, não veredito; o vermelho e o azul ficam para Falta e
          Sobra. */}
      {(comRemessa || comVenda) && (
        <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground sm:table-cell">
          {comRemessa && <div>{a.remessaQtd === 0 ? '—' : `+${unid(a.remessaQtd)}`}</div>}
          {comVenda && <div>{a.vendaQtd === 0 ? '—' : `−${unid(a.vendaQtd)}`}</div>}
        </TableCell>
      )}

      {/* O resultado da equação, por categoria. `A + remessa − venda` na linha de apoio
          porque "esperado" sozinho não diz de onde saiu — e é contra ESTE número, não
          contra a contagem anterior, que Falta e Sobra são medidas quando há
          reconciliação. */}
      {comEsperado && (
        <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
          <div className="font-medium">= {unid(a.esperado)} un.</div>
          {/* De onde a conta partiu. Só quando existe lado A: no modo primeiro
              inventário a Qtd A é zero em tudo, e "de 0" não informa nada — o esperado
              ali é `remessa − venda` e a faixa acima já diz isso. */}
          {temContagemA && (
            <div className="whitespace-nowrap text-2xs text-muted-foreground">
              A: {unid(a.anterior)}
            </div>
          )}
        </TableCell>
      )}

      {/* Unidades e valor na mesma célula: são a MESMA grandeza em duas unidades, e
          separá-los em duas colunas fazia o olho percorrer meia tabela para juntar
          "quanto tem" com "quanto vale". */}
      <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
        <div className="text-muted-foreground">{unid(a.unidades)} un.</div>
        <div className="text-2xs text-muted-foreground/80">{moeda(a.valor)}</div>
      </TableCell>

      <TableCell className="text-right text-sm font-medium tabular-nums text-warning-strong">
        {a.faltaQtd === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${unid(a.faltaQtd)} un.`
        )}
      </TableCell>

      <TableCell className="text-right text-sm font-medium tabular-nums text-info-strong">
        {a.sobraQtd === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `+${unid(a.sobraQtd)} un.`
        )}
      </TableCell>

      {/* A acuracidade desceu para debaixo do impacto: ela QUALIFICA o impacto (R$ 1.240
          com 92% de acerto é outra conversa que os mesmos R$ 1.240 com 40%), e como
          coluna própria vivia escondida abaixo de 1024px — justo onde faz falta. */}
      <TableCell className="text-right tabular-nums">
        <div className="text-sm font-semibold">
          {a.impacto === 0 ? <span className="text-muted-foreground">—</span> : moeda(a.impacto)}
        </div>
        <div className="whitespace-nowrap text-2xs text-muted-foreground">
          {pct(acuracidade)} acur.
        </div>
      </TableCell>
    </TableRow>
  );
}

interface Props {
  /** Linhas já filtradas pelos controles da tela (recorte e busca). */
  linhas: LinhaExibida[];
  submodo: SubmodoGestor;
  onSubmodo: (s: SubmodoGestor) => void;
  /** Valor escolhido em cada nível já percorrido, na ordem de `NIVEIS`. */
  caminho: string[];
  onCaminho: (c: string[]) => void;
  /** Houve reconciliação com o ERP — muda o significado de "esperado". */
  comEsperado: boolean;
  /**
   * Remessas e vendas foram efetivamente consultadas no Ciclone. São independentes: a
   * tela permite reconciliar só um dos dois, e o que não foi consultado não pode
   * aparecer como zero — "0 un. de remessa" afirmaria que nada foi remetido, quando o
   * que houve foi ninguém ter perguntado.
   */
  comRemessa: boolean;
  comVenda: boolean;
  /**
   * Existe um inventário no lado A. Falso no modo **primeiro inventário**, em que a RPC
   * devolve Qtd A zerada em tudo e o esperado vira só `remessa − venda` — ali qualquer
   * menção a "contagem A" mostraria zeros que se leem como estoque vazio.
   */
  temContagemA: boolean;
}

export function PainelGestor({
  linhas,
  submodo,
  onSubmodo,
  caminho,
  onCaminho,
  comEsperado,
  comRemessa,
  comVenda,
  temContagemA,
}: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Só as linhas dentro do caminho percorrido. Cada passo do drill-down é um
  // AND sobre o nível correspondente.
  const doCaminho = useMemo(
    () =>
      linhas.filter((l) =>
        caminho.every((valor, i) => categoriaDa(l, NIVEIS[i].chave) === valor)
      ),
    [linhas, caminho]
  );

  const nivelAtual = caminho.length < NIVEIS.length ? NIVEIS[caminho.length] : null;

  /**
   * O recorte aberto em números: o que foi contado e o que se moveu no período.
   *
   * A trilha já dizia "63 produtos · 264 un. · R$ X" — o CONTADO. Faltava contra o quê:
   * 264 unidades numa marca que recebeu 300 de remessa e vendeu 40 conta uma história
   * completamente diferente das mesmas 264 sem movimento nenhum, e o gestor não tinha
   * como ver isso sem voltar ao Modo Tabela e somar na mão.
   *
   * Produtos e unidades separados em cada movimento porque respondem coisas distintas:
   * quantos SKUs foram tocados, e qual o volume disso.
   */
  const totalDoCaminho = useMemo(
    () =>
      doCaminho.reduce(
        (acc, l) => ({
          unidades: acc.unidades + l.quantidade_b,
          valor: acc.valor + l.quantidade_b * l.valor_unitario,
          remessaQtd: acc.remessaQtd + l.remessa,
          remessaItens: acc.remessaItens + (l.remessa !== 0 ? 1 : 0),
          vendaQtd: acc.vendaQtd + l.venda,
          vendaItens: acc.vendaItens + (l.venda !== 0 ? 1 : 0),
          anterior: acc.anterior + l.quantidade_a,
          esperado: acc.esperado + l.esperado,
        }),
        {
          unidades: 0,
          valor: 0,
          remessaQtd: 0,
          remessaItens: 0,
          vendaQtd: 0,
          vendaItens: 0,
          anterior: 0,
          esperado: 0,
        }
      ),
    [doCaminho]
  );

  /** Sobra da conta: o que foi contado menos o que se esperava encontrar. */
  const desvioDoCaminho = totalDoCaminho.unidades - totalDoCaminho.esperado;

  const agregados = useMemo(
    () => (nivelAtual ? agregar(doCaminho, nivelAtual.chave) : []),
    [doCaminho, nivelAtual]
  );

  // A árvore nasce do caminho atual: entrar no Sintético depois de ter descido no
  // Analítico mostra a subárvore daquele recorte, não a do catálogo inteiro.
  const arvore = useMemo(
    () => construirArvore(doCaminho, caminho),
    [doCaminho, caminho]
  );
  const visiveis = useMemo(() => achatar(arvore, expandidos), [arvore, expandidos]);
  const tudoAberto = useMemo(() => {
    const chaves = todasAsChaves(arvore);
    return chaves.length > 0 && chaves.every((c) => expandidos.has(c));
  }, [arvore, expandidos]);

  const produtosOrdenados = useMemo(
    () =>
      [...doCaminho].sort((a, b) => {
        const va = Math.abs(a.diferenca * a.valor_unitario);
        const vb = Math.abs(b.diferenca * b.valor_unitario);
        if (vb !== va) return vb - va;
        return Math.abs(b.diferenca) - Math.abs(a.diferenca);
      }),
    [doCaminho]
  );

  const alternarNo = (no: No) => {
    // Folha não tem para onde expandir — o passo seguinte é a lista de produtos.
    if (no.filhos.length === 0) {
      onCaminho(no.caminho);
      onSubmodo('detalhado');
      return;
    }
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(no.chave)) proximo.delete(no.chave);
      else proximo.add(no.chave);
      return proximo;
    });
  };

  const alternarTudo = () =>
    setExpandidos(tudoAberto ? new Set() : new Set(todasAsChaves(arvore)));

  /**
   * Abrir uma categoria do ÚLTIMO nível não tem para onde descer: o passo seguinte
   * é o produto. Trocar o submodo aqui deixa o clique com um destino sempre, em vez
   * de virar um card morto na ponta da hierarquia.
   */
  const abrir = (categoria: string) => {
    const novo = [...caminho, categoria];
    onCaminho(novo);
    if (novo.length === NIVEIS.length) onSubmodo('detalhado');
  };

  const voltarPara = (n: number) => {
    onCaminho(caminho.slice(0, n));
    // Subir na hierarquia devolve a visão de categorias: quem clicou numa migalha
    // quer ver o panorama daquele nível, não a lista de produtos de novo.
    if (submodo === 'detalhado') onSubmodo('sintetico');
  };

  const mostrandoProdutos = submodo === 'detalhado' || nivelAtual === null;

  /**
   * Catálogo ainda sem categorias.
   *
   * Acontece na janela entre publicar os campos novos e rodar a primeira
   * sincronização com o Ciclone: tudo cai em "Sem categoria" e a tela parece
   * quebrada quando na verdade está apenas esperando o dado. Sem esta frase, a
   * conclusão razoável de quem abre é que o modo não funciona.
   *
   * O corte é a MAIORIA, não a totalidade: alguns produtos sem cadastro são normais
   * e não devem disparar o aviso.
   */
  const semCategoriaNenhuma =
    linhas.length > 0 && linhas.filter((l) => !l.marca).length > linhas.length / 2;

  return (
    <div className="space-y-4">
      {semCategoriaNenhuma && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            <strong>A maioria dos produtos está sem categoria.</strong> Marca, tipo e grupo
            vêm do Ciclone pela sincronização do catálogo — enquanto ela não roda, tudo cai
            num grupo só. Abra <strong>Produtos</strong> e use{' '}
            <strong>Atualizar do Ciclone</strong>.
          </AlertDescription>
        </Alert>
      )}

      {/*
        ── Trilha ────────────────────────────────────────────────────────────
        O alternador Sintético/Analítico SAIU daqui: ele subiu para junto do
        alternador de modo de leitura, na página. Os dois têm o mesmo desenho e um é
        subordinado ao outro — separados por duzentos pixels de cards, liam-se como
        dois controles sem relação, e não havia nada indicando que o segundo só existe
        dentro do primeiro. A página já era dona do estado `submodo`; só a renderização
        estava no lugar errado.

        O tamanho do recorte também já morou aqui, como cauda de texto da trilha. Saiu
        para a faixa de cartões logo abaixo quando remessa e venda entraram: são seis
        números, e enfileirá-los depois das migalhas transformava a trilha num parágrafo
        que ninguém lê. A trilha voltou a ser só navegação.
      */}
      <nav aria-label="Trilha de categorias" className="flex flex-wrap items-center gap-1">
        <Button
          variant={caminho.length === 0 ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => voltarPara(0)}
        >
          <Home className="size-4" />
          Todas
        </Button>
        {caminho.map((valor, i) => (
          <div key={`${NIVEIS[i].chave}-${valor}`} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <Button
              variant={i === caminho.length - 1 ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => voltarPara(i + 1)}
              title={`${NIVEIS[i].rotulo}: ${valor}`}
            >
              {valor}
            </Button>
          </div>
        ))}
      </nav>

      {/* ── Resumo do recorte ─────────────────────────────────────────────────
          UM lugar só para o total, igual nos três submodos.

          Antes o mesmo total aparecia de duas formas — cauda de texto na trilha, ou
          faixa de cartões quando havia reconciliação — e trocar de forma conforme o
          contexto obrigava a reencontrar o número a cada vez. Aqui ele tem sempre a
          mesma posição e o mesmo desenho; o que muda é só quantos cartões existem.

          Sobre a tabela, e não dentro dela, porque o Analítico e o Detalhado não têm
          tabela onde ancorar um rodapé de totais. */}
      {doCaminho.length > 0 && (
        /* Com reconciliação, os cartões são a EQUAÇÃO lida da esquerda para a direita:
           anterior + remessa − venda = esperado, e o contado ao lado para comparar. Era
           o elo que faltava — a tela mostrava o movimento e a consequência (Falta e
           Sobra) sem nunca dizer contra que número as unidades contadas foram medidas.
           Sem reconciliação, esperado é a própria Qtd A e a cadeia inteira seria o mesmo
           número repetido três vezes; sobra só o Contado. */
        <div className="flex flex-wrap gap-2">
          {/* "Contagem A", e não "Anterior": `quantidade_anterior` já significa outra
              coisa neste app (a referência da recontagem, na tela de contagem), e a tela
              inteira do comparativo chama os dois lados de A e B. No modo primeiro
              inventário não há lado A — a Qtd A é zero em tudo, e um cartão com "0 un."
              afirmaria que o estoque anterior estava vazio. */}
          {comEsperado && temContagemA && (
            <CartaoResumo
              rotulo="Contagem A"
              valor={`${unid(totalDoCaminho.anterior)} un.`}
              apoio="ponto de partida"
            />
          )}
          {comRemessa && (
            <CartaoResumo
              rotulo="Remessa"
              valor={
                totalDoCaminho.remessaQtd === 0
                  ? '—'
                  : `+${unid(totalDoCaminho.remessaQtd)} un.`
              }
              apoio={`${totalDoCaminho.remessaItens} produto${
                totalDoCaminho.remessaItens !== 1 ? 's' : ''
              } com remessa`}
            />
          )}
          {comVenda && (
            <CartaoResumo
              rotulo="Venda"
              valor={
                totalDoCaminho.vendaQtd === 0 ? '—' : `−${unid(totalDoCaminho.vendaQtd)} un.`
              }
              apoio={`${totalDoCaminho.vendaItens} produto${
                totalDoCaminho.vendaItens !== 1 ? 's' : ''
              } vendido${totalDoCaminho.vendaItens !== 1 ? 's' : ''}`}
            />
          )}
          {comEsperado && (
            <CartaoResumo
              rotulo="Esperado"
              valor={`= ${unid(totalDoCaminho.esperado)} un.`}
              apoio={temContagemA ? 'A + remessa − venda' : 'remessa − venda'}
              destaque
            />
          )}
          <CartaoResumo
            rotulo="Contado"
            valor={`${unid(totalDoCaminho.unidades)} un.`}
            apoio={`${doCaminho.length} produto${doCaminho.length !== 1 ? 's' : ''} · ${moeda(
              totalDoCaminho.valor
            )}`}
            /* O desvio fecha a leitura: sem ele o gestor compara 302 com 264 de cabeça.
               Cor pela mesma convenção de Falta e Sobra, para não inventar um terceiro
               vocabulário de cor na mesma tela. */
            nota={
              comEsperado ? (
                <p
                  className={`truncate text-2xs font-medium tabular-nums ${
                    desvioDoCaminho < 0
                      ? 'text-warning-strong'
                      : desvioDoCaminho > 0
                        ? 'text-info-strong'
                        : 'text-muted-foreground'
                  }`}
                >
                  {desvioDoCaminho === 0
                    ? 'bate com o esperado'
                    : `${desvioDoCaminho > 0 ? '+' : ''}${desvioDoCaminho} contra o esperado`}
                </p>
              ) : undefined
            }
          />
        </div>
      )}

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      {doCaminho.length === 0 ? (
        <div className="rounded-2xl border border-border/80 py-12 text-center">
          <Minus className="mx-auto mb-2 size-11 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhum produto neste recorte com os filtros aplicados
          </p>
        </div>
      ) : mostrandoProdutos ? (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="size-4" />
            Produtos {caminho.length > 0 ? `de ${caminho.join(' · ')}` : 'de todas as categorias'},
            do maior impacto para o menor
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {produtosOrdenados.map((l) => (
              <CardProduto key={l.codigo_auxiliar} l={l} comEsperado={comEsperado} />
            ))}
          </div>
        </>
      ) : submodo === 'sintetico' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListTree className="size-4" />
              Árvore completa da divergência — clique para abrir; no{' '}
              <span className="font-semibold text-foreground">grupo</span> abre os produtos
            </p>
            <Button variant="ghost" size="sm" onClick={alternarTudo}>
              {tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/80">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted/40">
                    <TableHead className="font-semibold">Categoria</TableHead>
                    {/* O contexto (movimento e base) some só abaixo de 640px, e não
                        abaixo de 1024 como antes: qualquer tablet ou notebook mostra a
                        tabela inteira. No celular a pergunta é onde está o problema, e
                        sobram Categoria, Falta, Sobra e Impacto. */}
                    {(comRemessa || comVenda) && (
                      <TableHead className="hidden text-right font-semibold sm:table-cell">
                        {comRemessa && comVenda ? (
                          <>
                            Movimento
                            <span className="block text-2xs font-normal normal-case tracking-normal">
                              remessa / venda
                            </span>
                          </>
                        ) : comRemessa ? (
                          'Remessa'
                        ) : (
                          'Venda'
                        )}
                      </TableHead>
                    )}
                    {comEsperado && (
                      <TableHead className="hidden text-right font-semibold sm:table-cell">
                        Esperado
                      </TableHead>
                    )}
                    <TableHead className="hidden text-right font-semibold sm:table-cell">
                      Contado
                    </TableHead>
                    <TableHead className="text-right font-semibold">Falta</TableHead>
                    <TableHead className="text-right font-semibold">Sobra</TableHead>
                    <TableHead className="text-right font-semibold">Impacto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((no) => (
                    <LinhaArvore
                      key={no.chave}
                      no={no}
                      aberto={expandidos.has(no.chave)}
                      onClicar={() => alternarNo(no)}
                      comRemessa={comRemessa}
                      comVenda={comVenda}
                      comEsperado={comEsperado}
                      temContagemA={temContagemA}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="size-4" />
            Divergência por{' '}
            <span className="font-semibold text-foreground">
              {nivelAtual!.rotulo.toLowerCase()}
            </span>{' '}
            — clique num cartão para abrir
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {agregados.map((a) => (
              <CardCategoria
                key={a.categoria}
                a={a}
                onAbrir={() => abrir(a.categoria)}
                comRemessa={comRemessa}
                comVenda={comVenda}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
