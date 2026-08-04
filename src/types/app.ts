// Tipos específicos da aplicação (não do banco)
import { Database } from '@/integrations/supabase/types';

export interface MetricConfig {
  id: string;
  label: string;
  source: string;
  dimensions: string[];
  subscribed: boolean;
  hasData: boolean;
  resolution?: string;
  windowMinutes?: number;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  dimensions?: Record<string, string>;
}

// Type helpers para facilitar uso dos tipos do Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Produto = Database['public']['Tables']['produtos']['Row'];
export type Inventario = Database['public']['Tables']['inventarios']['Row'];
export type ItemInventario = Database['public']['Tables']['itens_inventario']['Row'];

export type UserRole = Database['public']['Enums']['user_role'];
export type InventoryStatus = Database['public']['Enums']['inventory_status'];
