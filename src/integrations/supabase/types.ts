export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          archived: boolean;
          created_at: string;
          id: string;
          last_message_at: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          id?: string;
          last_message_at?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_daily_usage: {
        Row: {
          day: string;
          requests_used: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          day: string;
          requests_used?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          day?: string;
          requests_used?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_quota_settings: {
        Row: {
          key: string;
          updated_at: string;
          value_int: number;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value_int: number;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value_int?: number;
        };
        Relationships: [];
      };
      discount_codes: {
        Row: {
          applicable_billing_interval: string | null;
          applicable_plan_code: string | null;
          code: string;
          created_at: string;
          description: string | null;
          duration_months: number | null;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          max_redemptions: number | null;
          percent_off: number;
          starts_at: string | null;
          updated_at: string;
        };
        Insert: {
          applicable_billing_interval?: string | null;
          applicable_plan_code?: string | null;
          code: string;
          created_at?: string;
          description?: string | null;
          duration_months?: number | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          percent_off: number;
          starts_at?: string | null;
          updated_at?: string;
        };
        Update: {
          applicable_billing_interval?: string | null;
          applicable_plan_code?: string | null;
          code?: string;
          created_at?: string;
          description?: string | null;
          duration_months?: number | null;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_redemptions?: number | null;
          percent_off?: number;
          starts_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      discount_redemptions: {
        Row: {
          created_at: string;
          discount_code_id: string;
          duration_months: number | null;
          ends_at: string | null;
          id: string;
          percent_off: number;
          starts_at: string;
          subscription_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          discount_code_id: string;
          duration_months?: number | null;
          ends_at?: string | null;
          id?: string;
          percent_off: number;
          starts_at?: string;
          subscription_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          discount_code_id?: string;
          duration_months?: number | null;
          ends_at?: string | null;
          id?: string;
          percent_off?: number;
          starts_at?: string;
          subscription_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: number;
          role: string;
          user_id: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: number;
          role: string;
          user_id: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: number;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      opposition_topics: {
        Row: {
          created_at: string;
          id: number;
          opposition_id: string;
          order_index: number;
          topic_code: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          opposition_id: string;
          order_index?: number;
          topic_code: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          opposition_id?: string;
          order_index?: number;
          topic_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      opposition_subtopics: {
        Row: {
          created_at: string;
          id: number;
          opposition_topic_id: number;
          order_index: number;
          subtopic_code: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          opposition_topic_id: number;
          order_index?: number;
          subtopic_code: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          opposition_topic_id?: number;
          order_index?: number;
          subtopic_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      oppositions: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          age: number | null;
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          first_name: string | null;
          full_name: string | null;
          last_name: string | null;
          locale: string;
          main_challenge: string | null;
          preferred_opposition: string | null;
          preferred_opposition_id: string | null;
          tests_per_week: number | null;
          updated_at: string;
          user_id: string;
          weekly_target_hours: number;
          years_preparing: number | null;
        };
        Insert: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          last_name?: string | null;
          locale?: string;
          main_challenge?: string | null;
          preferred_opposition?: string | null;
          preferred_opposition_id?: string | null;
          tests_per_week?: number | null;
          updated_at?: string;
          user_id: string;
          weekly_target_hours?: number;
          years_preparing?: number | null;
        };
        Update: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          first_name?: string | null;
          full_name?: string | null;
          last_name?: string | null;
          locale?: string;
          main_challenge?: string | null;
          preferred_opposition?: string | null;
          preferred_opposition_id?: string | null;
          tests_per_week?: number | null;
          updated_at?: string;
          user_id?: string;
          weekly_target_hours?: number;
          years_preparing?: number | null;
        };
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          ai_daily_limit: number;
          billing_interval: string;
          code: string;
          created_at: string;
          currency: string;
          description: string | null;
          is_active: boolean;
          is_default: boolean;
          is_public: boolean;
          name: string;
          price_cents: number;
          quick_test_question_limit: number;
          sort_order: number;
          tier: string;
          updated_at: string;
        };
        Insert: {
          ai_daily_limit: number;
          billing_interval: string;
          code: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          is_public?: boolean;
          name: string;
          price_cents: number;
          quick_test_question_limit: number;
          sort_order?: number;
          tier: string;
          updated_at?: string;
        };
        Update: {
          ai_daily_limit?: number;
          billing_interval?: string;
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          is_active?: boolean;
          is_default?: boolean;
          is_public?: boolean;
          name?: string;
          price_cents?: number;
          quick_test_question_limit?: number;
          sort_order?: number;
          tier?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_subscriptions: {
        Row: {
          billing_interval: string;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          ended_at: string | null;
          id: string;
          metadata: Json;
          plan_code: string;
          provider: string;
          provider_reference: string | null;
          selected_at: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          billing_interval: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id?: string;
          metadata?: Json;
          plan_code: string;
          provider?: string;
          provider_reference?: string | null;
          selected_at?: string;
          status: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          billing_interval?: string;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          ended_at?: string | null;
          id?: string;
          metadata?: Json;
          plan_code?: string;
          provider?: string;
          provider_reference?: string | null;
          selected_at?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quick_test_attempts: {
        Row: {
          active_question_id: string | null;
          finished_at: string | null;
          id: number;
          last_interaction_at: string;
          selected_answers: Json;
          started_at: string;
          test_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_question_id?: string | null;
          finished_at?: string | null;
          id?: number;
          last_interaction_at?: string;
          selected_answers?: Json;
          started_at?: string;
          test_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_question_id?: string | null;
          finished_at?: string | null;
          id?: number;
          last_interaction_at?: string;
          selected_answers?: Json;
          started_at?: string;
          test_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quick_tests: {
        Row: {
          created_at: string;
          id: string;
          opposition_id: string | null;
          opposition_name: string;
          question_count: number;
          questions: Json;
          selected_topics: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          opposition_id?: string | null;
          opposition_name: string;
          question_count: number;
          questions?: Json;
          selected_topics?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          opposition_id?: string | null;
          opposition_name?: string;
          question_count?: number;
          questions?: Json;
          selected_topics?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_discount_code: {
        Args: {
          p_code: string;
          p_tz?: string;
        };
        Returns: {
          ai_daily_limit: number;
          ai_remaining: number;
          ai_used: number;
          billing_interval: string;
          cancel_at_period_end: boolean;
          currency: string;
          current_period_end: string;
          day: string;
          discount_code: string;
          discount_ends_at: string;
          discount_percent: number;
          effective_price_cents: number;
          is_paid: boolean;
          plan_code: string;
          plan_name: string;
          price_cents: number;
          quick_test_question_limit: number;
          subscription_status: string;
          tier: string;
        }[];
      };
      change_user_subscription_plan: {
        Args: {
          p_plan_code: string;
          p_tz?: string;
        };
        Returns: {
          ai_daily_limit: number;
          ai_remaining: number;
          ai_used: number;
          billing_interval: string;
          cancel_at_period_end: boolean;
          currency: string;
          current_period_end: string;
          day: string;
          discount_code: string;
          discount_ends_at: string;
          discount_percent: number;
          effective_price_cents: number;
          is_paid: boolean;
          plan_code: string;
          plan_name: string;
          price_cents: number;
          quick_test_question_limit: number;
          subscription_status: string;
          tier: string;
        }[];
      };
      consume_ai_daily_quota: {
        Args: {
          p_limit?: number | null;
          p_tz?: string;
          p_user_id: string;
        };
        Returns: {
          allowed: boolean;
          day: string;
          limit: number;
          remaining: number;
          used: number;
        }[];
      };
      get_ai_daily_limit: {
        Args: {
          p_user_id: string;
        };
        Returns: number;
      };
      get_ai_daily_quota: {
        Args: {
          p_tz?: string;
          p_user_id: string;
        };
        Returns: {
          day: string;
          is_paid: boolean;
          limit: number;
          remaining: number;
          used: number;
        }[];
      };
      get_quick_test_question_limit: {
        Args: {
          p_user_id: string;
        };
        Returns: number;
      };
      get_user_plan_state: {
        Args: {
          p_tz?: string;
          p_user_id: string;
        };
        Returns: {
          ai_daily_limit: number;
          ai_remaining: number;
          ai_used: number;
          billing_interval: string;
          cancel_at_period_end: boolean;
          currency: string;
          current_period_end: string;
          day: string;
          discount_code: string;
          discount_ends_at: string;
          discount_percent: number;
          effective_price_cents: number;
          is_paid: boolean;
          plan_code: string;
          plan_name: string;
          price_cents: number;
          quick_test_question_limit: number;
          subscription_status: string;
          tier: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {}
  }
} as const;
