"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageSquare, ThumbsUp, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MentionTextarea } from "@/components/tasks/mention-textarea";
import { NoteBody } from "@/components/tasks/note-body";
import {
  addMeetingComment,
  meetingComments,
  removeMeetingComment,
  setMeetingCommentLike,
} from "@/app/meetings/actions";
import type { MeetingComment } from "@/lib/data/meetings";
import type { MemberSummary } from "@/lib/data/tasks";
import { cn, formatTimestamp } from "@/lib/utils";

/**
 * The margin.
 *
 * Only the author writes the minutes — everyone else writes here. Dee sat in
 * on the call, Marcelo wrote it up, and Dee remembers the part about the
 * second depot; without somewhere to put that she either messages him and it
 * is lost, or she does not bother.
 *
 * Mentions and likes, since 0053; threaded replies still not. A mention is
 * what gets Dee's note in front of Marcelo rather than leaving it in a list
 * he might scroll, and a like closes the loop without a second comment saying
 * "yes" — which is what people write instead, and it is worse. A thread is a
 * conversation, and a conversation between four people who sit in the same
 * room is machinery for a problem this team does not have.
 *
 * The `@` picker and the renderer are the Tasklist's, unchanged. Learning one
 * gesture twice is a waste of the person using it, and a second copy of the
 * mention grammar is a second thing to keep in step with the database trigger
 * that reads it.
 */
export function MeetingComments({
  meetingId,
  roster,
}: {
  meetingId: string;
  roster: MemberSummary[];
}) {
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

  /*
    The count moves before the server answers. A like is the cheapest gesture
    in the app and waiting a round trip to see it land makes it feel broken;
    if the write fails the number goes back and the toast says why.
  */
  function toggleLike(comment: MeetingComment) {
    const liked = !comment.liked;
    setComments((prev) =>
      (prev ?? []).map((c) =>
        c.id === comment.id ? { ...c, liked, likes: c.likes + (liked ? 1 : -1) } : c
      )
    );
    startTransition(async () => {
      const result = await setMeetingCommentLike(comment.id, liked);
      if (result.ok) return;
      showToast({ message: result.error });
      setComments((prev) =>
        (prev ?? []).map((c) =>
          c.id === comment.id
            ? { ...c, liked: comment.liked, likes: comment.likes }
            : c
        )
      );
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
          <NoteBody
            body={comment.body}
            className="whitespace-pre-wrap text-[17px] leading-6 text-fg text-pretty wrap-anywhere"
          />

          {/*
            Your own comment can be liked too. It reads as vanity until you
            watch somebody use it: a like on your own line is how you say "yes,
            still true" on a meeting from three weeks ago.
          */}
          <button
            type="button"
            onClick={() => toggleLike(comment)}
            aria-pressed={comment.liked}
            className={cn(
              "inline-flex h-9 w-auto shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-full border-[1.5px] px-2.5 text-timestamp font-bold",
              comment.liked
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-card text-sub hover:bg-muted"
            )}
          >
            <ThumbsUp aria-hidden className="size-4" strokeWidth={comment.liked ? 2.4 : 1.75} />
            {comment.likes > 0 ? (
              <span className="tabular-nums">{comment.likes}</span>
            ) : (
              <span className="sr-only">Like this comment</span>
            )}
          </button>
        </article>
      ))}

      <label htmlFor="meeting-comment" className="sr-only">
        Add a comment
      </label>
      <MentionTextarea
        id="meeting-comment"
        value={draft}
        onValueChange={setDraft}
        onSubmit={post}
        roster={roster}
        rows={2}
        placeholder="Anything to add? Type @ to name somebody. This won't change the minutes."
        spellCheck
        className="field-ring"
      />
      {draft.trim().length > 0 && (
        <Button size="sm" onClick={post} disabled={isPending} className="w-auto self-start">
          Add comment
        </Button>
      )}
    </div>
  );
}
