export type Priority = "asap" | "high" | "medium" | "low" | "someday";
export type TaskStatus = "not_started" | "in_progress" | "for_review" | "waiting" | "complete";

/**
 * Every reason the app has to tell somebody something. The first five are
 * written by triggers as things happen; the rest arrive with @mentions and
 * the scheduled rules that watch reminders and deadlines.
 */
export type NotificationKind =
  | "note"
  | "reply"
  | "assigned"
  | "status"
  | "due_date"
  | "mention"
  | "delete_requested"
  | "delete_denied"
  | "deleted"
  | "restored"
  | "reminder_upcoming"
  | "reminder_due"
  | "due_soon"
  | "overdue";

/**
 * Everything a task's Activity can record. The deletion kinds are what make
 * an approved or refused request survive the notification that announced it.
 */
export type TaskEventKind =
  | "created"
  | "status"
  | "due_date"
  | "reminder"
  | "delete_requested"
  | "delete_denied"
  | "delete_cancelled"
  | "deleted"
  | "restored";

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
          reminder_set_by: string | null;
          deletion_requested_by: string | null;
          deletion_requested_at: string | null;
          deletion_reason: string | null;
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
          deleted_at: string | null;
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
          kind: TaskEventKind;
          from_value: string | null;
          to_value: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          member_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_success_at: string | null;
          failure_count: number;
        };
        Insert: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]> & {
          member_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          member_id: string;
          actor_id: string | null;
          task_id: string;
          note_id: string | null;
          kind: NotificationKind;
          payload: Record<string, unknown>;
          dedupe_key: string | null;
          created_at: string;
          read_at: string | null;
          pushed_at: string | null;
          emailed_at: string | null;
        };
        /** Rows come from database triggers only — never from the app. */
        Insert: never;
        /**
         * The one change a member may make is read_at — a trigger pins the
         * rest. The delivery stamps are writable only by the service role,
         * which RLS does not apply to.
         */
        Update: { read_at?: string | null; pushed_at?: string | null; emailed_at?: string | null };
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
      request_task_deletion: { Args: { p_task_id: string; p_reason: string }; Returns: void };
      resolve_task_deletion: { Args: { p_task_id: string; p_approve: boolean }; Returns: void };
      cancel_task_deletion: { Args: { p_task_id: string }; Returns: void };
      delete_own_task: { Args: { p_task_id: string }; Returns: void };
      restore_task: { Args: { p_task_id: string }; Returns: void };
      /** Dispatcher only — not granted to `authenticated`. */
      increment_push_failure: { Args: { p_id: string }; Returns: void };
    };
  };
}
