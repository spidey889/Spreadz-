export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          uuid: string
          display_name: string | null
          username: string | null
          college: string | null
          avatar_url: string | null
          messages_sent: number | null
          came_back: number | null
          created_at?: string | null
        }
        Insert: {
          uuid: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          avatar_url?: string | null
          messages_sent?: number | null
          came_back?: number | null
          created_at?: string | null
        }
        Update: {
          uuid?: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          avatar_url?: string | null
          messages_sent?: number | null
          came_back?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      friends: {
        Row: {
          id: string
          requester_uuid: string
          addressee_uuid: string
          sender_name: string | null
          status: Database['public']['Enums']['friend_status'] | null
          created_at?: string | null
        }
        Insert: {
          id?: string
          requester_uuid: string
          addressee_uuid: string
          sender_name?: string | null
          status?: Database['public']['Enums']['friend_status'] | null
          created_at?: string | null
        }
        Update: {
          id?: string
          requester_uuid?: string
          addressee_uuid?: string
          sender_name?: string | null
          status?: Database['public']['Enums']['friend_status'] | null
          created_at?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          rating: number
          reason: string | null
          other_text: string | null
          user_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rating: number
          reason?: string | null
          other_text?: string | null
          user_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rating?: number
          reason?: string | null
          other_text?: string | null
          user_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          content: string
          created_at: string
          display_name: string | null
          college: string | null
          room_name: string | null
          room_id: string | null
          user_uuid: string | null
        }
        Insert: {
          content: string
          created_at?: string
          display_name?: string | null
          college?: string | null
          room_name?: string | null
          room_id?: string | null
          user_uuid?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          display_name?: string | null
          college?: string | null
          room_name?: string | null
          room_id?: string | null
          user_uuid?: string | null
        }
        Relationships: []
      }
      mutes: {
        Row: {
          id: string
          muter_id: string
          muted_id: string
          created_at: string
        }
        Insert: {
          id?: string
          muter_id: string
          muted_id: string
          created_at?: string
        }
        Update: {
          id?: string
          muter_id?: string
          muted_id?: string
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_uuid: string | null
          endpoint: string | null
          subscription: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          id?: string
          user_uuid?: string | null
          endpoint?: string | null
          subscription?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_uuid?: string | null
          endpoint?: string | null
          subscription?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reporter_username: string | null
          reported_username: string | null
          content: string | null
          room_name: string | null
          room_id: string | null
          created_at: string | null
        }
        Insert: {
          reporter_username?: string | null
          reported_username?: string | null
          content?: string | null
          room_name?: string | null
          room_id?: string | null
          created_at?: string | null
        }
        Update: {
          reporter_username?: string | null
          reported_username?: string | null
          content?: string | null
          room_name?: string | null
          room_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          id: string
          headline: string
          created_at: string
          message_count: number | null
          user_count: number | null
          total_seconds_spent: number | null
          time_spent_minutes: number | null
        }
        Insert: {
          id?: string
          headline: string
          created_at?: string
          message_count?: number | null
          user_count?: number | null
          total_seconds_spent?: number | null
          time_spent_minutes?: number | null
        }
        Update: {
          id?: string
          headline?: string
          created_at?: string
          message_count?: number | null
          user_count?: number | null
          total_seconds_spent?: number | null
          time_spent_minutes?: number | null
        }
        Relationships: []
      }
      user_behaviour: {
        Row: {
          id: string
          username: string
          room_name: string
          messages_sent: number
          room_id: string
          time_spent_minutes: number
          time_spent_seconds: number
          visited_at?: string | null
          came_back: number
        }
        Insert: {
          username: string
          room_name: string
          messages_sent?: number
          room_id: string
          time_spent_minutes?: number
          time_spent_seconds?: number
          visited_at?: string | null
          came_back?: number
        }
        Update: {
          username?: string
          room_name?: string
          messages_sent?: number
          room_id?: string
          time_spent_minutes?: number
          time_spent_seconds?: number
          visited_at?: string | null
          came_back?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_behaviour_messages: {
        Args: {
          p_room_id: string
          p_username: string
        }
        Returns: undefined
      }
      increment_behaviour_came_back: {
        Args: {
          p_room_id: string
          p_username: string
        }
        Returns: undefined
      }
      increment_behaviour_time: {
        Args: {
          p_room_id: string
          p_username: string
          seconds: number
        }
        Returns: undefined
      }
      increment_room_message_count: {
        Args: {
          room_id: string
        }
        Returns: undefined
      }
      increment_room_time_spent: {
        Args: {
          room_id: string
          seconds: number
        }
        Returns: undefined
      }
      increment_room_user_count: {
        Args: {
          room_id: string
        }
        Returns: undefined
      }
      increment_user_came_back: {
        Args: {
          p_username: string
        }
        Returns: undefined
      }
      increment_user_messages_sent: {
        Args: {
          p_username: string
        }
        Returns: undefined
      }
    }
    Enums: {
      friend_status: 'accepted' | 'declined'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
