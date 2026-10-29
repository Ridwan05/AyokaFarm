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
      adjustment_reasons: {
        Row: {
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          name: string
        }
        Update: {
          id?: never
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: never
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bird_types: {
        Row: {
          id: number
          is_active: boolean
          lays_eggs: boolean
          name: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          lays_eggs?: boolean
          name: string
        }
        Update: {
          id?: never
          is_active?: boolean
          lays_eggs?: boolean
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          area: string | null
          buys: Database["public"]["Enums"]["product_kind"][]
          created_at: string
          created_by: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          id: number
          is_active: boolean
          name: string
          opening_balance: number
          opening_balance_checked: boolean
          opening_balance_source: string | null
          phone: string | null
          short_name: string | null
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          address?: string | null
          area?: string | null
          buys?: Database["public"]["Enums"]["product_kind"][]
          created_at?: string
          created_by?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          id?: never
          is_active?: boolean
          name: string
          opening_balance?: number
          opening_balance_checked?: boolean
          opening_balance_source?: string | null
          phone?: string | null
          short_name?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          address?: string | null
          area?: string | null
          buys?: Database["public"]["Enums"]["product_kind"][]
          created_at?: string
          created_by?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          id?: never
          is_active?: boolean
          name?: string
          opening_balance?: number
          opening_balance_checked?: boolean
          opening_balance_source?: string | null
          phone?: string | null
          short_name?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          id?: never
          is_active?: boolean
          name: string
        }
        Update: {
          id?: never
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          amount_paid: number
          category_id: number
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: number
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pen_id: number | null
          receipt_path: string | null
          recorded_by: string
          ref: string
          spent_on: string
          supplier_id: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          amount_paid: number
          category_id: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          id?: never
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pen_id?: number | null
          receipt_path?: string | null
          recorded_by?: string
          ref?: string
          spent_on?: string
          supplier_id?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          category_id?: number
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: never
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pen_id?: number | null
          receipt_path?: string | null
          recorded_by?: string
          ref?: string
          spent_on?: string
          supplier_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_settings: {
        Row: {
          address: string | null
          currency: string
          edit_window_days: number
          eggs_per_crate: number
          email: string | null
          expiry_warning_days: number
          farm_name: string
          feed_variance_pct: number
          financial_year_start_month: number
          go_live_date: string | null
          id: boolean
          logo_path: string | null
          low_stock_days: number
          missing_entry_cutoff: string
          mortality_alert_pct: number
          overdue_debt_days: number
          phone: string | null
          receipt_footer: string | null
          time_zone: string
          trading_as: string | null
          updated_at: string
          whatsapp_monthly_limit: number | null
          whatsapp_sender: string | null
        }
        Insert: {
          address?: string | null
          currency?: string
          edit_window_days?: number
          eggs_per_crate?: number
          email?: string | null
          expiry_warning_days?: number
          farm_name: string
          feed_variance_pct?: number
          financial_year_start_month?: number
          go_live_date?: string | null
          id?: boolean
          logo_path?: string | null
          low_stock_days?: number
          missing_entry_cutoff?: string
          mortality_alert_pct?: number
          overdue_debt_days?: number
          phone?: string | null
          receipt_footer?: string | null
          time_zone?: string
          trading_as?: string | null
          updated_at?: string
          whatsapp_monthly_limit?: number | null
          whatsapp_sender?: string | null
        }
        Update: {
          address?: string | null
          currency?: string
          edit_window_days?: number
          eggs_per_crate?: number
          email?: string | null
          expiry_warning_days?: number
          farm_name?: string
          feed_variance_pct?: number
          financial_year_start_month?: number
          go_live_date?: string | null
          id?: boolean
          logo_path?: string | null
          low_stock_days?: number
          missing_entry_cutoff?: string
          mortality_alert_pct?: number
          overdue_debt_days?: number
          phone?: string | null
          receipt_footer?: string | null
          time_zone?: string
          trading_as?: string | null
          updated_at?: string
          whatsapp_monthly_limit?: number | null
          whatsapp_sender?: string | null
        }
        Relationships: []
      }
      feed_targets: {
        Row: {
          bird_type_id: number
          breed: string | null
          grams_per_bird_day: number
          id: number
          recommended_feed_type_id: number | null
          week_from: number
          week_to: number | null
        }
        Insert: {
          bird_type_id: number
          breed?: string | null
          grams_per_bird_day: number
          id?: never
          recommended_feed_type_id?: number | null
          week_from: number
          week_to?: number | null
        }
        Update: {
          bird_type_id?: number
          breed?: string | null
          grams_per_bird_day?: number
          id?: never
          recommended_feed_type_id?: number | null
          week_from?: number
          week_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_targets_bird_type_id_fkey"
            columns: ["bird_type_id"]
            isOneToOne: false
            referencedRelation: "bird_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_targets_recommended_feed_type_id_fkey"
            columns: ["recommended_feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_types: {
        Row: {
          bag_kg: number
          id: number
          is_active: boolean
          name: string
          reorder_level_bags: number
        }
        Insert: {
          bag_kg?: number
          id?: never
          is_active?: boolean
          name: string
          reorder_level_bags?: number
        }
        Update: {
          bag_kg?: number
          id?: never
          is_active?: boolean
          name?: string
          reorder_level_bags?: number
        }
        Relationships: []
      }
      flocks: {
        Row: {
          age_at_placement_days: number
          bird_type_id: number
          birds_placed: number
          breed: string | null
          closed_on: string | null
          code: string
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          pen_id: number
          placed_on: string
          status: Database["public"]["Enums"]["flock_status"]
          updated_at: string
        }
        Insert: {
          age_at_placement_days?: number
          bird_type_id: number
          birds_placed: number
          breed?: string | null
          closed_on?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          pen_id: number
          placed_on: string
          status?: Database["public"]["Enums"]["flock_status"]
          updated_at?: string
        }
        Update: {
          age_at_placement_days?: number
          bird_type_id?: number
          birds_placed?: number
          breed?: string | null
          closed_on?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: never
          notes?: string | null
          pen_id?: number
          placed_on?: string
          status?: Database["public"]["Enums"]["flock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flocks_bird_type_id_fkey"
            columns: ["bird_type_id"]
            isOneToOne: false
            referencedRelation: "bird_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flocks_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          category: Database["public"]["Enums"]["medication_category"]
          default_mode: Database["public"]["Enums"]["medication_mode"] | null
          default_purpose:
            | Database["public"]["Enums"]["medication_purpose"]
            | null
          dosage_note: string | null
          id: number
          is_active: boolean
          name: string
          reorder_level: number
          stock_unit: string
          withdrawal_days: number | null
        }
        Insert: {
          category: Database["public"]["Enums"]["medication_category"]
          default_mode?: Database["public"]["Enums"]["medication_mode"] | null
          default_purpose?:
            | Database["public"]["Enums"]["medication_purpose"]
            | null
          dosage_note?: string | null
          id?: never
          is_active?: boolean
          name: string
          reorder_level?: number
          stock_unit: string
          withdrawal_days?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["medication_category"]
          default_mode?: Database["public"]["Enums"]["medication_mode"] | null
          default_purpose?:
            | Database["public"]["Enums"]["medication_purpose"]
            | null
          dosage_note?: string | null
          id?: never
          is_active?: boolean
          name?: string
          reorder_level?: number
          stock_unit?: string
          withdrawal_days?: number | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id: number
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_on: string
          recorded_by: string
          ref: string
          reference: string | null
          supplier_id: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: never
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          recorded_by?: string
          ref: string
          reference?: string | null
          supplier_id?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: never
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_on?: string
          recorded_by?: string
          ref?: string
          reference?: string | null
          supplier_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pens: {
        Row: {
          bird_type_id: number | null
          capacity: number
          created_at: string
          id: number
          is_active: boolean
          name: string
        }
        Insert: {
          bird_type_id?: number | null
          capacity: number
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
        }
        Update: {
          bird_type_id?: number | null
          capacity?: number
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pens_bird_type_id_fkey"
            columns: ["bird_type_id"]
            isOneToOne: false
            referencedRelation: "bird_types"
            referencedColumns: ["id"]
          },
        ]
      }
      production_medications: {
        Row: {
          created_at: string
          id: number
          medication_id: number
          mode: Database["public"]["Enums"]["medication_mode"]
          production_record_id: number
          purchase_id: number | null
          purpose: Database["public"]["Enums"]["medication_purpose"]
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: never
          medication_id: number
          mode: Database["public"]["Enums"]["medication_mode"]
          production_record_id: number
          purchase_id?: number | null
          purpose: Database["public"]["Enums"]["medication_purpose"]
          quantity: number
        }
        Update: {
          created_at?: string
          id?: never
          medication_id?: number
          mode?: Database["public"]["Enums"]["medication_mode"]
          production_record_id?: number
          purchase_id?: number | null
          purpose?: Database["public"]["Enums"]["medication_purpose"]
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_medications_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_medications_production_record_id_fkey"
            columns: ["production_record_id"]
            isOneToOne: false
            referencedRelation: "production_daily"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_medications_production_record_id_fkey"
            columns: ["production_record_id"]
            isOneToOne: false
            referencedRelation: "production_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_medications_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "medication_batches"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "production_medications_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      production_records: {
        Row: {
          closing_birds: number | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          eggs_collected: number | null
          eggs_cracked: number | null
          feed_bags: number
          feed_type_id: number | null
          flock_id: number
          id: number
          mortality: number
          notes: string | null
          opening_birds: number
          pen_id: number
          record_date: string
          recorded_by: string
          updated_at: string
        }
        Insert: {
          closing_birds?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          eggs_collected?: number | null
          eggs_cracked?: number | null
          feed_bags?: number
          feed_type_id?: number | null
          flock_id: number
          id?: never
          mortality?: number
          notes?: string | null
          opening_birds?: number
          pen_id: number
          record_date?: string
          recorded_by?: string
          updated_at?: string
        }
        Update: {
          closing_birds?: number | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          eggs_collected?: number | null
          eggs_cracked?: number | null
          feed_bags?: number
          feed_type_id?: number | null
          flock_id?: number
          id?: never
          mortality?: number
          notes?: string | null
          opening_birds?: number
          pen_id?: number
          record_date?: string
          recorded_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_flock_id_fkey"
            columns: ["flock_id"]
            isOneToOne: false
            referencedRelation: "flocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bird_type_id: number | null
          id: number
          is_active: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          min_price: number | null
          name: string
          stock_item: Database["public"]["Enums"]["stock_item"] | null
          stock_units_per_unit: number | null
          unit: string
        }
        Insert: {
          bird_type_id?: number | null
          id?: never
          is_active?: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          min_price?: number | null
          name: string
          stock_item?: Database["public"]["Enums"]["stock_item"] | null
          stock_units_per_unit?: number | null
          unit: string
        }
        Update: {
          bird_type_id?: number | null
          id?: never
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          min_price?: number | null
          name?: string
          stock_item?: Database["public"]["Enums"]["stock_item"] | null
          stock_units_per_unit?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_bird_type_id_fkey"
            columns: ["bird_type_id"]
            isOneToOne: false
            referencedRelation: "bird_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_active_at: string | null
          phone: string | null
          role_id: string | null
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          last_active_at?: string | null
          phone?: string | null
          role_id?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          phone?: string | null
          role_id?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_paid: number
          batch_no: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_note: string | null
          expiry_date: string | null
          feed_type_id: number | null
          flock_id: number | null
          id: number
          kind: Database["public"]["Enums"]["purchase_kind"]
          medication_id: number | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          purchased_on: string
          quantity: number
          received_by: string | null
          received_on: string | null
          received_quantity: number | null
          recorded_by: string
          ref: string
          returned_quantity: number
          status: Database["public"]["Enums"]["purchase_status"]
          stock_units_per_unit: number
          supplier_id: number
          total: number | null
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          batch_no?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_note?: string | null
          expiry_date?: string | null
          feed_type_id?: number | null
          flock_id?: number | null
          id?: never
          kind: Database["public"]["Enums"]["purchase_kind"]
          medication_id?: number | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          purchased_on?: string
          quantity: number
          received_by?: string | null
          received_on?: string | null
          received_quantity?: number | null
          recorded_by?: string
          ref: string
          returned_quantity?: number
          status?: Database["public"]["Enums"]["purchase_status"]
          stock_units_per_unit?: number
          supplier_id: number
          total?: number | null
          unit: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          batch_no?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_note?: string | null
          expiry_date?: string | null
          feed_type_id?: number | null
          flock_id?: number | null
          id?: never
          kind?: Database["public"]["Enums"]["purchase_kind"]
          medication_id?: number | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          purchased_on?: string
          quantity?: number
          received_by?: string | null
          received_on?: string | null
          received_quantity?: number | null
          recorded_by?: string
          ref?: string
          returned_quantity?: number
          status?: Database["public"]["Enums"]["purchase_status"]
          stock_units_per_unit?: number
          supplier_id?: number
          total?: number | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_flock_id_fkey"
            columns: ["flock_id"]
            isOneToOne: false
            referencedRelation: "flocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_balances"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_add: Database["public"]["Enums"]["access_level"]
          can_delete: Database["public"]["Enums"]["access_level"]
          can_edit: Database["public"]["Enums"]["access_level"]
          can_view: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          role_id: string
          scope_note: string
        }
        Insert: {
          can_add?: Database["public"]["Enums"]["access_level"]
          can_delete?: Database["public"]["Enums"]["access_level"]
          can_edit?: Database["public"]["Enums"]["access_level"]
          can_view?: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          role_id: string
          scope_note?: string
        }
        Update: {
          can_add?: Database["public"]["Enums"]["access_level"]
          can_delete?: Database["public"]["Enums"]["access_level"]
          can_edit?: Database["public"]["Enums"]["access_level"]
          can_view?: Database["public"]["Enums"]["access_level"]
          module?: Database["public"]["Enums"]["app_module"]
          role_id?: string
          scope_note?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      sale_allocations: {
        Row: {
          flock_id: number | null
          id: number
          pen_id: number
          quantity: number
          sale_id: number
        }
        Insert: {
          flock_id?: number | null
          id?: never
          pen_id: number
          quantity: number
          sale_id: number
        }
        Update: {
          flock_id?: number | null
          id?: never
          pen_id?: number
          quantity?: number
          sale_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_allocations_flock_id_fkey"
            columns: ["flock_id"]
            isOneToOne: false
            referencedRelation: "flocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_allocations_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          approval: Database["public"]["Enums"]["sale_approval"]
          approved_at: string | null
          approved_by: string | null
          buyer_name: string | null
          created_at: string
          customer_id: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          flock_id: number | null
          id: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pen_id: number | null
          product_id: number
          quantity: number
          recorded_by: string
          ref: string
          sold_on: string
          total: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          approval?: Database["public"]["Enums"]["sale_approval"]
          approved_at?: string | null
          approved_by?: string | null
          buyer_name?: string | null
          created_at?: string
          customer_id?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          flock_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pen_id?: number | null
          product_id: number
          quantity: number
          recorded_by?: string
          ref?: string
          sold_on?: string
          total?: number | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          approval?: Database["public"]["Enums"]["sale_approval"]
          approved_at?: string | null
          approved_by?: string | null
          buyer_name?: string | null
          created_at?: string
          customer_id?: number | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          flock_id?: number | null
          id?: never
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          pen_id?: number | null
          product_id?: number
          quantity?: number
          recorded_by?: string
          ref?: string
          sold_on?: string
          total?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_flock_id_fkey"
            columns: ["flock_id"]
            isOneToOne: false
            referencedRelation: "flocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pens: {
        Row: {
          pen_id: number
          profile_id: string
        }
        Insert: {
          pen_id: number
          profile_id: string
        }
        Update: {
          pen_id?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pens_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_on: string
          counted_quantity: number | null
          created_at: string
          feed_type_id: number | null
          id: number
          is_opening: boolean
          item: Database["public"]["Enums"]["stock_item"]
          medication_id: number | null
          note: string | null
          purchase_id: number | null
          quantity_change: number
          reason_id: number | null
          recorded_by: string
        }
        Insert: {
          adjusted_on?: string
          counted_quantity?: number | null
          created_at?: string
          feed_type_id?: number | null
          id?: never
          is_opening?: boolean
          item: Database["public"]["Enums"]["stock_item"]
          medication_id?: number | null
          note?: string | null
          purchase_id?: number | null
          quantity_change: number
          reason_id?: number | null
          recorded_by?: string
        }
        Update: {
          adjusted_on?: string
          counted_quantity?: number | null
          created_at?: string
          feed_type_id?: number | null
          id?: never
          is_opening?: boolean
          item?: Database["public"]["Enums"]["stock_item"]
          medication_id?: number | null
          note?: string | null
          purchase_id?: number | null
          quantity_change?: number
          reason_id?: number | null
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "medication_batches"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "stock_adjustments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "adjustment_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          feed_type_id: number | null
          id: number
          item: Database["public"]["Enums"]["stock_item"]
          medication_id: number | null
          moved_on: string
          movement: Database["public"]["Enums"]["stock_movement_type"]
          pen_id: number | null
          purchase_id: number | null
          quantity: number
          source_id: number
          source_table: string
        }
        Insert: {
          created_at?: string
          feed_type_id?: number | null
          id?: never
          item: Database["public"]["Enums"]["stock_item"]
          medication_id?: number | null
          moved_on: string
          movement: Database["public"]["Enums"]["stock_movement_type"]
          pen_id?: number | null
          purchase_id?: number | null
          quantity: number
          source_id: number
          source_table: string
        }
        Update: {
          created_at?: string
          feed_type_id?: number | null
          id?: never
          item?: Database["public"]["Enums"]["stock_item"]
          medication_id?: number | null
          moved_on?: string
          movement?: Database["public"]["Enums"]["stock_movement_type"]
          pen_id?: number | null
          purchase_id?: number | null
          quantity?: number
          source_id?: number
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "medication_batches"
            referencedColumns: ["purchase_id"]
          },
          {
            foreignKeyName: "stock_movements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          name: string
          opening_balance: number
          opening_balance_checked: boolean
          opening_balance_source: string | null
          payment_terms_days: number | null
          phone: string | null
          short_name: string | null
          supplies: Database["public"]["Enums"]["supplier_kind"][]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          name: string
          opening_balance?: number
          opening_balance_checked?: boolean
          opening_balance_source?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          short_name?: string | null
          supplies?: Database["public"]["Enums"]["supplier_kind"][]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          name?: string
          opening_balance?: number
          opening_balance_checked?: boolean
          opening_balance_source?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          short_name?: string | null
          supplies?: Database["public"]["Enums"]["supplier_kind"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_balances: {
        Row: {
          balance: number | null
          customer_id: number | null
          name: string | null
        }
        Insert: {
          balance?: never
          customer_id?: number | null
          name?: string | null
        }
        Update: {
          balance?: never
          customer_id?: number | null
          name?: string | null
        }
        Relationships: []
      }
      customer_statement: {
        Row: {
          balance: number | null
          charged: number | null
          customer_id: number | null
          entered_at: string | null
          entry_date: string | null
          entry_type: string | null
          paid: number | null
          previous_balance: number | null
          ref: string | null
        }
        Relationships: []
      }
      medication_batches: {
        Row: {
          batch_no: string | null
          expiry_date: string | null
          medication_id: number | null
          on_hand: number | null
          purchase_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      production_daily: {
        Row: {
          age_days: number | null
          closing_birds: number | null
          created_at: string | null
          eggs_collected: number | null
          eggs_cracked: number | null
          expected_feed_kg: number | null
          feed_bags: number | null
          feed_kg: number | null
          feed_type_id: number | null
          feed_variance_pct: number | null
          flock_id: number | null
          id: number | null
          laying_rate_pct: number | null
          mortality: number | null
          mortality_pct: number | null
          opening_birds: number | null
          pen_id: number | null
          record_date: string | null
          recorded_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_records_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_flock_id_fkey"
            columns: ["flock_id"]
            isOneToOne: false
            referencedRelation: "flocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_daily: {
        Row: {
          adjusted: number | null
          closing: number | null
          feed_type_id: number | null
          item: Database["public"]["Enums"]["stock_item"] | null
          medication_id: number | null
          moved_on: string | null
          opening: number | null
          received: number | null
          used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          feed_type_id: number | null
          item: Database["public"]["Enums"]["stock_item"] | null
          medication_id: number | null
          on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_feed_type_id_fkey"
            columns: ["feed_type_id"]
            isOneToOne: false
            referencedRelation: "feed_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_balances: {
        Row: {
          balance: number | null
          name: string | null
          supplier_id: number | null
        }
        Insert: {
          balance?: never
          name?: string | null
          supplier_id?: number | null
        }
        Update: {
          balance?: never
          name?: string | null
          supplier_id?: number | null
        }
        Relationships: []
      }
      supplier_statement: {
        Row: {
          balance: number | null
          charged: number | null
          entered_at: string | null
          entry_date: string | null
          entry_type: string | null
          paid: number | null
          previous_balance: number | null
          ref: string | null
          supplier_id: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      record_sale: {
        Args: { portions?: Json; sale: Json }
        Returns: {
          amount_paid: number
          approval: Database["public"]["Enums"]["sale_approval"]
          approved_at: string | null
          approved_by: string | null
          buyer_name: string | null
          created_at: string
          customer_id: number | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          flock_id: number | null
          id: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          pen_id: number | null
          product_id: number
          quantity: number
          recorded_by: string
          ref: string
          sold_on: string
          total: number | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_sale_allocations: {
        Args: { portions: Json; sale_id: number }
        Returns: undefined
      }
    }
    Enums: {
      access_level: "none" | "own" | "all"
      app_module:
        | "production"
        | "inventory"
        | "medication"
        | "expenses"
        | "dashboard"
        | "sales"
        | "purchases"
        | "payments"
        | "parties"
        | "admin"
      customer_type: "regular" | "one_off"
      flock_status: "active" | "closed"
      medication_category:
        | "vaccine"
        | "antibiotic"
        | "vitamin"
        | "dewormer"
        | "coccidiostat"
        | "disinfectant"
        | "other"
      medication_mode:
        | "water"
        | "feed"
        | "injection"
        | "spray"
        | "eye_nose_drop"
      medication_purpose: "treatment" | "prevention" | "vaccination" | "vitamin"
      payment_direction: "in" | "out"
      payment_method: "cash" | "transfer" | "pos"
      product_kind: "eggs" | "birds" | "droppings" | "sacks"
      purchase_kind: "feed" | "birds" | "medication"
      purchase_status: "ordered" | "received"
      sale_approval: "approved" | "pending" | "rejected"
      stock_item: "feed" | "medication" | "eggs" | "cracked_eggs"
      stock_movement_type:
        | "opening"
        | "received"
        | "used"
        | "collected"
        | "sold"
        | "adjusted"
      supplier_kind: "feed" | "birds" | "medication" | "equipment"
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
    Enums: {
      access_level: ["none", "own", "all"],
      app_module: [
        "production",
        "inventory",
        "medication",
        "expenses",
        "dashboard",
        "sales",
        "purchases",
        "payments",
        "parties",
        "admin",
      ],
      customer_type: ["regular", "one_off"],
      flock_status: ["active", "closed"],
      medication_category: [
        "vaccine",
        "antibiotic",
        "vitamin",
        "dewormer",
        "coccidiostat",
        "disinfectant",
        "other",
      ],
      medication_mode: ["water", "feed", "injection", "spray", "eye_nose_drop"],
      medication_purpose: ["treatment", "prevention", "vaccination", "vitamin"],
      payment_direction: ["in", "out"],
      payment_method: ["cash", "transfer", "pos"],
      product_kind: ["eggs", "birds", "droppings", "sacks"],
      purchase_kind: ["feed", "birds", "medication"],
      purchase_status: ["ordered", "received"],
      sale_approval: ["approved", "pending", "rejected"],
      stock_item: ["feed", "medication", "eggs", "cracked_eggs"],
      stock_movement_type: [
        "opening",
        "received",
        "used",
        "collected",
        "sold",
        "adjusted",
      ],
      supplier_kind: ["feed", "birds", "medication", "equipment"],
    },
  },
} as const
