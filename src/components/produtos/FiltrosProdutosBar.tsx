import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterX, Tags } from 'lucide-react';
import {
  DIMENSOES,
  SEM_CATEGORIA,
  TODAS_CATEGORIAS,
  type CombinacaoCategorias,
  type Dimensao,
  type FiltrosProdutos,
} from '@/hooks/useProdutosQuery';

/**
 * Barra de filtros do catálogo.
 *
 * Saiu da tela por duas razões, e a segunda é a que importa: `Produtos.tsx` já
 * carrega a dívida de tamanho registrada no DESIGN_SYSTEM, e os filtros deixaram de
 * ser dois seletores — com as categorias do Ciclone são sete controles, que
 * disputavam a mesma linha dos botões de ação.
 *
 * Os seletores de categoria são ENCADEADOS: cada um só oferece o que existe dentro
 * do que os outros já recortaram. Um seletor que oferece "OCULOS SOLAR" dentro de
 * CORE EYES — combinação que não existe no catálogo — só entrega lista vazia, e o
 * usuário descobre depois de aplicar.
 */

const ROTULO: Record<Dimensao, { campo: string; todas: string }> = {
  marca: { campo: 'Marca', todas: 'Todas as marcas' },
  tipo: { campo: 'Tipo', todas: 'Todos os tipos' },
  subtipo: { campo: 'Subtipo', todas: 'Todos os subtipos' },
  grupo: { campo: 'Grupo', todas: 'Todos os grupos' },
};

/**
 * Opções de uma dimensão, dado o que as OUTRAS já filtram.
 *
 * A própria dimensão fica de fora do cruzamento de propósito: incluí-la faria cada
 * seletor oferecer só o valor já escolhido, e trocar de marca exigiria limpar o
 * filtro antes.
 */
function opcoesDe(
  dimensao: Dimensao,
  combinacoes: CombinacaoCategorias[],
  filtros: FiltrosProdutos
): { valor: string; rotulo: string }[] {
  const compativeis = combinacoes.filter((c) =>
    DIMENSOES.every((d) => {
      if (d === dimensao) return true;
      const escolhido = filtros[d];
      if (escolhido === TODAS_CATEGORIAS) return true;
      if (escolhido === SEM_CATEGORIA) return c[d] === null;
      return c[d] === escolhido;
    })
  );

  const valores = new Set<string>();
  let temSemCategoria = false;
  for (const c of compativeis) {
    if (c[dimensao] === null) temSemCategoria = true;
    else valores.add(c[dimensao] as string);
  }

  const opcoes = [...valores]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ valor: v, rotulo: v }));
  // "Sem categoria" por último: é o caso excepcional, não uma categoria entre pares.
  if (temSemCategoria) opcoes.push({ valor: SEM_CATEGORIA, rotulo: 'Sem categoria' });
  return opcoes;
}

interface Props {
  filtros: FiltrosProdutos;
  onFiltros: (parcial: Partial<FiltrosProdutos>) => void;
  combinacoes: CombinacaoCategorias[];
  ativos: boolean;
  onLimpar: () => void;
}

export function FiltrosProdutosBar({
  filtros,
  onFiltros,
  combinacoes,
  ativos,
  onLimpar,
}: Props) {
  const opcoesPorDimensao = useMemo(
    () =>
      Object.fromEntries(
        DIMENSOES.map((d) => [d, opcoesDe(d, combinacoes, filtros)])
      ) as Record<Dimensao, { valor: string; rotulo: string }[]>,
    [combinacoes, filtros]
  );

  /**
   * Trocar uma categoria pode invalidar as outras já escolhidas — escolher CORE EYES
   * com "OCULOS SOLAR" selecionado deixaria um recorte que não existe. Em vez de
   * devolver zero produtos sem explicação, as dimensões que perderam sentido voltam
   * para "todas" junto com a troca.
   */
  const trocarCategoria = (dimensao: Dimensao, valor: string) => {
    const proximo: FiltrosProdutos = { ...filtros, [dimensao]: valor };
    const parcial: Partial<FiltrosProdutos> = { [dimensao]: valor };

    for (const outra of DIMENSOES) {
      if (outra === dimensao) continue;
      const escolhido = proximo[outra];
      if (escolhido === TODAS_CATEGORIAS) continue;
      const aindaExiste = opcoesDe(outra, combinacoes, proximo).some(
        (o) => o.valor === escolhido
      );
      if (!aindaExiste) parcial[outra] = TODAS_CATEGORIAS;
    }

    onFiltros(parcial);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Filtros
      </span>

      {/* Categorias do Ciclone. Um seletor sem opção nenhuma é escondido: acontece
          antes da primeira sincronização, e um seletor vazio parece defeito. */}
      {DIMENSOES.map((dimensao) => {
        const opcoes = opcoesPorDimensao[dimensao];
        if (opcoes.length === 0) return null;
        return (
          <Select
            key={dimensao}
            value={filtros[dimensao]}
            onValueChange={(v) => trocarCategoria(dimensao, v)}
          >
            <SelectTrigger
              className="w-full font-normal sm:w-auto sm:min-w-36"
              aria-label={ROTULO[dimensao].campo}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS_CATEGORIAS}>{ROTULO[dimensao].todas}</SelectItem>
              {opcoes.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      <Select
        value={filtros.situacao}
        onValueChange={(v) => onFiltros({ situacao: v as FiltrosProdutos['situacao'] })}
      >
        <SelectTrigger className="w-full font-normal sm:w-40" aria-label="Situação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ativos">Ativos</SelectItem>
          <SelectItem value="inativos">Inativos</SelectItem>
          <SelectItem value="todos">Todas as situações</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filtros.origem}
        onValueChange={(v) => onFiltros({ origem: v as FiltrosProdutos['origem'] })}
      >
        <SelectTrigger className="w-full font-normal sm:w-44" aria-label="Origem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Toda origem</SelectItem>
          <SelectItem value="ciclone">Veio do Ciclone</SelectItem>
          <SelectItem value="manual">Cadastro manual</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={filtros.somenteSemValor ? 'default' : 'outline'}
        onClick={() => onFiltros({ somenteSemValor: !filtros.somenteSemValor })}
        title="Produtos sem preço entram nas quantidades, mas contam zero nos totais em reais"
      >
        <Tags className="mr-2" size={16} />
        Sem valor
      </Button>

      {ativos && (
        <Button variant="ghost" onClick={onLimpar} className="sm:ml-auto">
          <FilterX className="mr-2" size={16} />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
