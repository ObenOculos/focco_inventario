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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-2 p-4 bg-card">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Itens por página:</span>
        <Select value={String(itemsPerPage)} onValueChange={onItemsPerPageChange}>
          <SelectTrigger className="w-20 border-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background border-2 z-50">
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">
        Mostrando {startIndex + 1} até {displayedEnd} de {totalItems} itens
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="border-2"
        >
          <ChevronLeft size={16} />
        </Button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => {
            if (page === '...') {
              return (
                <span key={`dots-${index}`} className="px-2 py-1 text-muted-foreground">
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
                className={`border-2 ${currentPage === page ? '' : ''}`}
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
          className="border-2"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
