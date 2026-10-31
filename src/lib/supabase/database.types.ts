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
      discount_products: {
        Row: {
          discount_id: string
          product_id: string
        }
        Insert: {
          discount_id: string
          product_id: string
        }
        Update: {
          discount_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_products_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_redemptions: {
        Row: {
          amount_minor: number
          created_at: string
          discount_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          discount_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          discount_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          amount_minor: number | null
          code: string
          created_at: string
          currency: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: string
          max_uses: number | null
          min_quantity: number
          min_subtotal_minor: number
          name: string
          percent_bps: number | null
          scope: string
          starts_at: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_minor?: number | null
          code: string
          created_at?: string
          currency?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: string
          max_uses?: number | null
          min_quantity?: number
          min_subtotal_minor?: number
          name: string
          percent_bps?: number | null
          scope: string
          starts_at: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_minor?: number | null
          code?: string
          created_at?: string
          currency?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_uses?: number | null
          min_quantity?: number
          min_subtotal_minor?: number
          name?: string
          percent_bps?: number | null
          scope?: string
          starts_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount_minor: number | null
          created_at: string
          description: string
          discount_minor: number
          id: string
          invoice_id: string
          quantity: number
          subscription_line_id: string
          tax_minor: number
          tax_rate_bps: number
          tax_rule_id: string | null
          unit_price_minor: number
          variant_label: string | null
        }
        Insert: {
          amount_minor?: number | null
          created_at?: string
          description: string
          discount_minor?: number
          id?: string
          invoice_id: string
          quantity: number
          subscription_line_id: string
          tax_minor?: number
          tax_rate_bps?: number
          tax_rule_id?: string | null
          unit_price_minor: number
          variant_label?: string | null
        }
        Update: {
          amount_minor?: number | null
          created_at?: string
          description?: string
          discount_minor?: number
          id?: string
          invoice_id?: string
          quantity?: number
          subscription_line_id?: string
          tax_minor?: number
          tax_rate_bps?: number
          tax_rule_id?: string | null
          unit_price_minor?: number
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_subscription_line_id_fkey"
            columns: ["subscription_line_id"]
            isOneToOne: false
            referencedRelation: "subscription_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_tax_rule_id_fkey"
            columns: ["tax_rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          customer_snapshot: Json
          discount_minor: number
          due_on: string
          id: string
          issued_at: string | null
          number: string
          period_end: string
          period_start: string
          sent_at: string | null
          status: string
          subscription_id: string
          subtotal_minor: number
          tax_minor: number
          total_minor: number | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          currency: string
          customer_id: string
          customer_snapshot?: Json
          discount_minor?: number
          due_on: string
          id?: string
          issued_at?: string | null
          number: string
          period_end: string
          period_start: string
          sent_at?: string | null
          status?: string
          subscription_id: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          customer_snapshot?: Json
          discount_minor?: number
          due_on?: string
          id?: string
          issued_at?: string | null
          number?: string
          period_end?: string
          period_start?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
          subtotal_minor?: number
          tax_minor?: number
          total_minor?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_customer_id_currency_fkey"
            columns: ["subscription_id", "customer_id", "currency"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "customer_id", "currency"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          customer_id: string
          external_reference: string | null
          id: string
          invoice_id: string
          method: string
          note: string
          paid_at: string
          recorded_by: string
          request_fingerprint: string
          request_key: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          customer_id: string
          external_reference?: string | null
          id?: string
          invoice_id: string
          method: string
          note?: string
          paid_at: string
          recorded_by: string
          request_fingerprint: string
          request_key: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          customer_id?: string
          external_reference?: string | null
          id?: string
          invoice_id?: string
          method?: string
          note?: string
          paid_at?: string
          recorded_by?: string
          request_fingerprint?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_customer_id_currency_fkey"
            columns: ["invoice_id", "customer_id", "currency"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "customer_id", "currency"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          allow_close: boolean
          allow_pause: boolean
          allow_renew: boolean
          auto_close: boolean
          available_from: string
          available_until: string | null
          billing_interval: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          min_quantity: number
          name: string
          price_minor: number
          product_id: string
          updated_at: string
          version: number
        }
        Insert: {
          allow_close?: boolean
          allow_pause?: boolean
          allow_renew?: boolean
          auto_close?: boolean
          available_from?: string
          available_until?: string | null
          billing_interval: string
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          name: string
          price_minor: number
          product_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          allow_close?: boolean
          allow_pause?: boolean
          allow_renew?: boolean
          auto_close?: boolean
          available_from?: string
          available_until?: string | null
          billing_interval?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          name?: string
          price_minor?: number
          product_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cost_price_minor: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          notes: string
          product_type: string
          sales_price_minor: number
          tax_rule_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          cost_price_minor: number
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          product_type: string
          sales_price_minor: number
          tax_rule_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          cost_price_minor?: number
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
          product_type?: string
          sales_price_minor?: number
          tax_rule_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tax_rule_id_fkey"
            columns: ["tax_rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_template_lines: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          quantity: number
          template_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          quantity: number
          template_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          quantity?: number
          template_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_template_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_template_lines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quotation_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_template_lines_variant_id_product_id_fkey"
            columns: ["variant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      quotation_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          payment_terms_days: number
          plan_id: string
          updated_at: string
          valid_days: number
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          payment_terms_days?: number
          plan_id: string
          updated_at?: string
          valid_days?: number
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          payment_terms_days?: number
          plan_id?: string
          updated_at?: string
          valid_days?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          is_primary: boolean
          product_id: string
          quantity: number
          subscription_id: string
          unit_price_minor: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_primary?: boolean
          product_id: string
          quantity: number
          subscription_id: string
          unit_price_minor: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          quantity?: number
          subscription_id?: string
          unit_price_minor?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_variant_id_product_id_fkey"
            columns: ["variant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id", "product_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_anchor_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          discount_id: string | null
          expires_at: string
          id: string
          next_billing_at: string | null
          number: string
          payment_terms_days: number
          plan_id: string
          quote_expires_at: string | null
          renewed_from_id: string | null
          request_fingerprint: string
          request_key: string
          start_at: string
          status: string
          template_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          billing_anchor_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by: string
          currency: string
          customer_id: string
          discount_id?: string | null
          expires_at: string
          id?: string
          next_billing_at?: string | null
          number: string
          payment_terms_days?: number
          plan_id: string
          quote_expires_at?: string | null
          renewed_from_id?: string | null
          request_fingerprint: string
          request_key: string
          start_at: string
          status?: string
          template_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          billing_anchor_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string
          discount_id?: string | null
          expires_at?: string
          id?: string
          next_billing_at?: string | null
          number?: string
          payment_terms_days?: number
          plan_id?: string
          quote_expires_at?: string | null
          renewed_from_id?: string | null
          request_fingerprint?: string
          request_key?: string
          start_at?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_renewed_from_id_fkey"
            columns: ["renewed_from_id"]
            isOneToOne: true
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quotation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          is_active: boolean
          name: string
          rate_bps: number
          starts_on: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate_bps: number
          starts_on: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate_bps?: number
          starts_on?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      variants: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_adjustment_minor: number
          product_id: string
          updated_at: string
          version: number
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_adjustment_minor?: number
          product_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_adjustment_minor?: number
          product_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      identity_finish_invitation: {
        Args: {
          p_actor_id: string
          p_claim_token: string
          p_invitation_id: string
        }
        Returns: Json
      }
      identity_prepare_invitation: {
        Args: { p_actor_id: string; p_display_name: string; p_email: string }
        Returns: Json
      }
      identity_release_invitation: {
        Args: {
          p_actor_id: string
          p_claim_token: string
          p_invitation_id: string
        }
        Returns: undefined
      }
      identity_set_access: {
        Args: {
          p_actor_id: string
          p_expected_version: number
          p_is_active?: boolean
          p_role?: string
          p_user_id: string
        }
        Returns: Json
      }
      identity_update_profile: {
        Args: {
          p_actor_id: string
          p_display_name: string
          p_expected_version: number
        }
        Returns: Json
      }
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
