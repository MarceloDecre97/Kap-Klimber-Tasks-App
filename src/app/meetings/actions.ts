"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import {
  getMeeting,
  listCompanyMeetings,
  listContactMeetings,
  listMeetingComments,
  listMeetingEvents,
  listMeetingTasks,
  searchMeetings,
  type MeetingEvent,
} from "@/lib/data/meetings";
import type { MeetingComment, MeetingTask } from "@/lib/data/meetings";
import type { Meeting, MeetingSummary } from "@/lib/meetings-view";

/**
 * Everything that writes a meeting.
 *
 * Thin, deliberately. Every permission rule lives in the database — 0046's
 * guard pins what a non-author may not change, and save_meeting_body holds
 * the stale-screen rule. A check repeated here would be a second copy to
 * drift, and one a direct API call would walk straight past.
 */

type ActionResult<T = { meetingId: string }> = ({ ok: true } & T) | { ok: false; error: string };

const idSchema = z.string().uuid();

/** A date the database will take: a real calendar day, not a typo. */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for this meeting.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)), "Pick a date for this meeting.");

const meetingInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give these minutes a title — it's what makes them findable later.")
    .max(200, "That title is too long."),
  metOn: dateSchema,
  /* Optional, and an empty string from an untouched <input type="time">. */
  metAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That time isn't valid.")
    .optional()
    .or(z.literal("")),
  companyId: z.string().uuid().nullable().optional(),
  contactIds: z.array(z.string().uuid()).max(40).default([]),
  memberIds: z.array(z.string().uuid()).max(20).default([]),
});

export type MeetingValues = z.input<typeof meetingInputSchema>;

function revalidateMeetingViews(meetingId?: string) {
  revalidatePath("/meetings");
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
  /* A meeting shows on a company and on a contact, so both books move too. */
  revalidatePath("/contacts");
  revalidatePath("/companies");
}

function rpcError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  /* The database's own refusals are written to be read by a person. */
  if (message && /minutes|team|exist|long/i.test(message)) return message;
  return fallback;
}

/**
 * A new meeting, in as few keystrokes as we can manage.
 *
 * The three-second path is the point: a spontaneous call that has to go into
 * Word "just for now" never comes back, so creating one must cost less than
 * opening Word. Title and date, and the date is already filled in.
 */
export async function createMeeting(input: unknown): Promise<ActionResult> {
  const parsed = meetingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  try {
    const { supabase, member } = await getCurrentMember();
    const v = parsed.data;

    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({
        title: v.title,
        met_on: v.metOn,
        met_at: v.metAt ? v.metAt : null,
        company_id: v.companyId ?? null,
        created_by: member.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await syncAttendees(supabase, meeting.id, member.id, v.contactIds, v.memberIds);

    revalidateMeetingViews(meeting.id);
    return { ok: true, meetingId: meeting.id };
  } catch (error) {
    console.error("createMeeting failed", error);
    return { ok: false, error: "Couldn't start those minutes. Try again." };
  }
}

/** The details around the paper — everything except the body. */
export async function updateMeeting(
  meetingIdInput: string,
  input: unknown
): Promise<ActionResult> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  const parsed = meetingInputSchema.safeParse(input);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  try {
    const { supabase, member } = await getCurrentMember();
    const v = parsed.data;

    const { data: allowed, error: canError } = await supabase.rpc("can_edit_meeting", {
      p_meeting_id: meetingId.data,
    });
    if (canError) throw canError;
    if (!allowed) {
      return { ok: false, error: "Only the person who wrote these minutes can change them." };
    }

    const { error } = await supabase
      .from("meetings")
      .update({
        title: v.title,
        met_on: v.metOn,
        met_at: v.metAt ? v.metAt : null,
        company_id: v.companyId ?? null,
      })
      .eq("id", meetingId.data);
    if (error) throw error;

    await syncAttendees(supabase, meetingId.data, member.id, v.contactIds, v.memberIds);

    revalidateMeetingViews(meetingId.data);
    return { ok: true, meetingId: meetingId.data };
  } catch (error) {
    console.error("updateMeeting failed", error);
    return { ok: false, error: rpcError(error, "Couldn't save those changes. Try again.") };
  }
}

/**
 * Autosave.
 *
 * `expected` is the updated_at the page last saw. The database compares it
 * and refuses rather than overwriting when the row has moved on — which is
 * what happens when the laptop and the phone are both open on the same
 * minutes. `stale` comes back instead of an error so the page can offer to
 * reload, which is a different thing from having failed.
 */
export async function saveMeetingBody(
  meetingIdInput: string,
  body: string,
  expected: string | null
): Promise<{ ok: true; savedAt: string } | { ok: false; stale?: true; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  if (typeof body !== "string") return { ok: false, error: "Invalid minutes." };
  if (body.length > 200_000) {
    return { ok: false, error: "These minutes are too long to save. Split them across two." };
  }

  try {
    const { supabase } = await getCurrentMember();
    const { data, error } = await supabase.rpc("save_meeting_body", {
      p_meeting_id: meetingId.data,
      p_body: body,
      p_expected: expected,
    });
    if (error) throw error;

    /*
      Not revalidating the whole book on every keystroke-batch. Autosave runs
      every couple of seconds; rebuilding three routes each time would make
      typing the most expensive thing in the app. The list catches up when
      the page is next asked for.
    */
    return { ok: true, savedAt: data as unknown as string };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("STALE")) {
      return {
        ok: false,
        stale: true,
        error: "These minutes changed somewhere else — reload to see them before you carry on.",
      };
    }
    console.error("saveMeetingBody failed", error);
    return { ok: false, error: rpcError(error, "Couldn't save just now — your text is still here.") };
  }
}

