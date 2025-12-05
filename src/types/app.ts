// Tipos específicos da aplicação (não do banco)
import { Database } from '@/integrations/supabase/types';

export interface DivergenciaItem {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  diferenca: number;
  percentual: number;
  tipo: 'ok' | 'sobra' | 'falta';
}

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
export type Pedido = Database['public']['Tables']['pedidos']['Row'];
export type ItemPedido = Database['public']['Tables']['itens_pedido']['Row'];
export type Inventario = Database['public']['Tables']['inventarios']['Row'];
export type ItemInventario = Database['public']['Tables']['itens_inventario']['Row'];
export type MovimentacaoEstoque = Database['public']['Tables']['movimentacoes_estoque']['Row'];

export type UserRole = Database['public']['Enums']['user_role'];
export type InventoryStatus = Database['public']['Enums']['inventory_status'];
export type MovimentacaoTipo = Database['public']['Enums']['movimentacao_tipo'];

// Tipos para funções do banco
export type EstoqueItem = {
  codigo_auxiliar: string;
  nome_produto: string;
  modelo: string;
  cor: string;
  quantidade_remessa: number;
  quantidade_venda: number;
  estoque_teorico: number;
};

export type EstoqueAteDataItem = {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
};

export type ComparacaoInventarioItem = {
  codigo_auxiliar: string;
  nome_produto: string;
  estoque_teorico: number;
  quantidade_fisica: number;
  divergencia: number;
};

// Tipo para importação Excel
export interface ExcelRow {
  pedido: string | number;
  data_emissao: string;
  codigo_cliente: string | number;
  codigo_vendedor: string | number;
  nome_vendedor: string;
  valor_total: string | number;
  codigo_tipo: number;
  situacao: string;
  numero_nota_fiscal: string | number;
  serie_nota_fiscal: string | number;
  nome_produto: string;
  codigo_auxiliar: string;
  codigo_produto: string;
  quantidade: string | number;
  valor_produto: string | number;
  codigo_empresa?: number;
  empresa?: string;
}