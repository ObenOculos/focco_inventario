export type UserRole = 'vendedor' | 'gerente';
export type InventoryStatus = 'pendente' | 'aprovado' | 'revisao';

// Novo enum para tipos de movimentação (alinhado com o banco)
export type MovimentacaoTipo = 'ajuste_entrada' | 'ajuste_saida' | 'devolucao_cliente' | 'devolucao_empresa' | 'perda_avaria';

export interface Profile {
  id: string;
  email: string;
  nome: string;
  codigo_vendedor: string | null;
  telefone: string | null;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Produto {
  id: string;
  codigo_produto: string;
  codigo_auxiliar: string;
  nome_produto: string;
  modelo: string;
  cor: string;
  valor_produto: number;
  created_at: string;
  updated_at: string;
}

export interface Pedido {
  id: string;
  numero_pedido: string;
  data_emissao: string;
  codigo_cliente: string | null;
  codigo_vendedor: string;
  nome_vendedor: string | null;
  valor_total: number;
  codigo_tipo: number;
  situacao: string;
  numero_nota_fiscal: string | null;
  serie_nota_fiscal: string | null;
  codigo_empresa: number | null;
  empresa: string | null;
  created_at: string;
}

export interface ItemPedido {
  id: string;
  pedido_id: string;
  codigo_auxiliar: string;
  nome_produto: string;
  quantidade: number;
  valor_produto: number;
  created_at: string;
}

export interface Inventario {
  id: string;
  codigo_vendedor: string;
  user_id: string;
  data_inventario: string;
  status: InventoryStatus;
  observacoes: string | null;
  observacoes_gerente: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemInventario {
  id: string;
  inventario_id: string;
  codigo_auxiliar: string;
  nome_produto: string | null;
  quantidade_fisica: number;
  created_at: string;
}

export interface MovimentacaoEstoque {
  id: string;
  codigo_vendedor: string;
  codigo_auxiliar: string;
  nome_produto: string | null;
  tipo_movimentacao: MovimentacaoTipo;
  quantidade: number;
  motivo: string | null;
  observacoes: string | null;
  data_movimentacao: string;
  origem_id?: string;
  origem_tipo?: string;
  created_at: string;
}

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
