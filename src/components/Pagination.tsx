import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (value: string) => void;
  /**
   * Como se chama o que está sendo paginado. Padrão "itens".
   *
   * Existe porque a Consulta ao ERP pagina LINHAS num modo e PEDIDOS no outro — dizer
   * "20 de 340 itens" quando são pedidos faz o número parecer o outro. Mora no
   * componente por ser a paginação de todas as telas: escrever a palavra à mão numa
   * delas criaria duas barras diferentes.
   */
  unidade?: string;
}

/** Opções oferecidas por padrão. O valor em uso entra na lista mesmo fora daqui. */
const OPCOES_PADRAO = [10, 20, 50, 100];

export function Pagination({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  onItemsPerPageChange,
  unidade = 'itens',
}: PaginationProps) {
  const displayedEnd = Math.min(endIndex, totalItems);

  /**
   * As opções incluem o `itemsPerPage` em vigor, ainda que ele não seja um dos padrões.
   *
   * Sem isso o campo aparecia **vazio** — não transparente — nas telas que pedem 12 por
   * página (Conferência e Exportar XML): o Radix Select cai no placeholder quando o `value`
   * não casa com nenhum `SelectItem`, e aqui não há placeholder. O conserto fica no
   * componente porque a paginação é compartilhada; limitar as telas aos quatro valores
   * padrão só esconderia o problema até a próxima tela precisar de outro número.
   */
  const opcoes = Array.from(new Set([...OPCOES_PADRAO, itemsPerPage])).sort((a, b) => a - b);

  // Gerar números de páginas visíveis
  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  const visiblePages = getVisiblePages();

  return (
    // `Card` já entrega borda, raio, fundo e a elevação de repouso — era exatamente o que
    // estava escrito à mão aqui. O `antialiased` também saiu: já está no `body`.
    <Card className="flex flex-wrap items-center justify-center gap-4 p-4 sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Itens por página:</span>
        <Select value={String(itemsPerPage)} onValueChange={onItemsPerPageChange}>
          {/* `h-9` é override intencional: esta é uma barra densa, e o campo acompanha a
              altura dos botões de página, não os 44px do controle padrão. */}
          <SelectTrigger className="h-9 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs font-medium tabular-nums text-muted-foreground">
        Mostrando {startIndex + 1} até {displayedEnd} de {totalItems} {unidade}
      </div>

      {/* Desktop: Botões de página */}
      <div className="hidden items-center gap-2 sm:flex">
        <Button
          variant="outline"
          size="iconSm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span
                  key={`dots-${index}`}
                  className="px-2 py-1 text-xs font-medium text-muted-foreground"
                >
                  ...
                </span>
              );
            }

            return (
              <Button
                key={page}
                variant={currentPage === page ? 'default' : 'outline'}
                size="iconSm"
                onClick={() => onPageChange(page as number)}
                aria-label={`Página ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
                className="text-xs"
              >
                {page}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="iconSm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Mobile: Navegação simplificada */}
      <div className="flex items-center gap-3 sm:hidden">
        <Button
          variant="outline"
          size="iconSm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </Button>

        <span className="min-w-[80px] text-center text-xs font-bold tabular-nums">
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="iconSm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </Card>
  );
}
