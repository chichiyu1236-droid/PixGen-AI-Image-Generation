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
          created_at: string;
        };
      };
      credit_events: {
        Row: {
          id: string;
          user_id: string;
          generation_id: string | null;
          type: "signup_bonus" | "generation_charge";
          amount: number;
          reason: string;
          created_at: string;
        };
      };
    };
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
        };
        Returns: Database["public"]["Tables"]["generations"]["Row"];
      };
    };
  };
};
