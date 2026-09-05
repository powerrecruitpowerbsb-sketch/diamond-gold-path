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
      athlete_family_links: {
        Row: {
          created_at: string
          id: string
          org_athlete_id: string
          relationship: Database["public"]["Enums"]["user_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_athlete_id: string
          relationship?: Database["public"]["Enums"]["user_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_athlete_id?: string
          relationship?: Database["public"]["Enums"]["user_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_family_links_org_athlete_id_fkey"
            columns: ["org_athlete_id"]
            isOneToOne: false
            referencedRelation: "org_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_family_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_saved_schools: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          id: string
          notes: string | null
          org_athlete_id: string
          program_id: string
          status: Database["public"]["Enums"]["saved_school_status"]
          updated_at: string
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_athlete_id: string
          program_id: string
          status?: Database["public"]["Enums"]["saved_school_status"]
          updated_at?: string
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_athlete_id?: string
          program_id?: string
          status?: Database["public"]["Enums"]["saved_school_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_saved_schools_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_saved_schools_org_athlete_id_fkey"
            columns: ["org_athlete_id"]
            isOneToOne: false
            referencedRelation: "org_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_saved_schools_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
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
      ingest_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          last_success_at: string | null
          leased_at: string | null
          program_id: string | null
          stage: string
          status: string
          university_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          leased_at?: string | null
          program_id?: string | null
          stage: string
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          leased_at?: string | null
          program_id?: string | null
          stage?: string
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_queue_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_queue_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          program_id: string
          proposals_created: number
          snapshot_written: boolean
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
          url_results: Json
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          program_id: string
          proposals_created?: number
          snapshot_written?: boolean
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
          url_results?: Json
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          program_id?: string
          proposals_created?: number
          snapshot_written?: boolean
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
          url_results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_log: {
        Row: {
          created_at: string
          event_context: string | null
          id: string
          interaction_date: string
          notes: string | null
          relationship_id: string
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_context?: string | null
          id?: string
          interaction_date?: string
          notes?: string | null
          relationship_id: string
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_context?: string | null
          id?: string
          interaction_date?: string
          notes?: string | null
          relationship_id?: string
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_log_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "program_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interaction_log_staff_id_fkey"
            columns: ["staff_id"]
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
      org_athletes: {
        Row: {
          athlete_data_source: Database["public"]["Enums"]["athlete_data_source"]
          bats: Database["public"]["Enums"]["bats_hand"] | null
          created_at: string
          grad_year: number | null
          id: string
          linked_handled_profile_id: string | null
          linked_parent_user_id: string | null
          name: string
          organization_id: string
          primary_position: string | null
          status: Database["public"]["Enums"]["athlete_status"]
          throws: Database["public"]["Enums"]["throws_hand"] | null
          updated_at: string
        }
        Insert: {
          athlete_data_source?: Database["public"]["Enums"]["athlete_data_source"]
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          created_at?: string
          grad_year?: number | null
          id?: string
          linked_handled_profile_id?: string | null
          linked_parent_user_id?: string | null
          name: string
          organization_id: string
          primary_position?: string | null
          status?: Database["public"]["Enums"]["athlete_status"]
          throws?: Database["public"]["Enums"]["throws_hand"] | null
          updated_at?: string
        }
        Update: {
          athlete_data_source?: Database["public"]["Enums"]["athlete_data_source"]
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          created_at?: string
          grad_year?: number | null
          id?: string
          linked_handled_profile_id?: string | null
          linked_parent_user_id?: string | null
          name?: string
          organization_id?: string
          primary_position?: string | null
          status?: Database["public"]["Enums"]["athlete_status"]
          throws?: Database["public"]["Enums"]["throws_hand"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_athletes_linked_parent_user_id_fkey"
            columns: ["linked_parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_athletes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          grants_role: Database["public"]["Enums"]["user_type"]
          id: string
          is_active: boolean
          label: string | null
          max_uses: number | null
          organization_id: string
          updated_at: string
          uses: number
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants_role?: Database["public"]["Enums"]["user_type"]
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          organization_id: string
          updated_at?: string
          uses?: number
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          grants_role?: Database["public"]["Enums"]["user_type"]
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          organization_id?: string
          updated_at?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_member_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_role: Database["public"]["Enums"]["user_type"]
          org_athlete_id: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_role: Database["public"]["Enums"]["user_type"]
          org_athlete_id?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_role?: Database["public"]["Enums"]["user_type"]
          org_athlete_id?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_member_invites_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_invites_org_athlete_id_fkey"
            columns: ["org_athlete_id"]
            isOneToOne: false
            referencedRelation: "org_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_member_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_player_notes: {
        Row: {
          author_user_id: string | null
          created_at: string
          id: string
          note: string
          org_athlete_id: string
          visible_to_parent: boolean
        }
        Insert: {
          author_user_id?: string | null
          created_at?: string
          id?: string
          note: string
          org_athlete_id: string
          visible_to_parent?: boolean
        }
        Update: {
          author_user_id?: string | null
          created_at?: string
          id?: string
          note?: string
          org_athlete_id?: string
          visible_to_parent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "org_player_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_player_notes_org_athlete_id_fkey"
            columns: ["org_athlete_id"]
            isOneToOne: false
            referencedRelation: "org_athletes"
            referencedColumns: ["id"]
          },
        ]
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
      pending_data_changes: {
        Row: {
          ai_confidence: number | null
          created_at: string
          decided_via: string
          field_name: string | null
          id: string
          original_value: Json | null
          proposed_value: Json
          record_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
          status: Database["public"]["Enums"]["pending_change_status"]
          table_name: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string
          decided_via?: string
          field_name?: string | null
          id?: string
          original_value?: Json | null
          proposed_value: Json
          record_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["pending_change_status"]
          table_name: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string
          decided_via?: string
          field_name?: string | null
          id?: string
          original_value?: Json | null
          proposed_value?: Json
          record_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["pending_change_status"]
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_data_changes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      program_relationships: {
        Row: {
          created_at: string
          id: string
          last_meaningful_interaction_at: string | null
          primary_contact_staff_id: string | null
          program_id: string
          relationship_strength: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_meaningful_interaction_at?: string | null
          primary_contact_staff_id?: string | null
          program_id: string
          relationship_strength?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_meaningful_interaction_at?: string | null
          primary_contact_staff_id?: string | null
          program_id?: string
          relationship_strength?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_relationships_primary_contact_staff_id_fkey"
            columns: ["primary_contact_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_relationships_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
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
          offering_status: Database["public"]["Enums"]["program_offering_status"]
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
          offering_status?: Database["public"]["Enums"]["program_offering_status"]
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
          offering_status?: Database["public"]["Enums"]["program_offering_status"]
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
      recruiting_intelligence: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          field_type: Database["public"]["Enums"]["intel_field_type"]
          id: string
          program_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          field_type: Database["public"]["Enums"]["intel_field_type"]
          id?: string
          program_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          field_type?: Database["public"]["Enums"]["intel_field_type"]
          id?: string
          program_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_intelligence_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_intelligence_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_intelligence_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
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
      roster_snapshots: {
        Row: {
          class_year_counts: Json
          created_at: string
          id: string
          juco_transfer_count: number
          position_counts: Json
          program_id: string
          pulled_at: string
          season_year: number | null
          source_url: string | null
          transfer_count: number
        }
        Insert: {
          class_year_counts?: Json
          created_at?: string
          id?: string
          juco_transfer_count?: number
          position_counts?: Json
          program_id: string
          pulled_at?: string
          season_year?: number | null
          source_url?: string | null
          transfer_count?: number
        }
        Update: {
          class_year_counts?: Json
          created_at?: string
          id?: string
          juco_transfer_count?: number
          position_counts?: Json
          program_id?: string
          pulled_at?: string
          season_year?: number | null
          source_url?: string | null
          transfer_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_snapshots_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          name: string
          organization_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name: string
          organization_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name?: string
          organization_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_athletes: {
        Row: {
          created_at: string
          id: string
          jersey_number: string | null
          org_athlete_id: string
          season_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jersey_number?: string | null
          org_athlete_id: string
          season_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jersey_number?: string | null
          org_athlete_id?: string
          season_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_athletes_org_athlete_id_fkey"
            columns: ["org_athlete_id"]
            isOneToOne: false
            referencedRelation: "org_athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_athletes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_athletes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_coaches: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_coaches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          created_at: string
          head_coach_user_id: string | null
          id: string
          name: string
          organization_id: string
          season_id: string
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          created_at?: string
          head_coach_user_id?: string | null
          id?: string
          name: string
          organization_id: string
          season_id: string
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          created_at?: string
          head_coach_user_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_head_coach_user_id_fkey"
            columns: ["head_coach_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
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
          federal_match_name: string | null
          federal_match_status: string
          federal_synced_at: string | null
          financial_aid_url: string | null
          graduation_rate: number | null
          id: string
          ipeds_unitid: number | null
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
          federal_match_name?: string | null
          federal_match_status?: string
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          ipeds_unitid?: number | null
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
          federal_match_name?: string | null
          federal_match_status?: string
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          ipeds_unitid?: number | null
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
      url_discovery_queue: {
        Row: {
          confidence: Database["public"]["Enums"]["url_discovery_confidence"]
          created_at: string
          discovered_url: string | null
          discovery_type: Database["public"]["Enums"]["url_discovery_type"]
          id: string
          notes: string | null
          program_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["url_discovery_status"]
          university_id: string
          updated_at: string
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["url_discovery_confidence"]
          created_at?: string
          discovered_url?: string | null
          discovery_type: Database["public"]["Enums"]["url_discovery_type"]
          id?: string
          notes?: string | null
          program_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["url_discovery_status"]
          university_id: string
          updated_at?: string
        }
        Update: {
          confidence?: Database["public"]["Enums"]["url_discovery_confidence"]
          created_at?: string
          discovered_url?: string | null
          discovery_type?: Database["public"]["Enums"]["url_discovery_type"]
          id?: string
          notes?: string | null
          program_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["url_discovery_status"]
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "url_discovery_queue_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_discovery_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_discovery_queue_university_id_fkey"
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
          org_wide_access: boolean
          organization_id: string | null
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          linked_org_athlete_id?: string | null
          name?: string | null
          org_wide_access?: boolean
          organization_id?: string | null
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          linked_org_athlete_id?: string | null
          name?: string | null
          org_wide_access?: boolean
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
      active_season_id: { Args: never; Returns: string }
      can_access_athlete: { Args: { _athlete_id: string }; Returns: boolean }
      coaches_team: { Args: { _team_id: string }; Returns: boolean }
      current_org_id: { Args: never; Returns: string }
      has_org_wide_access: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_type"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_invite_code: { Args: { _code: string }; Returns: string }
      invite_code_valid: { Args: { _code: string }; Returns: boolean }
      is_linked_athlete: { Args: { _athlete_id: string }; Returns: boolean }
      is_org_manager: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      program_roster_summary: {
        Args: { _program_id: string }
        Returns: {
          roster_size: number
          season_year: number
        }[]
      }
    }
    Enums: {
      athlete_data_source: "manual" | "csv" | "handled" | "curve_testing"
      athlete_status: "active" | "graduated" | "departed"
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
      governing_body: "NCAA" | "NAIA" | "NJCAA" | "CCCAA" | "NWAC"
      intel_field_type:
        | "style_of_play"
        | "recruiting_philosophy"
        | "positions_prioritized"
        | "preferred_player_profile"
        | "transfer_juco_tendencies"
        | "freshman_tendencies"
        | "geographic_tendencies"
        | "recruiting_timeline"
        | "roster_construction_tendencies"
      pending_change_status: "pending" | "approved" | "rejected"
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
      program_offering_status: "unverified" | "verified" | "not_offered"
      public_private: "public" | "private"
      saved_school_status:
        | "researching"
        | "contacted"
        | "offered"
        | "committed"
        | "eliminated"
      school_size_bucket: "small" | "medium" | "large"
      source_type: "official" | "aggregator" | "manual"
      sport: "baseball" | "softball"
      throws_hand: "R" | "L"
      url_discovery_confidence: "high" | "low" | "failed"
      url_discovery_status: "pending_review" | "confirmed" | "rejected"
      url_discovery_type:
        | "athletic_website"
        | "roster_page"
        | "coaching_staff_page"
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
      athlete_data_source: ["manual", "csv", "handled", "curve_testing"],
      athlete_status: ["active", "graduated", "departed"],
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
      governing_body: ["NCAA", "NAIA", "NJCAA", "CCCAA", "NWAC"],
      intel_field_type: [
        "style_of_play",
        "recruiting_philosophy",
        "positions_prioritized",
        "preferred_player_profile",
        "transfer_juco_tendencies",
        "freshman_tendencies",
        "geographic_tendencies",
        "recruiting_timeline",
        "roster_construction_tendencies",
      ],
      pending_change_status: ["pending", "approved", "rejected"],
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
      program_offering_status: ["unverified", "verified", "not_offered"],
      public_private: ["public", "private"],
      saved_school_status: [
        "researching",
        "contacted",
        "offered",
        "committed",
        "eliminated",
      ],
      school_size_bucket: ["small", "medium", "large"],
      source_type: ["official", "aggregator", "manual"],
      sport: ["baseball", "softball"],
      throws_hand: ["R", "L"],
      url_discovery_confidence: ["high", "low", "failed"],
      url_discovery_status: ["pending_review", "confirmed", "rejected"],
      url_discovery_type: [
        "athletic_website",
        "roster_page",
        "coaching_staff_page",
      ],
      user_type: ["superadmin", "org_admin", "org_staff", "parent", "player"],
    },
  },
} as const
