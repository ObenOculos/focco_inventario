import { Tables, Enums } from '@/integrations/supabase/types';

export type UserRole = Enums<'user_role'>;
export type InventoryStatus = Enums<'inventory_status'>;
export type MovimentacaoTipo = Enums<'movimentacao_tipo'>;

export type Profile = Tables<'profiles'>;
export type Produto = Tables<'produtos'>;
export type Pedido = Tables<'pedidos'>;
export type ItemPedido = Tables<'itens_pedido'>;
export type Inventario = Tables<'inventarios'>;
export type ItemInventario = Tables<'itens_inventario'>;
export type MovimentacaoEstoque = Tables<'movimentacoes_estoque'>;

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

export interface EstoqueItem {
  codigo_auxiliar: string;
  nome_produto: string;
  modelo: string;
  cor: string;
  quantidade_remessa: number;
  quantidade_venda: number;
  estoque_teorico: number;
}

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
