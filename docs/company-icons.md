# A company's own mark

## Why the bytes live here

Three ways to put a company's icon on its card:

1. **A favicon service** — `google.com/s2/favicons?domain=ryder.com`. One line
   of code, and every page view tells a third party the list of who Opus Kap
   does business with. Not for a private address book at a company with a
   patent and an OEM partner.
2. **Hotlink their `/favicon.ico`** — does the same to them, breaks when they
   redesign, and makes our page wait on somebody else's server.
3. **Fetch it once and keep it.** More work, and the only one with no
   third party in the render path.

Third, then. The bytes are base64 in a `data:` URI in the database. A favicon
is measured in single kilobytes and a four-person company's book will hold
dozens, not thousands — this is not a CDN problem pretending to be small.

A table of its own rather than a column on `companies`, because a company is
embedded inside **every contact the book returns**. A kilobyte of base64 on
`companies` would be a kilobyte on the wire once per person who works there.

## Following a URL somebody typed

`fetchCompanyLogo` is the one place in the app that makes an outbound request
to an address a user chose, so it is written for that:

- **https only.** No `http`, no `file:`, no anything else.
- **Nothing that points back inside.** localhost, `.local`, `.internal`,
  `metadata.*`, the private IPv4 ranges, link-local, and any IPv6 literal.
  This is hostname checking, not resolution — it cannot stop a public domain
  that resolves to a private address and does not pretend to. It stops the
  realistic cases, which is four people typing in the websites of trailer
  manufacturers.
- **Six-second timeout, three candidates at most, 140KB cap** — checked on
  the bytes that actually arrived, not on the `content-length` header, which
  is a claim.
- **A short list of image types, and no SVG.** An `<img src>` will not run
  script in an SVG in any current browser, so this is belt and braces rather
  than a known hole — but we would be storing and serving back arbitrary
  markup from a third party, and every company worth an icon also ships a PNG
  or an ICO.
- **Nothing throws.** "No icon" is an ordinary answer. The letter-and-type
  mark was never broken.

## Which icon

`apple-touch-icon` first, then the biggest declared `sizes`, then whatever is
left, then `/favicon.ico`. The Apple tile is meant to be a home-screen icon,
so it is square, sized for a screen rather than a browser tab, and looks like
the company. A 16px favicon in a 44px box is the thing this change exists to
stop.

Read with a regex rather than an HTML parser: a dependency for one line of
somebody's `<head>` is not worth it, and a bad match costs nothing — the URL
is checked again before it is fetched and the bytes again before they are
stored.

## One at a time

The button fetches one company per call and loops in the browser. Thirty-odd
sites inside a single request is a request that times out on somebody's phone
halfway through and leaves you guessing which ones landed. A loop shows
progress and can be walked away from.

It is only offered for companies that have a website and no mark yet, so
pressing it twice costs nothing and there is no way to re-fetch the whole book
by accident.

## Why the first attempt got nothing

Thirty-one companies, zero icons, nothing written. Four things were wrong,
and any one of them alone would have cost most of the book:

1. **The sweep had no try/catch.** A rejected server action takes the whole
   loop down with it, so one slow website stopped everything at company one
   — and the toast never appeared either, which is why it looked like a
   silent "nothing found" rather than a crash.
2. **The route's time budget was the default.** The fetch allowed up to four
   requests at six seconds each, which is longer than the host will run a
   function before killing it. Now three seconds, two candidates, and a
   minute of headroom on the route.
3. **It trusted the content-type header.** A great many sites serve a `.ico`
   as `application/octet-stream` — not a lie, just not in any allowlist. The
   bytes are what decide now: PNG, ICO, JPEG, GIF and WEBP are recognised by
   their signatures, so the header cannot get it wrong in either direction.
   An HTML error page labelled `image/png` is refused for the same reason.
4. **It sent an honest user agent.** Ryder, FedEx, UPS and Walmart sit behind
   CDNs that refuse anything that is not a browser.

And SVG, refused outright before, is now accepted and sanitised — a lot of
sites ship `favicon.svg` and nothing else. Script tags, event handlers,
`javascript:` hrefs, `foreignObject`, `iframe` and `use` come out before the
bytes are stored, and an SVG with nothing left to draw is refused rather than
stored as a blank square.

The sweep now reports **why**, not just how many: "No icons · 22 refused the
request, 9 sent something that was not an image" is a sentence that can be
acted on. "No icons found" was not.

## What could not be verified here

The container this was built in refuses outbound connections to arbitrary
hosts, so **the live fetch is untested against real sites**. What is tested,
on fixtures: every refusal rule, the candidate ranking, the content-type and
size rules, and that the largest allowed image still fits the column
(186,690 characters against a 200,000 cap).

Whether Ryder's server actually hands over a usable PNG is answered the first
time somebody presses the button. The downside of it not doing so is nil —
the company keeps the mark it has today.
