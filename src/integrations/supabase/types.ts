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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      caixas: {
        Row: {
          altura_cm: number
          caixa_fornecedor: boolean
          caixa_terciaria_fornecedor: number | null
          caixas_secundarias_permitidas_na_terciaria: number | null
          codigo_caixa: number
          comprimento_cm: number
          largura_cm: number
          nome_caixa: string
          observacao: string | null
          peso_caixa_kg: number
          quantidade_itens_por_caixa_secundaria: number | null
          quantidade_itens_por_caixa_terciaria: number | null
          terciaria_parcial_minimo: number | null
          tipo_caixa: string
          updated_at: string | null
        }
        Insert: {
          altura_cm?: number
          caixa_fornecedor?: boolean
          caixa_terciaria_fornecedor?: number | null
          caixas_secundarias_permitidas_na_terciaria?: number | null
          codigo_caixa: number
          comprimento_cm?: number
          largura_cm?: number
          nome_caixa: string
          observacao?: string | null
          peso_caixa_kg?: number
          quantidade_itens_por_caixa_secundaria?: number | null
          quantidade_itens_por_caixa_terciaria?: number | null
          terciaria_parcial_minimo?: number | null
          tipo_caixa: string
          updated_at?: string | null
        }
        Update: {
          altura_cm?: number
          caixa_fornecedor?: boolean
          caixa_terciaria_fornecedor?: number | null
          caixas_secundarias_permitidas_na_terciaria?: number | null
          codigo_caixa?: number
          comprimento_cm?: number
          largura_cm?: number
          nome_caixa?: string
          observacao?: string | null
          peso_caixa_kg?: number
          quantidade_itens_por_caixa_secundaria?: number | null
          quantidade_itens_por_caixa_terciaria?: number | null
          terciaria_parcial_minimo?: number | null
          tipo_caixa?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cubagens: {
        Row: {
          cliente: string | null
          created_at: string | null
          data_pedido: string | null
          id: string
          itens: Json | null
          m3_total: number | null
          pedido: string | null
          peso_total_kg: number | null
          quantidade_volumes: number | null
          resultado: Json | null
          texto_cliente: string | null
          tipo_frete: string | null
          user_email: string | null
          user_id: string | null
          valor_nf: number | null
          volumes: Json | null
        }
        Insert: {
          cliente?: string | null
          created_at?: string | null
          data_pedido?: string | null
          id?: string
          itens?: Json | null
          m3_total?: number | null
          pedido?: string | null
          peso_total_kg?: number | null
          quantidade_volumes?: number | null
          resultado?: Json | null
          texto_cliente?: string | null
          tipo_frete?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_nf?: number | null
          volumes?: Json | null
        }
        Update: {
          cliente?: string | null
          created_at?: string | null
          data_pedido?: string | null
          id?: string
          itens?: Json | null
          m3_total?: number | null
          pedido?: string | null
          peso_total_kg?: number | null
          quantidade_volumes?: number | null
          resultado?: Json | null
          texto_cliente?: string | null
          tipo_frete?: string | null
          user_email?: string | null
          user_id?: string | null
          valor_nf?: number | null
          volumes?: Json | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          codigo: string
          codigo_caixa: number | null
          fabricante: string | null
          nome_produto: string | null
          peso_unitario_kg: number
          updated_at: string | null
        }
        Insert: {
          codigo: string
          codigo_caixa?: number | null
          fabricante?: string | null
          nome_produto?: string | null
          peso_unitario_kg?: number
          updated_at?: string | null
        }
        Update: {
          codigo?: string
          codigo_caixa?: number | null
          fabricante?: string | null
          nome_produto?: string | null
          peso_unitario_kg?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
