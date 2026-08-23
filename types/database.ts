export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          credits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          credits?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          user_id: string;
          image_url: string | null;
          storage_path: string | null;
          final_prompt: string;
          input_subject: string;
          input_extra: string | null;
          options_json: Json;
          aspect_ratio: string;
          status: "succeeded" | "failed";
          error_message: string | null;
          feedback: "liked" | "disliked" | null;
          agent_session_id: string | null;
          parent_generation_id: string | null;
          origin: "classic" | "agent" | "agent_edit" | "agent_variant";
          edit_instruction: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url?: string | null;
          storage_path?: string | null;
          final_prompt: string;
          input_subject: string;
          input_extra?: string | null;
          options_json: Json;
          aspect_ratio: string;
          status: "succeeded" | "failed";
          error_message?: string | null;
          feedback?: "liked" | "disliked" | null;
          agent_session_id?: string | null;
          parent_generation_id?: string | null;
          origin?: "classic" | "agent" | "agent_edit" | "agent_variant";
          edit_instruction?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string | null;
          storage_path?: string | null;
          final_prompt?: string;
          input_subject?: string;
          input_extra?: string | null;
          options_json?: Json;
          aspect_ratio?: string;
          status?: "succeeded" | "failed";
          error_message?: string | null;
          feedback?: "liked" | "disliked" | null;
          agent_session_id?: string | null;
          parent_generation_id?: string | null;
          origin?: "classic" | "agent" | "agent_edit" | "agent_variant";
          edit_instruction?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_agent_session_id_fkey";
            columns: ["agent_session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generations_parent_generation_id_fkey";
            columns: ["parent_generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          last_message_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          created_at?: string;
          last_message_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          last_message_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_messages: {
        Row: {
          id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          trace: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: "user" | "assistant";
          content?: string;
          trace?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: "user" | "assistant";
          content?: string;
          trace?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_messages_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_events: {
        Row: {
          id: string;
          user_id: string;
          generation_id: string | null;
          type: "signup_bonus" | "generation_charge" | "purchase" | "admin_adjustment";
          amount: number;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          generation_id?: string | null;
          type: "signup_bonus" | "generation_charge" | "purchase" | "admin_adjustment";
          amount: number;
          reason: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          generation_id?: string | null;
          type?: "signup_bonus" | "generation_charge" | "purchase" | "admin_adjustment";
          amount?: number;
          reason?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_events_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          pack_id: string;
          credits: number;
          amount_fen: number;
          status: "pending" | "paid" | "expired" | "failed" | "flagged";
          channel: "wechat" | "alipay";
          provider: string;
          provider_trade_no: string | null;
          pay_url: string | null;
          raw_notify: Json | null;
          notified_at: string | null;
          last_checked_at: string | null;
          expires_at: string;
          created_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          pack_id: string;
          credits: number;
          amount_fen: number;
          status?: "pending" | "paid" | "expired" | "failed" | "flagged";
          channel: "wechat" | "alipay";
          provider: string;
          provider_trade_no?: string | null;
          pay_url?: string | null;
          raw_notify?: Json | null;
          notified_at?: string | null;
          last_checked_at?: string | null;
          expires_at: string;
          created_at?: string;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          pack_id?: string;
          credits?: number;
          amount_fen?: number;
          status?: "pending" | "paid" | "expired" | "failed" | "flagged";
          channel?: "wechat" | "alipay";
          provider?: string;
          provider_trade_no?: string | null;
          pay_url?: string | null;
          raw_notify?: Json | null;
          notified_at?: string | null;
          last_checked_at?: string | null;
          expires_at?: string;
          created_at?: string;
          paid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_successful_generation: {
        Args: {
          p_user_id: string;
          p_image_url: string;
          p_storage_path: string;
          p_final_prompt: string;
          p_input_subject: string;
          p_input_extra: string;
          p_options_json: Json;
          p_aspect_ratio: string;
          p_agent_session_id?: string;
          p_parent_generation_id?: string;
          p_origin?: string;
          p_edit_instruction?: string;
        };
        Returns: Database["public"]["Tables"]["generations"]["Row"];
      };
      fulfill_order: {
        Args: {
          p_order_id: string;
          p_provider_trade_no: string;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      adjust_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_type: string;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
