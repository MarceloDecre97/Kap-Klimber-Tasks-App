import { Fragment } from "react";
import { splitMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";

/**
 * A note's text as written.
 *
 * Three things happen here that a plain `{body}` would get wrong:
 *
 * `whitespace-pre-wrap` keeps the line breaks someone actually typed. HTML
 * collapses runs of whitespace by default, so without it a four-line note
 * renders as one paragraph — which is exactly the reason people were posting
 * four separate notes instead of one.
 *
 * URLs become links. Notes are where suppliers, products and documents get
 * shared, and a pasted address that cannot be clicked has to be selected and
 * copied by hand on a phone.
 *
 * Mentions become chips. A mention is stored as `@[Keith B](uuid)` so the
 * database can tell which Keith to notify — that token is never something a
 * person should have to look at.
 */

/**
 * Deliberately narrow: http/https only, and never a bare "www." or an email.
 * A link is the one thing on this screen whose text comes from a teammate and
 * whose destination is followed by the browser, so it only matches what it
 * can be certain of. Trailing punctuation is left out of the match, so
 * "see https://example.com/docs." links the address and not the full stop.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?'"])/gi;

/**
 * Mentions are resolved first and links only inside what is left. Doing it
 * the other way round would let the uuid inside a mention token be scanned
 * for URLs, and one combined pattern would have to describe both grammars at
 * once to no benefit.
 */
export function NoteBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className}>
      {splitMentions(body).map((segment, index) =>
        segment.kind === "mention" ? (
          <span
            key={index}
            className={cn(
              "rounded px-1 py-px font-bold text-brand",
              // A tint rather than a border or a pill: a mention sits inside a
              // sentence, and anything with edges would break the line it is
              // part of into pieces.
              "bg-brand/10"
            )}
          >
            @{segment.name}
          </span>
        ) : (
          <Linkified key={index} text={segment.text} />
        )
      )}
    </div>
  );
}

function Linkified({ text }: { text: string }) {
  // `split` with one capture group interleaves text and matches, so every
  // odd index is a URL. No second pass over the string, and no regex state
  // to get wrong — a `g` flag carries `lastIndex` between `.test()` calls.
  const parts = text.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-bold text-brand underline underline-offset-[3px] break-all"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}
