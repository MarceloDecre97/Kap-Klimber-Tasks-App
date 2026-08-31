/**
 * A note's text as written.
 *
 * Two things happen here that a plain `{body}` would get wrong:
 *
 * `whitespace-pre-wrap` keeps the line breaks someone actually typed. HTML
 * collapses runs of whitespace by default, so without it a four-line note
 * renders as one paragraph — which is exactly the reason people were posting
 * four separate notes instead of one.
 *
 * URLs become links. Notes are where suppliers, products and documents get
 * shared, and a pasted address that cannot be clicked has to be selected and
 * copied by hand on a phone.
 */

/**
 * Deliberately narrow: http/https only, and never a bare "www." or an email.
 * A link is the one thing on this screen whose text comes from a teammate and
 * whose destination is followed by the browser, so it only matches what it
 * can be certain of. Trailing punctuation is left out of the match, so
 * "see https://example.com/docs." links the address and not the full stop.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?'"])/gi;

export function NoteBody({ body, className }: { body: string; className?: string }) {
  // `split` with one capture group interleaves text and matches, so every
  // odd index is a URL. No second pass over the string, and no regex state
  // to get wrong — a `g` flag carries `lastIndex` between `.test()` calls.
  const parts = body.split(URL_PATTERN);

  return (
    <div className={className}>
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
          part
        )
      )}
    </div>
  );
}
