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
  | "overdue"
  /** The one that is not about a task at all. See 0025_contact_erased.sql. */
  | "contact_erased";

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

/** Everything a contact's Activity can record. */
export type ContactEventKind = "created" | "edited" | "deleted" | "restored";

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
      contact_categories: {
        Row: {
          id: string;
          label: string;
          /** A name the app maps to a Lucide icon; unknown falls back. */
          icon: string;
          sort_order: number;
          is_default: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: { label: string; icon?: string; sort_order?: number; created_by: string };
        Update: Partial<Database["public"]["Tables"]["contact_categories"]["Row"]>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          name: string;
          about: string | null;
          website: string | null;
          company_number: string | null;
          street: string | null;
          suite: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["companies"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Omit<Database["public"]["Tables"]["companies"]["Row"], "id" | "created_by" | "created_at">
        >;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          job_title: string | null;
          company: string | null;
          mobile: string | null;
          office_phone: string | null;
          email: string | null;
          email2: string | null;
          website: string | null;
          street: string | null;
          suite: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          category_id: string | null;
          /** The company they belong to. `company` is kept in step by trigger. */
          company_id: string | null;
          source: string | null;
          notes: string | null;
          created_by: string;
          /** The bin. Set only through delete_contact, pinned otherwise. */
          deleted_at: string | null;
          deleted_by: string | null;
          created_at: string;
          updated_at: string;
          /** Generated: digits only, for the duplicate check. Never written. */
          mobile_digits: string | null;
          office_digits: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["contacts"]["Row"],
          | "id"
          | "company_id"
          | "deleted_at"
          | "deleted_by"
          | "created_at"
          | "updated_at"
          | "mobile_digits"
          | "office_digits"
        > &
          Partial<Pick<Database["public"]["Tables"]["contacts"]["Row"], "id" | "company_id">>;
        Update: Partial<
          Omit<
            Database["public"]["Tables"]["contacts"]["Row"],
            "id" | "created_by" | "created_at" | "mobile_digits" | "office_digits"
          >
        >;
        Relationships: [];
      };
      task_contacts: {
        Row: {
          task_id: string;
          contact_id: string;
          attached_by: string | null;
          attached_at: string;
        };
        Insert: { task_id: string; contact_id: string; attached_by: string };
        Update: never;
        Relationships: [];
      };
      contact_events: {
        Row: {
          id: string;
          contact_id: string;
          member_id: string | null;
          kind: ContactEventKind;
          field: string | null;
          from_value: string | null;
          to_value: string | null;
          created_at: string;
        };
        /** Written by trigger only. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notification_prefs: {
        Row: {
          member_id: string;
          /** Kinds NOT pushed. Opt-outs, so a new kind is on by default. */
          push_off: string[];
          /** Kinds NOT emailed. */
          email_off: string[];
          /** App-clock times; may wrap midnight. Null means no quiet hours. */
          quiet_from: string | null;
          quiet_to: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_prefs"]["Row"]> & {
          member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_prefs"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          member_id: string;
          actor_id: string | null;
          /** Null for kinds that are not about a task — contact_erased. */
          task_id: string | null;
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
      /**
       * Erases a deleted task and everything cascading off it. Creator
       * only, and only on a task already in the bin. Returns what it
       * destroyed: { title, notes, events }. See 0021_purge_task.sql.
       */
      /** Refused while anyone is still at the company. See 0024_companies.sql. */
      delete_company: { Args: { p_company_id: string }; Returns: void };
      company_contact_count: { Args: { p_company_id: string }; Returns: number };
      purge_task: {
        Args: { p_task_id: string };
        Returns: { title: string; notes: number; events: number };
      };
      /** Dispatcher only — not granted to `authenticated`. */
      increment_push_failure: { Args: { p_id: string }; Returns: void };
      /**
       * Dispatcher only. Stamps pushed_at past the guard trigger, which pins
       * it for everybody else — including the service role.
       */
      mark_notifications_pushed: { Args: { p_ids: string[] }; Returns: number };
      /** Dispatcher only. The emailed_at twin of mark_notifications_pushed. */
      mark_notifications_emailed: { Args: { p_ids: string[] }; Returns: number };
      /** Scheduler only — writes notification rows, never granted to a member. */
      run_scheduled_notifications: { Args: Record<string, never>; Returns: unknown };
      /**
       * The address book. See 0022_contacts.sql — the rules these enforce are
       * described there, and the app must not try to keep them a second time.
       */
      delete_contact: { Args: { p_contact_id: string }; Returns: void };
      restore_contact: { Args: { p_contact_id: string }; Returns: void };
      purge_contact: {
        Args: { p_contact_id: string };
        Returns: { name: string; phones: number; emails: number; addresses: number; tasks: number };
      };
      /** The unfinished tasks standing between a contact and the bin. */
      contact_blocking_tasks: {
        Args: { p_contact_id: string };
        Returns: { task_id: string; title: string; status: TaskStatus }[];
      };
      /** A warning, never a block. Searches the bin too and says so. */
      find_contact_duplicates: {
        Args: {
          p_email?: string | null;
          p_email2?: string | null;
          p_mobile?: string | null;
          p_office?: string | null;
          p_exclude_id?: string | null;
        };
        Returns: {
          id: string;
          first_name: string;
          last_name: string;
          job_title: string | null;
          company: string | null;
          matched_on: string;
          in_bin: boolean;
        }[];
      };
      /** Handles windows that wrap midnight. See 0020_notification_prefs.sql. */
      in_quiet_hours: {
        Args: { p_from: string | null; p_to: string | null; p_at?: string };
        Returns: boolean;
      };
    };
  };
}
