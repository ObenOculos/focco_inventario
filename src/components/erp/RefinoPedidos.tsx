import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchFilter } from '@/components/SearchFilter';
import { ChevronDown, X } from 'lucide-react';
import {
  ESCOPOS_BUSCA,
  FILTROS_PEDIDOS_INICIAIS,
  SITUACOES_PRODUTO,
  TODOS,
  opcoesDosFiltros,
  temRefino,
  type EscopoBusca,
  type FiltrosPedidos,
  type OpcaoFiltro,
  type PedidoIndexado,
} from '@/lib/filtrosPedidosErp';
import { VISOES, type Visao } from '@/lib/colunasPedidosErp';

/**
 * Refino do resultado da Consulta ao ERP — todos os filtros locais em um cartão.
 *
 * Fica separado do cartão "Parâmetros" porque as duas coisas custam diferente: lá cada
 * mudança só vale depois de um clique que atravessa a VPN; aqui tudo é instantâneo sobre
 * o que já está na tela. Misturar os dois fazia o usuário achar que trocar de marca ia
 * consultar o ERP de novo.
 *
 * As opções das dimensões vêm em CASCATA (`opcoesDosFiltros`): cada lista mostra só o
 * que existe no recorte feito pelos OUTROS filtros, com a contagem de linhas ao lado.
 * O próprio filtro não se restringe — senão escolher uma operação apagaria as demais da
 * lista e não haveria como trocar.
 */

interface Props {
  /** Resultado inteiro da consulta, indexado. É dele que saem as opções. */
  linhas: PedidoIndexado[];
  filtros: FiltrosPedidos;
  onFiltros: (f: FiltrosPedidos) => void;
  /**
   * Agrupar por pedido. Mora aqui por estar junto dos outros toggles, como na
   * ferramenta local, mas NÃO é filtro: não entra em `FiltrosPedidos`, não esconde
   * linha nenhuma e o "Limpar refino" não o desliga — trocar de modo de leitura no meio
   * de uma conferência não deveria apagar o recorte, nem o contrário.
   */
  agrupar: boolean;
  onAgrupar: (v: boolean) => void;
  /**
   * Visão da tabela — Sintética (14 colunas, cabe na tela) ou Analítica (as 32, com
   * rolagem). Também é apresentação, não recorte: não muda quais linhas existem nem o que
   * o Excel leva. Ver `colunasPedidosErp.ts` para o motivo de cada coluna fora da enxuta.
   */
  visao: Visao;
  onVisao: (v: Visao) => void;
  /** Só no desktop: 14 ou 32 colunas não existem em tela de celular, que usa cartões. */
  mostrarVisao: boolean;
}

/**
 * Seletor de uma dimensão. O rótulo viaja DENTRO do gatilho, junto do valor: fora de
 * contexto, "5403 - VENDA…" sozinho não diz se é operação, tipo ou CFOP. Mesmo padrão do
 * `FiltroCategorias`, e é o que faz sete filtros caberem em duas linhas.
 */