/** To the bin, or back out of it. The author's, per 0046. */
export async function setMeetingDeleted(
  meetingIdInput: string,
  deleted: boolean
): Promise<ActionResult> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };

  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("delete_meeting", {
      p_meeting_id: meetingId.data,
      p_deleted: deleted,
    });
    if (error) throw error;

    revalidateMeetingViews(meetingId.data);
    return { ok: true, meetingId: meetingId.data };
  } catch (error) {
    console.error("setMeetingDeleted failed", error);
    return { ok: false, error: rpcError(error, "Couldn't do that. Try again.") };
  }
}

/** Search, run by Postgres — see listMeetings for why not in the browser. */
export async function findMeetings(
  query: string
): Promise<{ ok: true; meetings: MeetingSummary[] } | { ok: false; error: string }> {
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, meetings: await searchMeetings(supabase, member.id, query) };
  } catch (error) {
    console.error("findMeetings failed", error);
    return { ok: false, error: "Couldn't search just now. Try again." };
  }
}

/** One meeting with its paper, for the editor to open. */
export async function loadMeeting(
  meetingIdInput: string
): Promise<{ ok: true; meeting: Meeting | null } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, meeting: await getMeeting(supabase, member.id, meetingId.data) };
  } catch (error) {
    console.error("loadMeeting failed", error);
    return { ok: false, error: "Couldn't open those minutes. Try again." };
  }
}

/** What changed around the paper. */
export async function meetingActivity(
  meetingIdInput: string
): Promise<{ ok: true; events: MeetingEvent[] } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  try {
    const { supabase } = await getCurrentMember();
    return { ok: true, events: await listMeetingEvents(supabase, meetingId.data) };
  } catch (error) {
    console.error("meetingActivity failed", error);
    return { ok: false, error: "Couldn't load that history." };
  }
}

/**
 * Who was in the room, brought in line with what was picked.
 *
 * Deleted and re-inserted rather than diffed. The lists are a handful of
 * rows, the table has no columns worth preserving across a change, and a
 * diff would be three round trips to save one.
 */
async function syncAttendees(
  supabase: Awaited<ReturnType<typeof getCurrentMember>>["supabase"],
  meetingId: string,
  meId: string,
  contactIds: string[],
  memberIds: string[]
): Promise<void> {
  const contacts = [...new Set(contactIds)];
  const members = [...new Set(memberIds)];

  const { error: clearContacts } = await supabase
    .from("meeting_contacts")
    .delete()
    .eq("meeting_id", meetingId);
  if (clearContacts) throw clearContacts;

  const { error: clearMembers } = await supabase
    .from("meeting_members")
    .delete()
    .eq("meeting_id", meetingId);
  if (clearMembers) throw clearMembers;

  if (contacts.length > 0) {
    const { error } = await supabase
      .from("meeting_contacts")
      .insert(contacts.map((contact_id) => ({ meeting_id: meetingId, contact_id, added_by: meId })));
    if (error) throw error;
  }

  if (members.length > 0) {
    const { error } = await supabase
      .from("meeting_members")
      .insert(members.map((member_id) => ({ meeting_id: meetingId, member_id, added_by: meId })));
    if (error) throw error;
  }
}

/**
 * The meetings on a company's page, and on a person's.
 *
 * Fetched when the pane opens rather than loaded with the contacts book.
 * The book is already the heaviest page in the app and most of the time
 * nobody opens a pane at all — making every visit to Contacts carry every
 * company's meeting history to save a request that usually never happens is
 * the wrong trade.
 */
export async function companyMeetings(
  companyIdInput: string
): Promise<{ ok: true; meetings: MeetingSummary[] } | { ok: false; error: string }> {
  const companyId = idSchema.safeParse(companyIdInput);
  if (!companyId.success) return { ok: false, error: "Invalid company." };
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, meetings: await listCompanyMeetings(supabase, member.id, companyId.data) };
  } catch (error) {
    console.error("companyMeetings failed", error);
    return { ok: false, error: "Couldn't load the meetings." };
  }
}

