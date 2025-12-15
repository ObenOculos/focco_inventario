import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchFilter({ value, onChange, placeholder = 'Buscar...' }: SearchFilterProps) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
      <Input
        id="search-filter"
        name="search"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-10 border-2"
      />
    </div>
  );
}
