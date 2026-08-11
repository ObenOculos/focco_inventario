import { useMemo, useState } from 'react';
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
 * evitar, e que os modos Resumido e Detalhado da tela já fazem melhor.
 */

/** Categoria ausente. Produto contado sem cadastro em `produtos`, ou anterior à sincronização. */
const SEM_CATEGORIA = 'Sem categoria';

export const NIVEIS = [
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'tipo', rotulo: 'Tipo' },
  { chave: 'subtipo', rotulo: 'Subtipo' },
  { chave: 'grupo', rotulo: 'Grupo' },
] as const;

export type NivelGestor = (typeof NIVEIS)[number]['chave'];
export type SubmodoGestor = 'sintetico' | 'analitico' | 'detalhado';

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const unid = (v: number) => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const pct = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1 });

const categoriaDa = (l: LinhaExibida, nivel: NivelGestor) => l[nivel] || SEM_CATEGORIA;

interface Agregado {
  categoria: string;
  produtos: number;
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

function agregar(linhas: LinhaExibida[], nivel: NivelGestor): Agregado[] {
  const mapa = new Map<string, Agregado>();

  for (const l of linhas) {
    const categoria = categoriaDa(l, nivel);
    let a = mapa.get(categoria);
    if (!a) {
      a = {
        categoria,
        produtos: 0,
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

function CardCategoria({ a, onAbrir }: { a: Agregado; onAbrir: () => void }) {
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
          <p className="text-2xs text-muted-foreground">
            {a.produtos} produto{a.produtos !== 1 ? 's' : ''}
          </p>
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
}: {
  no: No;
  aberto: boolean;
  onClicar: () => void;
}) {
  const { agregado: a } = no;
  const folha = no.filhos.length === 0;
  const acuracidade = a.produtos > 0 ? a.iguais / a.produtos : 0;

  return (
    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={onClicar}>
      <TableCell className="py-2.5">
        {/* A indentação é o que comunica a hierarquia numa tabela plana; o nível
            entra como padding calculado porque é valor dinâmico. */}
        <div
          className="flex items-center gap-1.5"
          style={{ paddingLeft: `${no.nivel * 1.25}rem` }}
        >
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
      </TableCell>

      <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground sm:table-cell">
        {a.produtos}
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

      <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell">
        {pct(acuracidade)}
      </TableCell>

      <TableCell className="text-right text-sm font-semibold tabular-nums">
        {a.impacto === 0 ? <span className="text-muted-foreground">—</span> : moeda(a.impacto)}
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
}

export function PainelGestor({
  linhas,
  submodo,
  onSubmodo,
  caminho,
  onCaminho,
  comEsperado,
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

      {/* ── Trilha e alternância de nível ─────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-2.5 py-0.5 text-2xs font-normal">
            {doCaminho.length} produto{doCaminho.length !== 1 ? 's' : ''}
          </Badge>

          {/* No último nível não há mais categorias para agregar: os dois modos
              agregados mostrariam uma tela vazia. */}
          {nivelAtual && (
            <div className="flex rounded-xl bg-muted/60 p-1">
              {(
                [
                  ['sintetico', 'Sintético'],
                  ['analitico', 'Analítico'],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={submodo === valor}
                  onClick={() => onSubmodo(valor)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    submodo === valor
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
              {/* Aparece só quando se desceu até os produtos. Não é uma terceira
                  opção do seletor — é onde você está, e some quando você sai. */}
              {submodo === 'detalhado' && (
                <span className="rounded-lg bg-card px-3 py-1.5 text-xs font-semibold shadow-2xs">
                  Produtos
                </span>
              )}
            </div>
          )}
        </div>
      </div>

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
                    <TableHead className="hidden text-right font-semibold sm:table-cell">
                      Produtos
                    </TableHead>
                    <TableHead className="text-right font-semibold">Falta</TableHead>
                    <TableHead className="text-right font-semibold">Sobra</TableHead>
                    <TableHead className="hidden text-right font-semibold lg:table-cell">
                      Acuracidade
                    </TableHead>
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
              <CardCategoria key={a.categoria} a={a} onAbrir={() => abrir(a.categoria)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
