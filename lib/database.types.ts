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
          created_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          uuid: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          uuid?: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
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
      messages: {
        Row: {
          id: string
          content: string
          display_name: string | null
          username: string | null
          college: string | null
          room_id: string | null
          created_at: string
        }
        Insert: {
          content: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          room_id?: string | null
          created_at?: string
        }
        Update: {
          content?: string
          display_name?: string | null
          username?: string | null
          college?: string | null
          room_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          reported_id: string | null
          reported_message: string | null
          reporter_id: string | null
          room_id: string | null
          created_at: string | null
        }
        Insert: {
          reported_id?: string | null
          reported_message?: string | null
          reporter_id?: string | null
          room_id?: string | null
          created_at?: string | null
        }
        Update: {
          reported_id?: string | null
          reported_message?: string | null
          reporter_id?: string | null
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
        }
        Insert: {
          id?: string
          headline: string
          created_at?: string
        }
        Update: {
          id?: string
          headline?: string
          created_at?: string
        }
        Relationships: []
      }
      user_behaviour: {
        Row: {
          id: string
          username: string
          room_id: string
          seconds_spent: number
          messages_sent: number
          visited_at?: string | null
        }
        Insert: {
          username: string
          room_id: string
          seconds_spent?: number
          messages_sent?: number
          visited_at?: string | null
        }
        Update: {
          username?: string
          room_id?: string
          seconds_spent?: number
          messages_sent?: number
          visited_at?: string | null
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
      friend_status: 'accepted' | 'declined'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
