export type Priority = "asap" | "high" | "medium" | "low" | "someday";
export type TaskStatus = "not_started" | "in_progress" | "for_review" | "waiting" | "complete";

export interface RosterEntry {
  id: string;
  display_name: string;
  initials: string;
  color: string;
}

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          display_name: string;
          initials: string;
          color: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["members"]["Row"]> & {
          email: string;
          display_name: string;
          initials: string;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          label: string;
          is_default: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & {
          label: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          category_id: string | null;
          priority: Priority;
          status: TaskStatus;
          reminder_at: string | null;
          reminder_dismissed_at: string | null;
          reminder_dismissed_by: string | null;
          due_date: string | null;
          created_by: string;
          completed_at: string | null;
          completed_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & {
          title: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      task_assignees: {
        Row: {
          task_id: string;
          member_id: string;
          assigned_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["task_assignees"]["Row"]> & {
          task_id: string;
          member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_assignees"]["Row"]>;
        Relationships: [];
      };
      task_notes: {
        Row: {
          id: string;
          task_id: string;
          member_id: string;
          body: string;
          created_at: string;
          edited_at: string | null;
          parent_note_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["task_notes"]["Row"]> & {
          task_id: string;
          member_id: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_notes"]["Row"]>;
        Relationships: [];
      };
      task_note_likes: {
        Row: {
          note_id: string;
          member_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["task_note_likes"]["Row"]> & {
          note_id: string;
          member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_note_likes"]["Row"]>;
        Relationships: [];
      };
      task_events: {
        Row: {
          id: string;
          task_id: string;
          member_id: string | null;
          kind: "created" | "status" | "due_date";
          from_value: string | null;
          to_value: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      task_reads: {
        Row: {
          task_id: string;
          member_id: string;
          last_read_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["task_reads"]["Row"]> & {
          task_id: string;
          member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_reads"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      list_team_roster: {
        Args: Record<string, never>;
        Returns: RosterEntry[];
      };
    };
  };
}
