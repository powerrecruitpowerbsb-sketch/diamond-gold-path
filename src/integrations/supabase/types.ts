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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          created_at: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          created_at?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          ai_suggested_value: string | null
          classification_type: Database["public"]["Enums"]["classification_type"]
          confidence_score: number | null
          created_at: string
          evidence_source_url: string | null
          evidence_text: string | null
          id: string
          is_staff_overridden: boolean
          override_reason: string | null
          program_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          university_id: string | null
          value: string | null
        }
        Insert: {
          ai_suggested_value?: string | null
          classification_type: Database["public"]["Enums"]["classification_type"]
          confidence_score?: number | null
          created_at?: string
          evidence_source_url?: string | null
          evidence_text?: string | null
          id?: string
          is_staff_overridden?: boolean
          override_reason?: string | null
          program_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          university_id?: string | null
          value?: string | null
        }
        Update: {
          ai_suggested_value?: string | null
          classification_type?: Database["public"]["Enums"]["classification_type"]
          confidence_score?: number | null
          created_at?: string
          evidence_source_url?: string | null
          evidence_text?: string | null
          id?: string
          is_staff_overridden?: boolean
          override_reason?: string | null
          program_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          university_id?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classifications_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classifications_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      data_field_sources: {
        Row: {
          created_at: string
          field_name: string
          id: string
          last_verified_at: string | null
          record_id: string
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
          table_name: string
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          last_verified_at?: string | null
          record_id: string
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          table_name: string
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          last_verified_at?: string | null
          record_id?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          table_name?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_field_sources_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      majors: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          access_expires_at: string | null
          annual_fee_amount: number | null
          billing_contact_email: string | null
          billing_status: Database["public"]["Enums"]["billing_status"]
          brand_accent_color: string | null
          brand_primary_color: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_sent_at: string | null
          is_founding_free_org: boolean
          logo_url: string | null
          name: string
          paid_at: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
        }
        Insert: {
          access_expires_at?: string | null
          annual_fee_amount?: number | null
          billing_contact_email?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"]
          brand_accent_color?: string | null
          brand_primary_color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_sent_at?: string | null
          is_founding_free_org?: boolean
          logo_url?: string | null
          name: string
          paid_at?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
        }
        Update: {
          access_expires_at?: string | null
          annual_fee_amount?: number | null
          billing_contact_email?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"]
          brand_accent_color?: string | null
          brand_primary_color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_sent_at?: string | null
          is_founding_free_org?: boolean
          logo_url?: string | null
          name?: string
          paid_at?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          athletic_website: string | null
          coaching_staff_url: string | null
          conference: string | null
          created_at: string
          division: string | null
          facility_url: string | null
          governing_body: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name: string | null
          id: string
          last_roster_pull_at: string | null
          last_verified_at: string | null
          recruiting_coordinator_name: string | null
          roster_url: string | null
          scholarship_details: string | null
          scholarships_available: boolean | null
          sport: Database["public"]["Enums"]["sport"]
          university_id: string
          updated_at: string
        }
        Insert: {
          athletic_website?: string | null
          coaching_staff_url?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          facility_url?: string | null
          governing_body?: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name?: string | null
          id?: string
          last_roster_pull_at?: string | null
          last_verified_at?: string | null
          recruiting_coordinator_name?: string | null
          roster_url?: string | null
          scholarship_details?: string | null
          scholarships_available?: boolean | null
          sport: Database["public"]["Enums"]["sport"]
          university_id: string
          updated_at?: string
        }
        Update: {
          athletic_website?: string | null
          coaching_staff_url?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          facility_url?: string | null
          governing_body?: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name?: string | null
          id?: string
          last_roster_pull_at?: string | null
          last_verified_at?: string | null
          recruiting_coordinator_name?: string | null
          roster_url?: string | null
          scholarship_details?: string | null
          scholarships_available?: boolean | null
          sport?: Database["public"]["Enums"]["sport"]
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_players: {
        Row: {
          bats: Database["public"]["Enums"]["bats_hand"] | null
          class_year: Database["public"]["Enums"]["class_year"] | null
          created_at: string
          home_country: string | null
          home_state: string | null
          hometown: string | null
          id: string
          is_juco_transfer: boolean
          is_transfer: boolean
          name: string
          position: Database["public"]["Enums"]["player_position"] | null
          program_id: string
          season_year: number | null
          sport_specific_attributes: Json | null
          throws: Database["public"]["Enums"]["throws_hand"] | null
          two_way: boolean
        }
        Insert: {
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          class_year?: Database["public"]["Enums"]["class_year"] | null
          created_at?: string
          home_country?: string | null
          home_state?: string | null
          hometown?: string | null
          id?: string
          is_juco_transfer?: boolean
          is_transfer?: boolean
          name: string
          position?: Database["public"]["Enums"]["player_position"] | null
          program_id: string
          season_year?: number | null
          sport_specific_attributes?: Json | null
          throws?: Database["public"]["Enums"]["throws_hand"] | null
          two_way?: boolean
        }
        Update: {
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          class_year?: Database["public"]["Enums"]["class_year"] | null
          created_at?: string
          home_country?: string | null
          home_state?: string | null
          hometown?: string | null
          id?: string
          is_juco_transfer?: boolean
          is_transfer?: boolean
          name?: string
          position?: Database["public"]["Enums"]["player_position"] | null
          program_id?: string
          season_year?: number | null
          sport_specific_attributes?: Json | null
          throws?: Database["public"]["Enums"]["throws_hand"] | null
          two_way?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "roster_players_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          acceptance_rate: number | null
          address: string | null
          admissions_url: string | null
          avg_act: number | null
          avg_gpa: number | null
          avg_sat: number | null
          campus_setting: Database["public"]["Enums"]["campus_setting"] | null
          city: string | null
          created_at: string
          distance_to_airport_miles: number | null
          est_cost_of_attendance: number | null
          est_net_price: number | null
          financial_aid_url: string | null
          graduation_rate: number | null
          id: string
          name: string
          nearest_airport: string | null
          public_private: Database["public"]["Enums"]["public_private"] | null
          region: string | null
          religious_affiliation: boolean
          religious_tradition: string | null
          room_board: number | null
          school_size_bucket:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state: string | null
          student_faculty_ratio: string | null
          test_optional: boolean | null
          tuition_in_state: number | null
          tuition_out_state: number | null
          tuition_source_url: string | null
          undergrad_enrollment: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          acceptance_rate?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          name: string
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean
          religious_tradition?: string | null
          room_board?: number | null
          school_size_bucket?:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state?: string | null
          student_faculty_ratio?: string | null
          test_optional?: boolean | null
          tuition_in_state?: number | null
          tuition_out_state?: number | null
          tuition_source_url?: string | null
          undergrad_enrollment?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          acceptance_rate?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          name?: string
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean
          religious_tradition?: string | null
          room_board?: number | null
          school_size_bucket?:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state?: string | null
          student_faculty_ratio?: string | null
          test_optional?: boolean | null
          tuition_in_state?: number | null
          tuition_out_state?: number | null
          tuition_source_url?: string | null
          undergrad_enrollment?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      university_majors: {
        Row: {
          major_id: string
          university_id: string
        }
        Insert: {
          major_id: string
          university_id: string
        }
        Update: {
          major_id?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_majors_major_id_fkey"
            columns: ["major_id"]
            isOneToOne: false
            referencedRelation: "majors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_majors_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["user_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_type"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          linked_org_athlete_id: string | null
          name: string | null
          organization_id: string | null
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          linked_org_athlete_id?: string | null
          name?: string | null
          organization_id?: string | null
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          linked_org_athlete_id?: string | null
          name?: string | null
          organization_id?: string | null
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_type"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_manager: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
    }
    Enums: {
      audit_action: "create" | "update" | "override"
      bats_hand: "R" | "L" | "S"
      billing_status:
        | "trial"
        | "invoice_sent"
        | "active"
        | "suspended"
        | "canceled"
      campus_setting: "urban" | "suburban" | "rural"
      class_year: "FR" | "SO" | "JR" | "SR" | "GR"
      classification_type:
        | "academic_bucket"
        | "campus_culture"
        | "school_size"
        | "geographic_region"
        | "campus_setting"
      governing_body: "NCAA" | "NAIA" | "NJCAA"
      player_position:
        | "C"
        | "1B"
        | "2B"
        | "3B"
        | "SS"
        | "OF"
        | "UTIL"
        | "RHP"
        | "LHP"
        | "TWO_WAY"
      public_private: "public" | "private"
      school_size_bucket: "small" | "medium" | "large"
      source_type: "official" | "aggregator" | "manual"
      sport: "baseball" | "softball"
      throws_hand: "R" | "L"
      user_type: "superadmin" | "org_admin" | "org_staff" | "parent" | "player"
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
      audit_action: ["create", "update", "override"],
      bats_hand: ["R", "L", "S"],
      billing_status: [
        "trial",
        "invoice_sent",
        "active",
        "suspended",
        "canceled",
      ],
      campus_setting: ["urban", "suburban", "rural"],
      class_year: ["FR", "SO", "JR", "SR", "GR"],
      classification_type: [
        "academic_bucket",
        "campus_culture",
        "school_size",
        "geographic_region",
        "campus_setting",
      ],
      governing_body: ["NCAA", "NAIA", "NJCAA"],
      player_position: [
        "C",
        "1B",
        "2B",
        "3B",
        "SS",
        "OF",
        "UTIL",
        "RHP",
        "LHP",
        "TWO_WAY",
      ],
      public_private: ["public", "private"],
      school_size_bucket: ["small", "medium", "large"],
      source_type: ["official", "aggregator", "manual"],
      sport: ["baseball", "softball"],
      throws_hand: ["R", "L"],
      user_type: ["superadmin", "org_admin", "org_staff", "parent", "player"],
    },
  },
} as const
