export type UserRole = 'vendedor' | 'gerente';
export type InventoryStatus = 'pendente' | 'aprovado' | 'revisao';

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
