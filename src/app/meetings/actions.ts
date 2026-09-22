"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/get-current-member";
import { toStorageBody, visibleLength } from "@/lib/mentions";
import { listRoster } from "@/lib/data/tasks";
import {
  getMeeting,
  listBinnedMeetings,
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
  /*
    The line the card shows. Its own field rather than the opening of the
    minutes, which is whatever happened to be typed first. Empty is normal —
    a meeting created thirty seconds before it starts has nothing to
    summarise — and empty means the card shows the title alone.
  */
  description: z
    .string()
    .trim()
    .max(200, "That description is too long — keep it to a line.")
    .optional()
    .default(""),
  metOn: dateSchema,
  /* Optional, and an empty string from an untouched <input type="time">. */
  metAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "That time isn't valid.")
    .optional()
    .or(z.literal("")),
  /*
    Up to four, matching set_meeting_attendees. A meeting spanning five
    companies is a conference, and its minutes want a title rather than five
    chips on a 360px card.
  */
  companyIds: z.array(z.string().uuid()).max(4, "Four companies is the most.").default([]),
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
  if (message && /minutes|team|exist|long|meeting|bin|companies|added/i.test(message)) return message;
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
        description: v.description || null,
        met_on: v.metOn,
        met_at: v.metAt ? v.metAt : null,
        created_by: member.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await syncAttendees(supabase, meeting.id, v.companyIds, v.contactIds, v.memberIds);

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
    const { supabase } = await getCurrentMember();
    const v = parsed.data;

    const { data: allowed, error: canError } = await supabase.rpc("can_edit_meeting_details", {
      p_meeting_id: meetingId.data,
    });
    if (canError) throw canError;
    if (!allowed) {
      return { ok: false, error: "Only somebody who was at this meeting can change it." };
    }

    const { error } = await supabase
      .from("meetings")
      .update({
        title: v.title,
        description: v.description || null,
        met_on: v.metOn,
        met_at: v.metAt ? v.metAt : null,
      })
      .eq("id", meetingId.data);
    if (error) throw error;

    await syncAttendees(supabase, meetingId.data, v.companyIds, v.contactIds, v.memberIds);

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
 * One call, and since 0051 the only way in — the write policies on those two
 * tables are gone. It was four statements: delete the contacts, delete the
 * members, insert the contacts, insert the members. That was merely wasteful
 * while only the author could edit. Once anybody who was AT the meeting can,
 * it is a trap: statement two deletes the row that gives Dee her permission,
 * and statement four is then refused. She would have wiped the attendee list
 * and been unable to put it back. The function checks once, before anything
 * is deleted.
 */
async function syncAttendees(
  supabase: Awaited<ReturnType<typeof getCurrentMember>>["supabase"],
  meetingId: string,
  companyIds: string[],
  contactIds: string[],
  memberIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc("set_meeting_attendees", {
    p_meeting_id: meetingId,
    p_company_ids: [...new Set(companyIds)],
    p_contact_ids: [...new Set(contactIds)],
    p_member_ids: [...new Set(memberIds)],
  });
  if (error) throw error;
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

  try {
    const { supabase, member } = await getCurrentMember();

    /*
      `@Dee Kapur` on the way in becomes `@[Dee Kapur](uuid)` on the way to
      the database, which is the form the notification trigger reads and the
      form that survives somebody changing their display name. Resolved here
      against the live roster rather than trusting ids from the browser: a
      client that could name the member id could name anybody's.
    */
    const roster = await listRoster(supabase);
    const stored = toStorageBody(text, roster);

    /*
      Measured as it reads, not as it is stored. A mention costs about fifty
      characters on disk and eight on screen, and charging somebody fifty for
      typing a teammate's name would be inexplicable from the outside.
    */
    if (visibleLength(stored) > 4000) {
      return { ok: false, error: "That comment is too long." };
    }

    const { error } = await supabase
      .from("meeting_comments")
      .insert({ meeting_id: meetingId.data, member_id: member.id, body: stored });
    if (error) throw error;
    revalidateMeetingViews(meetingId.data);
    return { ok: true };
  } catch (error) {
    console.error("addMeetingComment failed", error);
    return { ok: false, error: "Couldn't add that comment. Try again." };
  }
}

/**
 * Agreeing with a comment, or taking it back.
 *
 * One row per person per comment, so this is an insert or a delete rather
 * than a counter — which means two people liking at once cannot lose one of
 * the two, and there is no number to drift out of step with reality.
 *
 * Nothing is revalidated: a like changes one number on one line, the screen
 * already knows what it did, and rebuilding three routes for it would make
 * the cheapest gesture in the app the most expensive.
 */
