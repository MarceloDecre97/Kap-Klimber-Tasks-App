"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  addMeetingComment,
  meetingComments,
  removeMeetingComment,
} from "@/app/meetings/actions";
import type { MeetingComment } from "@/lib/data/meetings";
import { formatTimestamp } from "@/lib/utils";

/**
 * The margin.
 *
 * Only the author writes the minutes — everyone else writes here. Dee sat in
 * on the call, Marcelo wrote it up, and Dee remembers the part about the
 * second depot; without somewhere to put that she either messages him and it
 * is lost, or she does not bother.
 *
 * Deliberately plainer than the notes on a task: no replies, no likes, no
 * mentions. Those exist on a task because a task is a conversation between
 * the people doing it. This is a note in the margin, and a margin with
 * threading in it is a second document.
 */
export function MeetingComments({ meetingId }: { meetingId: string }) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [comments, setComments] = useState<MeetingComment[] | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let live = true;
    void meetingComments(meetingId).then((result) => {
      if (live && result.ok) setComments(result.comments);
    });
    return () => {
      live = false;
    };
  }, [meetingId]);

  function post() {
    const text = draft.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addMeetingComment(meetingId, text);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setDraft("");
      const fresh = await meetingComments(meetingId);
      if (fresh.ok) setComments(fresh.comments);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeMeetingComment(id);
      if (!result.ok) {
        showToast({ message: result.error });
        return;
      }
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    });
  }

  const list = comments ?? [];

  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-field-label text-sub">
        <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} />
        Comments
        {list.length > 0 && <span className="tabular-nums">· {list.length}</span>}
      </h2>

      {list.map((comment) => (
        <article
          key={comment.id}
          className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-border bg-card p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar
                initials={comment.member?.initials ?? "?"}
                color={comment.member?.color ?? "#87252b"}
                size={26}
              />
              <span className="min-w-0 text-timestamp font-bold text-fg wrap-anywhere">
                {comment.member?.display_name ?? "Somebody"}
              </span>
              <span className="shrink-0 text-timestamp text-sub">
                {formatTimestamp(comment.created_at)}
                {comment.edited_at && " · edited"}
              </span>
            </span>
            {comment.mine && (
              <button
                type="button"
                onClick={() => remove(comment.id)}
                disabled={isPending}
                aria-label="Remove your comment"
                className="inline-grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-sub hover:bg-muted hover:text-danger"
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-[17px] leading-6 text-fg text-pretty wrap-anywhere">
            {comment.body}
          </p>
        </article>
      ))}

      <label htmlFor="meeting-comment" className="sr-only">
        Add a comment
      </label>
      <textarea
        id="meeting-comment"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={2}
        placeholder="Anything to add? This won't change the minutes."
        spellCheck
        className="w-full resize-y rounded-2xl border-[1.5px] border-border bg-card p-3 text-[17px] leading-6 text-fg placeholder:text-sub"
      />
      {draft.trim().length > 0 && (
        <Button size="sm" onClick={post} disabled={isPending} className="w-auto self-start">
          Add comment
        </Button>
      )}
    </div>
  );
}
