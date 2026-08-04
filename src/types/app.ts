// Tipos específicos da aplicação (não do banco)
import { Database } from '@/integrations/supabase/types';

// Type helpers para facilitar uso dos tipos do Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Produto = Database['public']['Tables']['produtos']['Row'];
export type Inventario = Database['public']['Tables']['inventarios']['Row'];

export type InventoryStatus = Database['public']['Enums']['inventory_status'];
