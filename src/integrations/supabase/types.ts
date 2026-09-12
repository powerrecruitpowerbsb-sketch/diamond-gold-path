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
      accuracy_checks: {
        Row: {
          checked_at: string
          detail: string | null
          field_name: string
          fresh_value: string | null
          id: string
          program_id: string | null
          stored_value: string | null
          university_id: string | null
          verdict: string
        }
        Insert: {
          checked_at?: string
          detail?: string | null
          field_name: string
          fresh_value?: string | null
          id?: string
          program_id?: string | null
          stored_value?: string | null
          university_id?: string | null
          verdict: string
        }
        Update: {
          checked_at?: string
          detail?: string | null
          field_name?: string
          fresh_value?: string | null
          id?: string
          program_id?: string | null
          stored_value?: string | null
          university_id?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "accuracy_checks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accuracy_checks_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accuracy_checks_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
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
      build_stages: {
        Row: {
          changed: number
          checked: number
          cursor: string | null
          failed: number
          finished_at: string | null
          last_message: string | null
          stage: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          changed?: number
          checked?: number
          cursor?: string | null
          failed?: number
          finished_at?: string | null
          last_message?: string | null
          stage: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          changed?: number
          checked?: number
          cursor?: string | null
          failed?: number
          finished_at?: string | null
          last_message?: string | null
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "active_universities"
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
      collection_state: {
        Row: {
          auto_advance: boolean
          created_at: string
          current_wave: string | null
          discovery_per_tick: number
          failures: number
          id: string
          is_running: boolean
          last_beat_at: string | null
          last_message: string | null
          links_applied: number
          links_found: number
          players_found: number
          programs_scraped: number
          runner_token: string
          runner_url: string | null
          scrape_per_tick: number
          started_at: string | null
          stop_requested: boolean
          updated_at: string
        }
        Insert: {
          auto_advance?: boolean
          created_at?: string
          current_wave?: string | null
          discovery_per_tick?: number
          failures?: number
          id?: string
          is_running?: boolean
          last_beat_at?: string | null
          last_message?: string | null
          links_applied?: number
          links_found?: number
          players_found?: number
          programs_scraped?: number
          runner_token?: string
          runner_url?: string | null
          scrape_per_tick?: number
          started_at?: string | null
          stop_requested?: boolean
          updated_at?: string
        }
        Update: {
          auto_advance?: boolean
          created_at?: string
          current_wave?: string | null
          discovery_per_tick?: number
          failures?: number
          id?: string
          is_running?: boolean
          last_beat_at?: string | null
          last_message?: string | null
          links_applied?: number
          links_found?: number
          players_found?: number
          programs_scraped?: number
          runner_token?: string
          runner_url?: string | null
          scrape_per_tick?: number
          started_at?: string | null
          stop_requested?: boolean
          updated_at?: string
        }
        Relationships: []
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
      federal_directory: {
        Row: {
          alias: string | null
          city: string | null
          enrollment: number | null
          main_campus: boolean | null
          name: string
          state: string | null
          two_year: boolean | null
          unitid: number
          updated_at: string
          website: string | null
        }
        Insert: {
          alias?: string | null
          city?: string | null
          enrollment?: number | null
          main_campus?: boolean | null
          name: string
          state?: string | null
          two_year?: boolean | null
          unitid: number
          updated_at?: string
          website?: string | null
        }
        Update: {
          alias?: string | null
          city?: string | null
          enrollment?: number | null
          main_campus?: boolean | null
          name?: string
          state?: string | null
          two_year?: boolean | null
          unitid?: number
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      federal_id_campus_registry: {
        Row: {
          approved_by: string | null
          campus_name: string
          created_at: string
          id: string
          ipeds_unitid: number
          note: string | null
        }
        Insert: {
          approved_by?: string | null
          campus_name: string
          created_at?: string
          id?: string
          ipeds_unitid: number
          note?: string | null
        }
        Update: {
          approved_by?: string | null
          campus_name?: string
          created_at?: string
          id?: string
          ipeds_unitid?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "federal_id_campus_registry_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      host_protection: {
        Row: {
          detections: number
          evidence: string | null
          first_detected_at: string
          host: string
          last_confirmed_at: string
          last_probe_at: string | null
          lifted_at: string | null
          probe_status: string | null
          protection_kind: string
          updated_at: string
        }
        Insert: {
          detections?: number
          evidence?: string | null
          first_detected_at?: string
          host: string
          last_confirmed_at?: string
          last_probe_at?: string | null
          lifted_at?: string | null
          probe_status?: string | null
          protection_kind: string
          updated_at?: string
        }
        Update: {
          detections?: number
          evidence?: string | null
          first_detected_at?: string
          host?: string
          last_confirmed_at?: string
          last_probe_at?: string | null
          lifted_at?: string | null
          probe_status?: string | null
          protection_kind?: string
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "active_universities"
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
      link_clear_archive: {
        Row: {
          created_at: string
          determination: string | null
          evidence: string | null
          field: string
          group_id: string | null
          id: string
          prior_value: string
          program_id: string
          restored_at: string | null
          run_id: string
          shared_address: string | null
          university_id: string | null
        }
        Insert: {
          created_at?: string
          determination?: string | null
          evidence?: string | null
          field: string
          group_id?: string | null
          id?: string
          prior_value: string
          program_id: string
          restored_at?: string | null
          run_id: string
          shared_address?: string | null
          university_id?: string | null
        }
        Update: {
          created_at?: string
          determination?: string | null
          evidence?: string | null
          field?: string
          group_id?: string | null
          id?: string
          prior_value?: string
          program_id?: string
          restored_at?: string | null
          run_id?: string
          shared_address?: string | null
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clear_archive_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clear_archive_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clear_archive_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      link_conflicts: {
        Row: {
          attempted_url: string
          created_at: string
          detail: string | null
          field: string
          holder_program_id: string | null
          holder_university_id: string | null
          id: string
          normalized_key: string
          program_id: string | null
          status: string
          university_id: string | null
          updated_at: string
        }
        Insert: {
          attempted_url: string
          created_at?: string
          detail?: string | null
          field: string
          holder_program_id?: string | null
          holder_university_id?: string | null
          id?: string
          normalized_key: string
          program_id?: string | null
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          attempted_url?: string
          created_at?: string
          detail?: string | null
          field?: string
          holder_program_id?: string | null
          holder_university_id?: string | null
          id?: string
          normalized_key?: string
          program_id?: string | null
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_conflicts_holder_program_id_fkey"
            columns: ["holder_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_conflicts_holder_university_id_fkey"
            columns: ["holder_university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_conflicts_holder_university_id_fkey"
            columns: ["holder_university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_conflicts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_conflicts_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_conflicts_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      link_health: {
        Row: {
          consecutive_failures: number
          created_at: string
          failure_dates: string[]
          fetch_method: Database["public"]["Enums"]["fetch_method"] | null
          field: string
          id: string
          last_error: string | null
          last_failure_category:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          last_verified_ok_at: string | null
          link_status: Database["public"]["Enums"]["link_health_status"]
          not_found_runs: number
          program_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          failure_dates?: string[]
          fetch_method?: Database["public"]["Enums"]["fetch_method"] | null
          field: string
          id?: string
          last_error?: string | null
          last_failure_category?:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          last_verified_ok_at?: string | null
          link_status?: Database["public"]["Enums"]["link_health_status"]
          not_found_runs?: number
          program_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          failure_dates?: string[]
          fetch_method?: Database["public"]["Enums"]["fetch_method"] | null
          field?: string
          id?: string
          last_error?: string | null
          last_failure_category?:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          last_verified_ok_at?: string | null
          link_status?: Database["public"]["Enums"]["link_health_status"]
          not_found_runs?: number
          program_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_health_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      link_platform_hosts: {
        Row: {
          created_at: string
          host: string
          note: string | null
        }
        Insert: {
          created_at?: string
          host: string
          note?: string | null
        }
        Update: {
          created_at?: string
          host?: string
          note?: string | null
        }
        Relationships: []
      }
      majors: {
        Row: {
          category: string | null
          cip_code: string | null
          cip_family: string | null
          id: string
          name: string
          source: string
        }
        Insert: {
          category?: string | null
          cip_code?: string | null
          cip_family?: string | null
          id?: string
          name: string
          source?: string
        }
        Update: {
          category?: string | null
          cip_code?: string | null
          cip_family?: string | null
          id?: string
          name?: string
          source?: string
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
      pending_data_changes_archive: {
        Row: {
          ai_confidence: number | null
          archived_at: string
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
        }
        Insert: {
          ai_confidence?: number | null
          archived_at?: string
          created_at?: string
          decided_via?: string
          field_name?: string | null
          id: string
          original_value?: Json | null
          proposed_value: Json
          record_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          status: Database["public"]["Enums"]["pending_change_status"]
          table_name: string
        }
        Update: {
          ai_confidence?: number | null
          archived_at?: string
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
        }
        Relationships: []
      }
      program_level_archive: {
        Row: {
          created_at: string
          field: string
          id: string
          new_value: string | null
          prior_value: string | null
          program_id: string
          reason: string | null
          restored_at: string | null
          run_id: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          prior_value?: string | null
          program_id: string
          reason?: string | null
          restored_at?: string | null
          run_id: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          prior_value?: string | null
          program_id?: string
          reason?: string | null
          restored_at?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_level_archive_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
      program_schools: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          program_id: string
          university_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          program_id: string
          university_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          program_id?: string
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_schools_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_schools_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_schools_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          athletic_website: string | null
          coach_extracted_at: string | null
          coach_ingest_run_id: string | null
          coach_source_domain: string | null
          coach_source_url: string | null
          coaching_staff_url: string | null
          conference: string | null
          conference_source: string | null
          conference_verification: Database["public"]["Enums"]["value_verification"]
          conference_verified_at: string | null
          created_at: string
          division: string | null
          division_source: string | null
          division_verification: Database["public"]["Enums"]["value_verification"]
          division_verified_at: string | null
          facility_url: string | null
          governing_body: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name: string | null
          id: string
          last_roster_pull_at: string | null
          last_verified_at: string | null
          link_evidence: Json | null
          offering_evidence: Json | null
          offering_source: string | null
          offering_status: Database["public"]["Enums"]["program_offering_status"]
          offering_verified_at: string | null
          recruiting_coordinator_name: string | null
          roster_refresh_due_at: string | null
          roster_url: string | null
          scholarship_details: string | null
          scholarships_available: boolean | null
          sponsorship_checked_at: string | null
          sport: Database["public"]["Enums"]["sport"]
          university_id: string
          updated_at: string
        }
        Insert: {
          athletic_website?: string | null
          coach_extracted_at?: string | null
          coach_ingest_run_id?: string | null
          coach_source_domain?: string | null
          coach_source_url?: string | null
          coaching_staff_url?: string | null
          conference?: string | null
          conference_source?: string | null
          conference_verification?: Database["public"]["Enums"]["value_verification"]
          conference_verified_at?: string | null
          created_at?: string
          division?: string | null
          division_source?: string | null
          division_verification?: Database["public"]["Enums"]["value_verification"]
          division_verified_at?: string | null
          facility_url?: string | null
          governing_body?: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name?: string | null
          id?: string
          last_roster_pull_at?: string | null
          last_verified_at?: string | null
          link_evidence?: Json | null
          offering_evidence?: Json | null
          offering_source?: string | null
          offering_status?: Database["public"]["Enums"]["program_offering_status"]
          offering_verified_at?: string | null
          recruiting_coordinator_name?: string | null
          roster_refresh_due_at?: string | null
          roster_url?: string | null
          scholarship_details?: string | null
          scholarships_available?: boolean | null
          sponsorship_checked_at?: string | null
          sport: Database["public"]["Enums"]["sport"]
          university_id: string
          updated_at?: string
        }
        Update: {
          athletic_website?: string | null
          coach_extracted_at?: string | null
          coach_ingest_run_id?: string | null
          coach_source_domain?: string | null
          coach_source_url?: string | null
          coaching_staff_url?: string | null
          conference?: string | null
          conference_source?: string | null
          conference_verification?: Database["public"]["Enums"]["value_verification"]
          conference_verified_at?: string | null
          created_at?: string
          division?: string | null
          division_source?: string | null
          division_verification?: Database["public"]["Enums"]["value_verification"]
          division_verified_at?: string | null
          facility_url?: string | null
          governing_body?: Database["public"]["Enums"]["governing_body"] | null
          head_coach_name?: string | null
          id?: string
          last_roster_pull_at?: string | null
          last_verified_at?: string | null
          link_evidence?: Json | null
          offering_evidence?: Json | null
          offering_source?: string | null
          offering_status?: Database["public"]["Enums"]["program_offering_status"]
          offering_verified_at?: string | null
          recruiting_coordinator_name?: string | null
          roster_refresh_due_at?: string | null
          roster_url?: string | null
          scholarship_details?: string | null
          scholarships_available?: boolean | null
          sponsorship_checked_at?: string | null
          sport?: Database["public"]["Enums"]["sport"]
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
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
      rejected_values: {
        Row: {
          created_at: string
          created_by: string | null
          field_name: string
          id: string
          normalized_value: string
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_name: string
          id?: string
          normalized_value: string
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_name?: string
          id?: string
          normalized_value?: string
          reason?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejected_values_created_by_fkey"
            columns: ["created_by"]
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
          extracted_at: string | null
          home_country: string | null
          home_state: string | null
          hometown: string | null
          id: string
          ingest_run_id: string | null
          is_juco_transfer: boolean
          is_transfer: boolean
          name: string
          position: Database["public"]["Enums"]["player_position"] | null
          program_id: string
          provenance: string
          reader: string | null
          season_label: string | null
          season_year: number | null
          source_domain: string | null
          source_url: string | null
          sport_specific_attributes: Json | null
          throws: Database["public"]["Enums"]["throws_hand"] | null
          two_way: boolean
        }
        Insert: {
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          class_year?: Database["public"]["Enums"]["class_year"] | null
          created_at?: string
          extracted_at?: string | null
          home_country?: string | null
          home_state?: string | null
          hometown?: string | null
          id?: string
          ingest_run_id?: string | null
          is_juco_transfer?: boolean
          is_transfer?: boolean
          name: string
          position?: Database["public"]["Enums"]["player_position"] | null
          program_id: string
          provenance?: string
          reader?: string | null
          season_label?: string | null
          season_year?: number | null
          source_domain?: string | null
          source_url?: string | null
          sport_specific_attributes?: Json | null
          throws?: Database["public"]["Enums"]["throws_hand"] | null
          two_way?: boolean
        }
        Update: {
          bats?: Database["public"]["Enums"]["bats_hand"] | null
          class_year?: Database["public"]["Enums"]["class_year"] | null
          created_at?: string
          extracted_at?: string | null
          home_country?: string | null
          home_state?: string | null
          hometown?: string | null
          id?: string
          ingest_run_id?: string | null
          is_juco_transfer?: boolean
          is_transfer?: boolean
          name?: string
          position?: Database["public"]["Enums"]["player_position"] | null
          program_id?: string
          provenance?: string
          reader?: string | null
          season_label?: string | null
          season_year?: number | null
          source_domain?: string | null
          source_url?: string | null
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
          ingest_run_id: string | null
          juco_transfer_count: number
          position_counts: Json
          program_id: string
          pulled_at: string
          reader: string | null
          season_year: number | null
          source_domain: string | null
          source_url: string | null
          suspect: boolean
          suspect_reason: string | null
          transfer_count: number
        }
        Insert: {
          class_year_counts?: Json
          created_at?: string
          id?: string
          ingest_run_id?: string | null
          juco_transfer_count?: number
          position_counts?: Json
          program_id: string
          pulled_at?: string
          reader?: string | null
          season_year?: number | null
          source_domain?: string | null
          source_url?: string | null
          suspect?: boolean
          suspect_reason?: string | null
          transfer_count?: number
        }
        Update: {
          class_year_counts?: Json
          created_at?: string
          id?: string
          ingest_run_id?: string | null
          juco_transfer_count?: number
          position_counts?: Json
          program_id?: string
          pulled_at?: string
          reader?: string | null
          season_year?: number | null
          source_domain?: string | null
          source_url?: string | null
          suspect?: boolean
          suspect_reason?: string | null
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
      roster_write_refusals: {
        Row: {
          created_at: string
          holder_detail: string | null
          holder_university_id: string | null
          id: string
          kind: string
          program_id: string | null
          reason: string
          rows_refused: number
          source_domain: string | null
          source_url: string
          status: string
          university_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          holder_detail?: string | null
          holder_university_id?: string | null
          id?: string
          kind: string
          program_id?: string | null
          reason: string
          rows_refused?: number
          source_domain?: string | null
          source_url: string
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          holder_detail?: string | null
          holder_university_id?: string | null
          id?: string
          kind?: string
          program_id?: string | null
          reason?: string
          rows_refused?: number
          source_domain?: string | null
          source_url?: string
          status?: string
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_write_refusals_holder_university_id_fkey"
            columns: ["holder_university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_write_refusals_holder_university_id_fkey"
            columns: ["holder_university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_write_refusals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_write_refusals_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_write_refusals_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
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
      sweep_runs: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          label: string | null
          last_host: string | null
          last_message: string | null
          run_key: string
          started_at: string | null
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          label?: string | null
          last_host?: string | null
          last_message?: string | null
          run_key: string
          started_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          label?: string | null
          last_host?: string | null
          last_message?: string | null
          run_key?: string
          started_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sweep_targets: {
        Row: {
          checked_at: string | null
          created_at: string
          detail: string | null
          field: string
          host: string
          id: string
          outcome: string | null
          program_id: string
          run_key: string
          status: string
          university_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          detail?: string | null
          field: string
          host: string
          id?: string
          outcome?: string | null
          program_id: string
          run_key: string
          status?: string
          university_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          detail?: string | null
          field?: string
          host?: string
          id?: string
          outcome?: string | null
          program_id?: string
          run_key?: string
          status?: string
          university_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sweep_targets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sweep_targets_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sweep_targets_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
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
          act_25: number | null
          act_75: number | null
          act_test_takers: number | null
          address: string | null
          admissions_url: string | null
          avg_act: number | null
          avg_gpa: number | null
          avg_sat: number | null
          campus_name: string | null
          campus_setting: Database["public"]["Enums"]["campus_setting"] | null
          city: string | null
          created_at: string
          distance_to_airport_miles: number | null
          est_cost_of_attendance: number | null
          est_net_price: number | null
          facts_refresh_due_at: string | null
          federal_match_name: string | null
          federal_match_status: string
          federal_synced_at: string | null
          financial_aid_url: string | null
          graduation_rate: number | null
          id: string
          identity_basis: Database["public"]["Enums"]["school_identity_basis"]
          identity_note: string | null
          ipeds_unitid: number | null
          name: string
          nearest_airport: string | null
          public_private: Database["public"]["Enums"]["public_private"] | null
          region: string | null
          religious_affiliation: boolean
          religious_tradition: string | null
          retired_at: string | null
          retired_reason: string | null
          retirement_run_id: string | null
          room_board: number | null
          sat_math_25: number | null
          sat_math_75: number | null
          sat_reading_25: number | null
          sat_reading_75: number | null
          sat_test_takers: number | null
          sat_total_25: number | null
          sat_total_75: number | null
          school_size_bucket:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state: string | null
          student_faculty_ratio: string | null
          test_optional: boolean | null
          test_scores_source_url: string | null
          test_scores_synced_at: string | null
          tuition_in_state: number | null
          tuition_out_state: number | null
          tuition_source_url: string | null
          undergrad_enrollment: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          acceptance_rate?: number | null
          act_25?: number | null
          act_75?: number | null
          act_test_takers?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_name?: string | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          facts_refresh_due_at?: string | null
          federal_match_name?: string | null
          federal_match_status?: string
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          identity_basis?: Database["public"]["Enums"]["school_identity_basis"]
          identity_note?: string | null
          ipeds_unitid?: number | null
          name: string
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean
          religious_tradition?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          retirement_run_id?: string | null
          room_board?: number | null
          sat_math_25?: number | null
          sat_math_75?: number | null
          sat_reading_25?: number | null
          sat_reading_75?: number | null
          sat_test_takers?: number | null
          sat_total_25?: number | null
          sat_total_75?: number | null
          school_size_bucket?:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state?: string | null
          student_faculty_ratio?: string | null
          test_optional?: boolean | null
          test_scores_source_url?: string | null
          test_scores_synced_at?: string | null
          tuition_in_state?: number | null
          tuition_out_state?: number | null
          tuition_source_url?: string | null
          undergrad_enrollment?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          acceptance_rate?: number | null
          act_25?: number | null
          act_75?: number | null
          act_test_takers?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_name?: string | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          facts_refresh_due_at?: string | null
          federal_match_name?: string | null
          federal_match_status?: string
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string
          identity_basis?: Database["public"]["Enums"]["school_identity_basis"]
          identity_note?: string | null
          ipeds_unitid?: number | null
          name?: string
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean
          religious_tradition?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          retirement_run_id?: string | null
          room_board?: number | null
          sat_math_25?: number | null
          sat_math_75?: number | null
          sat_reading_25?: number | null
          sat_reading_75?: number | null
          sat_test_takers?: number | null
          sat_total_25?: number | null
          sat_total_75?: number | null
          school_size_bucket?:
            | Database["public"]["Enums"]["school_size_bucket"]
            | null
          state?: string | null
          student_faculty_ratio?: string | null
          test_optional?: boolean | null
          test_scores_source_url?: string | null
          test_scores_synced_at?: string | null
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
          award_levels: string | null
          completions: number | null
          major_id: string
          source: string
          synced_at: string | null
          university_id: string
        }
        Insert: {
          award_levels?: string | null
          completions?: number | null
          major_id: string
          source?: string
          synced_at?: string | null
          university_id: string
        }
        Update: {
          award_levels?: string | null
          completions?: number | null
          major_id?: string
          source?: string
          synced_at?: string | null
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
            referencedRelation: "active_universities"
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
      university_website_archive: {
        Row: {
          created_at: string
          id: string
          new_value: string
          note: string | null
          prior_value: string | null
          restored_at: string | null
          run_id: string
          university_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_value: string
          note?: string | null
          prior_value?: string | null
          restored_at?: string | null
          run_id: string
          university_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_value?: string
          note?: string | null
          prior_value?: string | null
          restored_at?: string | null
          run_id?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_website_archive_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_website_archive_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      unreadable_pages: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          failure_category:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          field: string
          first_seen_at: string
          id: string
          last_seen_at: string
          program_id: string | null
          resolved_at: string | null
          university_id: string | null
          updated_at: string
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          failure_category?:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          field: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          program_id?: string | null
          resolved_at?: string | null
          university_id?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          failure_category?:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          field?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          program_id?: string | null
          resolved_at?: string | null
          university_id?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "unreadable_pages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unreadable_pages_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "active_universities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unreadable_pages_university_id_fkey"
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
          match_evidence: Json | null
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
          match_evidence?: Json | null
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
          match_evidence?: Json | null
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
            referencedRelation: "active_universities"
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
      active_universities: {
        Row: {
          acceptance_rate: number | null
          address: string | null
          admissions_url: string | null
          avg_act: number | null
          avg_gpa: number | null
          avg_sat: number | null
          campus_name: string | null
          campus_setting: Database["public"]["Enums"]["campus_setting"] | null
          city: string | null
          created_at: string | null
          distance_to_airport_miles: number | null
          est_cost_of_attendance: number | null
          est_net_price: number | null
          facts_refresh_due_at: string | null
          federal_match_name: string | null
          federal_match_status: string | null
          federal_synced_at: string | null
          financial_aid_url: string | null
          graduation_rate: number | null
          id: string | null
          identity_basis:
            | Database["public"]["Enums"]["school_identity_basis"]
            | null
          identity_note: string | null
          ipeds_unitid: number | null
          name: string | null
          nearest_airport: string | null
          public_private: Database["public"]["Enums"]["public_private"] | null
          region: string | null
          religious_affiliation: boolean | null
          religious_tradition: string | null
          retired_at: string | null
          retired_reason: string | null
          retirement_run_id: string | null
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
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          acceptance_rate?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_name?: string | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string | null
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          facts_refresh_due_at?: string | null
          federal_match_name?: string | null
          federal_match_status?: string | null
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string | null
          identity_basis?:
            | Database["public"]["Enums"]["school_identity_basis"]
            | null
          identity_note?: string | null
          ipeds_unitid?: number | null
          name?: string | null
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean | null
          religious_tradition?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          retirement_run_id?: string | null
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
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          acceptance_rate?: number | null
          address?: string | null
          admissions_url?: string | null
          avg_act?: number | null
          avg_gpa?: number | null
          avg_sat?: number | null
          campus_name?: string | null
          campus_setting?: Database["public"]["Enums"]["campus_setting"] | null
          city?: string | null
          created_at?: string | null
          distance_to_airport_miles?: number | null
          est_cost_of_attendance?: number | null
          est_net_price?: number | null
          facts_refresh_due_at?: string | null
          federal_match_name?: string | null
          federal_match_status?: string | null
          federal_synced_at?: string | null
          financial_aid_url?: string | null
          graduation_rate?: number | null
          id?: string | null
          identity_basis?:
            | Database["public"]["Enums"]["school_identity_basis"]
            | null
          identity_note?: string | null
          ipeds_unitid?: number | null
          name?: string | null
          nearest_airport?: string | null
          public_private?: Database["public"]["Enums"]["public_private"] | null
          region?: string | null
          religious_affiliation?: boolean | null
          religious_tradition?: string | null
          retired_at?: string | null
          retired_reason?: string | null
          retirement_run_id?: string | null
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
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      link_verification_state: {
        Row: {
          conflicted: boolean | null
          field: string | null
          host: string | null
          host_protected: boolean | null
          last_failure_category:
            | Database["public"]["Enums"]["page_failure_category"]
            | null
          last_verified_ok_at: string | null
          link_status: Database["public"]["Enums"]["link_health_status"] | null
          program_id: string | null
          sport: string | null
          state_detail: string | null
          university_id: string | null
          url: string | null
          verification_state: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      active_season_id: { Args: never; Returns: string }
      can_access_athlete: { Args: { _athlete_id: string }; Returns: boolean }
      coaches_team: { Args: { _team_id: string }; Returns: boolean }
      collection_cron_start: { Args: never; Returns: undefined }
      collection_cron_stop: { Args: never; Returns: undefined }
      collection_cron_unschedule: { Args: never; Returns: undefined }
      collection_watchdog: { Args: never; Returns: Json }
      current_org_id: { Args: never; Returns: string }
      enqueue_due_refreshes: {
        Args: { _program_limit?: number; _school_limit?: number }
        Returns: {
          programs_queued: number
          schools_queued: number
        }[]
      }
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
      is_platform_host: { Args: { _host: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      link_host: { Args: { _url: string }; Returns: string }
      link_host_only: { Args: { _url: string }; Returns: string }
      link_key: { Args: { _url: string }; Returns: string }
      pages_check_on: { Args: never; Returns: boolean }
      program_roster_summary: {
        Args: { _program_id: string }
        Returns: {
          roster_size: number
          season_year: number
        }[]
      }
      reclaim_stale_leases: { Args: { _minutes?: number }; Returns: number }
      roster_size_groups: {
        Args: { _max?: number; _min?: number }
        Returns: {
          player_count: number
          program_id: string
          season_year: number
        }[]
      }
      trigger_collection_runner: { Args: never; Returns: undefined }
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
      fetch_method: "direct" | "rendered"
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
      link_health_status: "verified" | "unverified" | "dead"
      page_failure_category:
        | "timeout"
        | "connection_blocked"
        | "http_error"
        | "empty_content"
        | "not_found"
        | "blocked_by_host"
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
        | "MIF"
        | "CIF"
      program_offering_status: "unverified" | "verified" | "not_offered"
      public_private: "public" | "private"
      saved_school_status:
        | "researching"
        | "contacted"
        | "offered"
        | "committed"
        | "eliminated"
      school_identity_basis:
        | "federal_id"
        | "campus_of_federal_id"
        | "governing_body"
        | "unidentified"
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
      value_verification: "unverified" | "verified"
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
      fetch_method: ["direct", "rendered"],
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
      link_health_status: ["verified", "unverified", "dead"],
      page_failure_category: [
        "timeout",
        "connection_blocked",
        "http_error",
        "empty_content",
        "not_found",
        "blocked_by_host",
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
        "MIF",
        "CIF",
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
      school_identity_basis: [
        "federal_id",
        "campus_of_federal_id",
        "governing_body",
        "unidentified",
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
      value_verification: ["unverified", "verified"],
    },
  },
} as const
