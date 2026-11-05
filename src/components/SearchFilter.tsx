import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchFilter({
  value,
  onChange,
  placeholder = 'Buscar...',
  className = '',
}: SearchFilterProps) {
  return (
    // `cn`, e não concatenação: todo chamador passa `max-w-none` para desfazer o
    // `max-w-sm` padrão, e com as duas classes na string quem vence é a ordem do CSS
    // gerado, não a intenção de quem chamou.
    <div className={cn('relative flex-1 max-w-sm', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        size={18}
      />
      {/* Altura, raio e foco vêm do `Input` — ver DESIGN_SYSTEM.md, seção 7. */}
      <Input
        id="search-filter"
        name="search"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10 shadow-2xs"
      />
    </div>
  );
}
