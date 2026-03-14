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
          college: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          uuid: string
          display_name?: string | null
          college?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          uuid?: string
          display_name?: string | null
          college?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      friends: {
        Row: {
          user_uuid: string
          friend_uuid: string
          created_at?: string | null
        }
        Insert: {
          user_uuid: string
          friend_uuid: string
          created_at?: string | null
        }
        Update: {
          user_uuid?: string
          friend_uuid?: string
          created_at?: string | null
        }
      }
      friend_requests: {
        Row: {
          id: string
          sender_uuid: string
          receiver_uuid: string
          sender_name: string | null
          status: string
          created_at?: string | null
        }
        Insert: {
          sender_uuid: string
          receiver_uuid: string
          sender_name?: string | null
          status?: string
          created_at?: string | null
        }
        Update: {
          sender_uuid?: string
          receiver_uuid?: string
          sender_name?: string | null
          status?: string
          created_at?: string | null
        }
      }
      messages: {
        Row: {
          id: string
          content: string
          username: string | null
          university: string | null
          room_id: string | null
          created_at: string
          user_uuid: string | null
          reveal_delay?: number | null
        }
        Insert: {
          content: string
          username?: string | null
          university?: string | null
          room_id?: string | null
          created_at?: string
          user_uuid?: string | null
          reveal_delay?: number | null
        }
        Update: {
          content?: string
          username?: string | null
          university?: string | null
          room_id?: string | null
          created_at?: string
          user_uuid?: string | null
          reveal_delay?: number | null
        }
      }
      reports: {
        Row: {
          id: string
          reported_message_id: string | null
          reported_username: string | null
          reported_message: string | null
          reporter_id: string | null
          room_id: string | null
          created_at: string | null
        }
        Insert: {
          reported_message_id?: string | null
          reported_username?: string | null
          reported_message?: string | null
          reporter_id?: string | null
          room_id?: string | null
          created_at?: string | null
        }
        Update: {
          reported_message_id?: string | null
          reported_username?: string | null
          reported_message?: string | null
          reporter_id?: string | null
          room_id?: string | null
          created_at?: string | null
        }
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
      }
      user_behaviour: {
        Row: {
          id: string
          user_id: string
          room_id: string
          seconds_spent: number
          messages_sent: number
          typed_but_not_sent: number
          returned_to_room: number
          visited_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          user_id: string
          room_id: string
          seconds_spent?: number
          messages_sent?: number
          typed_but_not_sent?: number
          returned_to_room?: number
          visited_at?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          room_id?: string
          seconds_spent?: number
          messages_sent?: number
          typed_but_not_sent?: number
          returned_to_room?: number
          visited_at?: string | null
          updated_at?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