export async function setMeetingCommentLike(
  commentIdInput: string,
  liked: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const commentId = idSchema.safeParse(commentIdInput);
  if (!commentId.success) return { ok: false, error: "Invalid comment." };

  try {
    const { supabase, member } = await getCurrentMember();
    if (liked) {
      const { error } = await supabase
        .from("meeting_comment_likes")
        .upsert(
          { comment_id: commentId.data, member_id: member.id },
          { onConflict: "comment_id,member_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("meeting_comment_likes")
        .delete()
        .eq("comment_id", commentId.data)
        .eq("member_id", member.id);
      if (error) throw error;
    }
    return { ok: true };
  } catch (error) {
    console.error("setMeetingCommentLike failed", error);
    return { ok: false, error: "Couldn't do that just now." };
  }
}

/**
 * The write lease on a set of minutes.
 *
 * Marcelo writes on a laptop and, when it dies or the call is on speaker, on
 * a phone — so the same minutes can genuinely be open twice on his own
 * account. The stale check already stops the second screen flattening the
 * first, but only after a paragraph has been typed into it. This stops the
 * typing: whoever opens the write box holds it, and everybody else gets the
 * minutes to read and a line saying where they are being written.
 *
 * Always returns who holds it now — yours or somebody else's — so the page
 * never has to ask a second question, and there is no gap between "is it
 * free" and "take it" for the other device to slip through.
 */
export interface MeetingLock {
  heldByMe: boolean;
  holder: string | null;
  refreshedAt: string | null;
}

export async function claimMeetingLock(
  meetingIdInput: string,
  deviceId: string
): Promise<{ ok: true; lock: MeetingLock } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  if (typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 64) {
    return { ok: false, error: "Invalid device." };
  }

  try {
    const { supabase } = await getCurrentMember();
    const { data, error } = await supabase.rpc("claim_meeting_lock", {
      p_meeting_id: meetingId.data,
      p_device_id: deviceId,
    });
    if (error) throw error;
    const state = data as unknown as {
      held_by_me: boolean;
      display_name: string | null;
      refreshed_at: string | null;
    };
    return {
      ok: true,
      lock: {
        heldByMe: Boolean(state?.held_by_me),
        holder: state?.display_name ?? null,
        refreshedAt: state?.refreshed_at ?? null,
      },
    };
  } catch (error) {
    console.error("claimMeetingLock failed", error);
    return { ok: false, error: rpcError(error, "Couldn't open these minutes for writing.") };
  }
}

export async function releaseMeetingLock(
  meetingIdInput: string,
  deviceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  if (typeof deviceId !== "string") return { ok: false, error: "Invalid device." };
  try {
    const { supabase } = await getCurrentMember();
    const { error } = await supabase.rpc("release_meeting_lock", {
      p_meeting_id: meetingId.data,
      p_device_id: deviceId,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.error("releaseMeetingLock failed", error);
    return { ok: false, error: "Couldn't let go of these minutes." };
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
    const { supabase } = await getCurrentMember();
    const v = parsed.data;

    const { data, error } = await supabase.rpc("save_meeting", {
      p_meeting_id: meetingId.data,
      p_title: v.title,
      p_met_on: v.metOn,
      p_met_at: v.metAt ? v.metAt : null,
      p_body: body,
      p_expected: expected,
      p_description: v.description || null,
    });
    if (error) throw error;

    await syncAttendees(supabase, meetingId.data, v.companyIds, v.contactIds, v.memberIds);

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

/**
 * What is in the bin.
 *
 * Fetched when the bin is opened rather than loaded with the page: most
 * visits to Meetings never open it, and a list nobody is looking at is not
 * worth a phone's bandwidth. `setMeetingDeleted(id, false)` is what puts one
 * back — the same call that put it in, with the boolean the other way round.
 */
export async function binnedMeetings(): Promise<
  { ok: true; meetings: MeetingSummary[] } | { ok: false; error: string }
> {
  try {
    const { supabase, member } = await getCurrentMember();
    return { ok: true, meetings: await listBinnedMeetings(supabase, member.id) };
  } catch (error) {
    console.error("binnedMeetings failed", error);
    return { ok: false, error: "Couldn't open the bin. Try again." };
  }
}

/**
 * Erasing binned minutes for good.
 *
 * The other end of the bin, and the only irreversible thing about a meeting.
 * The database refuses anything not already binned, so this is always the
 * second of two deliberate acts, and it hands back what it destroyed so the
 * screen can name it. Tasks that came out of the meeting survive — the work
 * stays, only its origin is forgotten.
 */
export interface ErasedMeeting {
  title: string;
  characters: number;
  comments: number;
  people: number;
  tasks: number;
}

export async function eraseMeeting(
  meetingIdInput: string
): Promise<{ ok: true; erased: ErasedMeeting | null } | { ok: false; error: string }> {
  const meetingId = idSchema.safeParse(meetingIdInput);
  if (!meetingId.success) return { ok: false, error: "Invalid meeting." };
  try {
    const { supabase } = await getCurrentMember();
    const { data, error } = await supabase.rpc("purge_meeting", { p_meeting_id: meetingId.data });
    if (error) throw error;
    revalidateMeetingViews();
    return { ok: true, erased: (data as unknown as ErasedMeeting) ?? null };
  } catch (error) {
    console.error("eraseMeeting failed", error);
    return { ok: false, error: rpcError(error, "Couldn't erase those minutes. Try again.") };
  }
}