export async function contactMeetings(
  contactIdInput: string
): Promise<{ ok: true; meetings: MeetingSummary[] } | { ok: false; error: string }> {
  const contactId = idSchema.safeParse(contactIdInput);
  if (!contactId.success) return { ok: false, error: "Invalid contact." };
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, meetings: await listContactMeetings(supabase, member.id, contactId.data) };
  } catch (error) {
    console.error("contactMeetings failed", error);
    return { ok: false, error: "Couldn't load the meetings." };
  }
}

/** What came out of a meeting, with live status. */
export async function meetingTasks(
  meetingIdInput: string
): Promise<{ ok: true; tasks: MeetingTask[] } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  try {
    const { supabase } = await getCurrentMember();
    return { ok: true, tasks: await listMeetingTasks(supabase, meetingId.data) };
  } catch (error) {
    console.error("meetingTasks failed", error);
    return { ok: false, error: "Couldn't load the tasks." };
  }
}

/** The margin notes on a meeting. */
export async function meetingComments(
  meetingIdInput: string
): Promise<{ ok: true; comments: MeetingComment[] } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, comments: await listMeetingComments(supabase, member.id, meetingId.data) };
  } catch (error) {
    console.error("meetingComments failed", error);
    return { ok: false, error: "Couldn't load the comments." };
  }
}

/**
 * Add one.
 *
 * Anyone on the team, including on their own minutes — a note to self about
 * what to chase is exactly what this is for. The author of the minutes is
 * told; nobody else is, because a comment is addressed to them.
 */
export async function addMeetingComment(
  meetingIdInput: string,
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0) return { ok: false, error: "Write something first." };
  if (text.length > 4000) return { ok: false, error: "That comment is too long." };

  try {
    const { supabase, member } = await getCurrentMember();
    const { error } = await supabase
      .from("meeting_comments")
      .insert({ meeting_id: meetingId.data, member_id: member.id, body: text });
    if (error) throw error;
    revalidateMeetingViews(meetingId.data);
    return { ok: true };
  } catch (error) {
    console.error("addMeetingComment failed", error);
    return { ok: false, error: "Couldn't add that comment. Try again." };
  }
}

/** Take your own back. The guard in 0048 refuses anybody else's. */
export async function removeMeetingComment(
  commentIdInput: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const commentId = idSchema.safeParse(commentIdInput);
  if (!commentId.success) return { ok: false, error: "Invalid comment." };
  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase
      .from("meeting_comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", commentId.data);
    if (error) throw error;
    revalidateMeetingViews();
    return { ok: true };
  } catch (error) {
    console.error("removeMeetingComment failed", error);
    return { ok: false, error: "Couldn't remove that comment. Try again." };
  }
}

/**
 * One save for the whole meeting: details, paper and attendees.
 *
 * The split between a Save-details button and an autosaving paper is what let
 * Marcelo set a title, a company and an attendee, leave, and come back to
 * none of it — one half of the screen saved itself and the other quietly did
 * not. There is one write now, under one stale check, behind one button.
 */
export async function saveMeeting(
  meetingIdInput: string,
  input: unknown,
  body: string,
  expected: string | null
): Promise<{ ok: true; savedAt: string } | { ok: false; stale?: true; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  const parsed = meetingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  if (typeof body !== "string") return { ok: false, error: "Invalid minutes." };
  if (body.length > 200_000) {
    return { ok: false, error: "These minutes are too long to save. Split them across two." };
  }

  try {
    const { supabase, member } = await getCurrentMember();
    const v = parsed.data;

    const { data, error } = await supabase.rpc("save_meeting", {
      p_meeting_id: meetingId.data,
      p_title: v.title,
      p_met_on: v.metOn,
      p_met_at: v.metAt ? v.metAt : null,
      p_company_id: v.companyId ?? null,
      /*
        Said outright rather than inferred from a null, because null is a
        real answer here — "worked out from who was there" — and a caller
        that has to guess which null is which gets it wrong eventually.
      */
      p_clear_company: !v.companyId,
      p_body: body,
      p_expected: expected,
    });
    if (error) throw error;

    await syncAttendees(supabase, meetingId.data, member.id, v.contactIds, v.memberIds);

    revalidateMeetingViews(meetingId.data);
    return { ok: true, savedAt: data as unknown as string };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("STALE")) {
      return {
        ok: false,
        stale: true,
        error: "These minutes changed somewhere else — reload before you carry on.",
      };
    }
    console.error("saveMeeting failed", error);
    return { ok: false, error: rpcError(error, "Couldn't save just now — your text is still here.") };
  }
}