function SeletorDimensao({
  rotulo,
  valor,
  opcoes,
  onValor,
  largura = 'sm:w-56',
}: {
  rotulo: string;
  valor: string;
  /** `total` ausente = lista fixa, sem contagem em cascata para mostrar. */
  opcoes: { valor: string; rotulo: string; total?: number }[];
  onValor: (v: string) => void;
  largura?: string;
}) {
  // Um seletor com uma opção só não recorta nada; ocuparia a linha para oferecer um
  // clique sem efeito. O que está escolhido continua visível mesmo sozinho — é preciso
  // poder desfazer.
  if (opcoes.length === 0 || (opcoes.length === 1 && valor === TODOS)) return null;

  const ativo = valor !== TODOS;

  return (
    <Select value={valor} onValueChange={onValor}>
      <SelectTrigger
        aria-label={rotulo}
        className={`w-full font-normal ${largura} ${ativo ? 'border-primary/60' : ''}`}
      >
        <span className="truncate">
          <span className="text-muted-foreground">{rotulo}: </span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>Todos</SelectItem>
        <SelectSeparator />
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            <span className="tabular-nums">
              {o.rotulo}
              {o.total === undefined ? '' : ` (${o.total})`}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Marca é multi-seleção: conferir OBEN e POWER juntas é pergunta corriqueira, e um `Select`
 * de valor único não responde.
 *
 * Aparece sempre que o resultado tem alguma marca — inclusive com uma só. Havia aqui uma
 * guarda que o escondia nesse caso (a mesma ideia dos seletores de dimensão, que somem
 * quando não há escolha a fazer), e ela estava errada para marca: no Ciclone marca é
 * coleção, é o eixo pelo qual o negócio pensa, e um filtro que às vezes não está na tela é
 * um filtro que o usuário conclui que não existe.
 */
function SeletorMarcas({
  opcoes,
  marcas,
  onMarcas,
}: {
  opcoes: OpcaoFiltro[];
  marcas: string[];
  onMarcas: (m: string[]) => void;
}) {
  if (opcoes.length === 0 && marcas.length === 0) return null;

  const rotulo =
    marcas.length === 0
      ? 'todas'
      : marcas.length <= 2
        ? marcas.join(', ')
        : `${marcas.length} marcas`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal sm:w-52 ${
            marcas.length > 0 ? 'border-primary/60' : ''
          }`}
        >
          <span className="truncate">
            <span className="text-muted-foreground">Marca: </span>
            {rotulo}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onMarcas([])}>Todas as marcas</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMarcas(opcoes.map((o) => o.valor))}>
          Marcar todas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {opcoes.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.valor}
            checked={marcas.includes(o.valor)}
            // Sem isto o menu fecha a cada marca marcada, e escolher três exige
            // reabri-lo três vezes.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(ligado) =>
              onMarcas(ligado ? [...marcas, o.valor] : marcas.filter((m) => m !== o.valor))
            }
          >
            <span className="min-w-0 truncate">{o.valor}</span>
            <span className="ml-auto pl-3 tabular-nums text-muted-foreground">{o.total}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RefinoPedidos({
  linhas,
  filtros,
  onFiltros,
  agrupar,
  onAgrupar,
  visao,
  onVisao,
  mostrarVisao,
}: Props) {
  const opcoes = useMemo(() => opcoesDosFiltros(linhas, filtros), [linhas, filtros]);

  const alterar = (mudanca: Partial<FiltrosPedidos>) => onFiltros({ ...filtros, ...mudanca });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Refino do resultado</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Filtra o que já está carregado — não volta ao ERP.
            </p>
          </div>
          {temRefino(filtros) && (
            <Button variant="ghost" onClick={() => onFiltros(FILTROS_PEDIDOS_INICIAIS)}>
              <X className="mr-2 h-4 w-4" />
              Limpar refino
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="search-filter">Busca textual</Label>
            <div className="flex gap-2">
              <SearchFilter
                value={filtros.busca}
                onChange={(v) => alterar({ busca: v })}
                placeholder="Produto, cliente, marca…"
                className="max-w-none"
              />
              <Select
                value={filtros.escopo}
                onValueChange={(v) => alterar({ escopo: v as EscopoBusca })}
              >
                <SelectTrigger aria-label="Onde buscar" className="w-40 shrink-0 font-normal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESCOPOS_BUSCA.map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {e.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              A observação do pedido é texto livre e cita outros códigos — por isso ela tem
              escopo próprio.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filtro-pedido">Pedido</Label>
            <Input
              id="filtro-pedido"
              value={filtros.pedido}
              onChange={(e) => alterar({ pedido: e.target.value })}
              placeholder="123 ou 123,456"
              inputMode="numeric"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="filtro-nf">Nota fiscal</Label>
            <Input
              id="filtro-nf"
              value={filtros.nf}
              onChange={(e) => alterar({ nf: e.target.value })}
              placeholder="123 ou 123,456"
              inputMode="numeric"
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SeletorDimensao
            rotulo="Classificação"
            valor={filtros.classificacao}
            opcoes={opcoes.classificacao}
            onValor={(v) => alterar({ classificacao: v })}
            largura="sm:w-52"
          />
          <SeletorDimensao
            rotulo="Operação"
            valor={filtros.operacao}
            opcoes={opcoes.operacao}
            onValor={(v) => alterar({ operacao: v })}
          />
          <SeletorDimensao
            rotulo="Tipo"
            valor={filtros.tipo}
            opcoes={opcoes.tipo}
            onValor={(v) => alterar({ tipo: v })}
          />
          <SeletorDimensao
            rotulo="CFOP"
            valor={filtros.cfop}
            opcoes={opcoes.cfop}
            onValor={(v) => alterar({ cfop: v })}
          />
          <SeletorDimensao
            rotulo="Criou"
            valor={filtros.criou}
            opcoes={opcoes.criou}
            onValor={(v) => alterar({ criou: v })}
            largura="sm:w-48"
          />
          <SeletorDimensao
            rotulo="Sit. produto"
            valor={filtros.situacaoProduto}
            // Lista fixa: são os dois códigos de `regras.py`, não valores do resultado.
            opcoes={SITUACOES_PRODUTO}
            onValor={(v) => alterar({ situacaoProduto: v })}
            largura="sm:w-44"
          />
          <SeletorMarcas
            opcoes={opcoes.marcas}
            marcas={filtros.marcas}
            onMarcas={(m) => alterar({ marcas: m })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/60 pt-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={filtros.soDivergencias}
              onCheckedChange={(v) => alterar({ soDivergencias: v === true })}
            />
            Somente a conferir
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={filtros.ocultarCanceladas}
              onCheckedChange={(v) => alterar({ ocultarCanceladas: v === true })}
            />
            Ocultar canceladas
          </label>
          {/* Separado por um traço: os dois de cima mudam QUAIS linhas aparecem, este
              muda COMO elas são lidas. Sem a divisória o terceiro parecia mais um
              filtro, e o usuário procurava as linhas que ele teria escondido. */}
          <div className="hidden h-5 w-px bg-border sm:block" />
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={agrupar} onCheckedChange={(v) => onAgrupar(v === true)} />
            Agrupar por pedido
          </label>
          {mostrarVisao && (
            <Select value={visao} onValueChange={(v) => onVisao(v as Visao)}>
              <SelectTrigger
                aria-label="Visão da tabela"
                className="w-full font-normal sm:ml-auto sm:w-48"
              >
                <span className="truncate">
                  <span className="text-muted-foreground">Visão: </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {VISOES.map((v) => (
                  <SelectItem key={v.valor} value={v.valor}>
                    {v.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
