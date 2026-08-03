import { Button } from '@/components/ui/button';
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
}

export function Pagination({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  const displayedEnd = Math.min(endIndex, totalItems);

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
    <div className="flex flex-wrap items-center justify-center gap-4 border border-border/80 rounded-2xl p-4 bg-card shadow-xs sm:justify-between antialiased">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Itens por página:</span>
        <Select value={String(itemsPerPage)} onValueChange={onItemsPerPageChange}>
          <SelectTrigger className="w-20 h-9 rounded-xl border-input shadow-2xs text-xs font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border/80 rounded-xl z-50">
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs font-medium text-muted-foreground">
        Mostrando {startIndex + 1} até {displayedEnd} de {totalItems} itens
      </div>

      {/* Desktop: Botões de página */}
      <div className="hidden sm:flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-xl h-9 w-9 border-input shadow-2xs"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span key={`dots-${index}`} className="px-2 py-1 text-xs text-muted-foreground font-medium">
                  ...
                </span>
              );
            }

            return (
              <Button
                key={page}
                variant={currentPage === page ? 'default' : 'outline'}
                size="icon"
                onClick={() => onPageChange(page as number)}
                className="rounded-xl h-9 w-9 text-xs font-semibold shadow-2xs"
              >
                {page}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="rounded-xl h-9 w-9 border-input shadow-2xs"
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Mobile: Navegação simplificada */}
      <div className="flex sm:hidden items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="rounded-xl h-9 border-input shadow-2xs"
        >
          <ChevronLeft size={16} />
        </Button>

        <span className="text-xs font-bold min-w-[80px] text-center text-foreground">
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="rounded-xl h-9 border-input shadow-2xs"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
