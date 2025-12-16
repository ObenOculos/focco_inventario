export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      estoque_real: {
        Row: {
          codigo_auxiliar: string
          codigo_vendedor: string
          created_at: string | null
          data_atualizacao: string | null
          id: string
          inventario_id: string | null
          quantidade_real: number
          updated_at: string | null
        }
        Insert: {
          codigo_auxiliar: string
          codigo_vendedor: string
          created_at?: string | null
          data_atualizacao?: string | null
          id?: string
          inventario_id?: string | null
          quantidade_real?: number
          updated_at?: string | null
        }
        Update: {
          codigo_auxiliar?: string
          codigo_vendedor?: string
          created_at?: string | null
          data_atualizacao?: string | null
          id?: string
          inventario_id?: string | null
          quantidade_real?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_real_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarios: {
        Row: {
          codigo_vendedor: string
          created_at: string
          data_inventario: string
          id: string
          observacoes: string | null
          observacoes_gerente: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_vendedor: string
          created_at?: string
          data_inventario?: string
          id?: string
          observacoes?: string | null
          observacoes_gerente?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_vendedor?: string
          created_at?: string
          data_inventario?: string
          id?: string
          observacoes?: string | null
          observacoes_gerente?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_inventario: {
        Row: {
          codigo_auxiliar: string
          created_at: string
          id: string
          inventario_id: string
          nome_produto: string | null
          quantidade_fisica: number
        }
        Insert: {
          codigo_auxiliar: string
          created_at?: string
          id?: string
          inventario_id: string
          nome_produto?: string | null
          quantidade_fisica?: number
        }
        Update: {
          codigo_auxiliar?: string
          created_at?: string
          id?: string
          inventario_id?: string
          nome_produto?: string | null
          quantidade_fisica?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_inventario_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_pedido: {
        Row: {
          codigo_auxiliar: string
          created_at: string
          id: string
          nome_produto: string
          pedido_id: string
          quantidade: number
          valor_produto: number
        }
        Insert: {
          codigo_auxiliar: string
          created_at?: string
          id?: string
          nome_produto: string
          pedido_id: string
          quantidade?: number
          valor_produto?: number
        }
        Update: {
          codigo_auxiliar?: string
          created_at?: string
          id?: string
          nome_produto?: string
          pedido_id?: string
          quantidade?: number
          valor_produto?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          codigo_cliente: string | null
          codigo_empresa: number | null
          codigo_tipo: number
          codigo_vendedor: string
          created_at: string
          data_emissao: string
          empresa: string | null
          id: string
          nome_vendedor: string | null
          numero_nota_fiscal: string | null
          numero_pedido: string
          serie_nota_fiscal: string | null
          situacao: string | null
          valor_total: number
        }
        Insert: {
          codigo_cliente?: string | null
          codigo_empresa?: number | null
          codigo_tipo: number
          codigo_vendedor: string
          created_at?: string
          data_emissao: string
          empresa?: string | null
          id?: string
          nome_vendedor?: string | null
          numero_nota_fiscal?: string | null
          numero_pedido: string
          serie_nota_fiscal?: string | null
          situacao?: string | null
          valor_total?: number
        }
        Update: {
          codigo_cliente?: string | null
          codigo_empresa?: number | null
          codigo_tipo?: number
          codigo_vendedor?: string
          created_at?: string
          data_emissao?: string
          empresa?: string | null
          id?: string
          nome_vendedor?: string | null
          numero_nota_fiscal?: string | null
          numero_pedido?: string
          serie_nota_fiscal?: string | null
          situacao?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      produtos: {
        Row: {
          codigo_auxiliar: string
          codigo_produto: string
          cor: string
          created_at: string
          id: string
          modelo: string
          nome_produto: string
          updated_at: string
          valor_produto: number | null
        }
        Insert: {
          codigo_auxiliar: string
          codigo_produto: string
          cor: string
          created_at?: string
          id?: string
          modelo: string
          nome_produto: string
          updated_at?: string
          valor_produto?: number | null
        }
        Update: {
          codigo_auxiliar?: string
          codigo_produto?: string
          cor?: string
          created_at?: string
          id?: string
          modelo?: string
          nome_produto?: string
          updated_at?: string
          valor_produto?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          codigo_vendedor: string | null
          created_at: string
          email: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["user_role"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          email: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["user_role"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["user_role"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_estoque_teorico_pos_inventario: {
        Args: { p_codigo_vendedor: string }
        Returns: {
          codigo_auxiliar: string
          estoque_teorico: number
          nome_produto: string
        }[]
      }
      calcular_estoque_vendedor: {
        Args: { p_codigo_vendedor: string }
        Returns: {
          codigo_auxiliar: string
          cor: string
          estoque_teorico: number
          modelo: string
          nome_produto: string
          quantidade_remessa: number
          quantidade_venda: number
        }[]
      }
      calcular_estoque_vendedor_ate_data: {
        Args: { p_codigo_vendedor: string; p_data_limite: string }
        Returns: {
          codigo_auxiliar: string
          estoque_teorico: number
          nome_produto: string
        }[]
      }
      calcular_estoque_vendedor_paginado: {
        Args: { p_codigo_vendedor: string; p_limit?: number; p_offset?: number }
        Returns: {
          codigo_auxiliar: string
          cor: string
          estoque_teorico: number
          modelo: string
          nome_produto: string
          quantidade_remessa: number
          quantidade_venda: number
        }[]
      }
      comparar_estoque_inventario: {
        Args: { p_inventario_id: string }
        Returns: {
          codigo_auxiliar: string
          divergencia: number
          estoque_teorico: number
          foi_contado: boolean
          nome_produto: string
          quantidade_fisica: number
        }[]
      }
      comparar_estoque_inventario_paginado: {
        Args: { p_inventario_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          codigo_auxiliar: string
          diferenca: number
          foi_contado: boolean
          nome_produto: string
          quantidade_contada: number
          quantidade_inventario: number
        }[]
      }
      comparar_estoque_teorico_vs_real: {
        Args: { p_codigo_vendedor: string }
        Returns: {
          codigo_auxiliar: string
          data_atualizacao_real: string
          diferenca: number
          estoque_real: number
          estoque_teorico: number
          nome_produto: string
        }[]
      }
      comparar_estoque_teorico_vs_real_paginado: {
        Args: { p_codigo_vendedor: string; p_limit?: number; p_offset?: number }
        Returns: {
          codigo_auxiliar: string
          data_atualizacao_real: string
          diferenca: number
          estoque_real: number
          estoque_teorico: number
          nome_produto: string
        }[]
      }
      get_entradas_pedidos: {
        Args: {
          p_codigo_vendedor: string
          p_data_fim?: string
          p_data_inicio?: string
        }
        Returns: {
          codigo_auxiliar: string
          nome_produto: string
          quantidade: number
        }[]
      }
      get_entradas_pedidos_paginado: {
        Args: {
          p_codigo_vendedor: string
          p_data_fim?: string
          p_data_inicio: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          codigo_auxiliar: string
          data_pedido: string
          numero_pedido: string
          quantidade: number
        }[]
      }
      get_estoque_real_vendedor: {
        Args: { p_codigo_vendedor: string }
        Returns: {
          codigo_auxiliar: string
          data_atualizacao: string
          inventario_id: string
          quantidade_real: number
        }[]
      }
      get_saidas_pedidos: {
        Args: {
          p_codigo_vendedor: string
          p_data_fim?: string
          p_data_inicio?: string
        }
        Returns: {
          codigo_auxiliar: string
          nome_produto: string
          quantidade: number
        }[]
      }
      get_saidas_pedidos_paginado: {
        Args: {
          p_codigo_vendedor: string
          p_data_fim?: string
          p_data_inicio: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          codigo_auxiliar: string
          data_pedido: string
          numero_pedido: string
          quantidade: number
        }[]
      }
      get_user_codigo_vendedor: { Args: { user_id: string }; Returns: string }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      inventory_status: "pendente" | "aprovado" | "revisao"
      user_role: "vendedor" | "gerente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      inventory_status: ["pendente", "aprovado", "revisao"],
      user_role: ["vendedor", "gerente"],
    },
  },
} as const
