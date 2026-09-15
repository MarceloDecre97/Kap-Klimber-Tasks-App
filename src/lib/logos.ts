import "server-only";

/**
 * Fetching a company's own mark from its own website.
 *
 * Run once per company and the result is kept — see 0042 for why not a
 * favicon service and why not a hotlink. What lives here is the awkward part:
 * this code follows a URL that somebody typed into a form, so it is the one
 * place in the app that makes an outbound request to an address a user chose.
 * Everything below is written with that in mind.
 */

/**
 * What an image actually starts with.
 *
 * The first version trusted the content-type header and got nothing from
 * thirty-one real websites. Half of them serve a .ico as
 * application/octet-stream, which is not a lie exactly — it is a file of
 * bytes — but it is not in any allowlist either. The bytes themselves are the
 * one thing that cannot be got wrong, so they are what decides now.
 *
 * It also fails safe in the other direction: an HTML error page served with
 * `content-type: image/png` has no signature here and is refused, which the
 * header check could not have caught.
 */
const SIGNATURES: { type: string; match: (b: Buffer) => boolean }[] = [
  { type: "image/png", match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/x-icon", match: (b) => b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00 },
  { type: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", match: (b) => b.subarray(0, 6).toString("latin1").startsWith("GIF8") },
  { type: "image/webp", match: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

/**
 * SVG, allowed now, sanitised.
 *
 * It was refused outright and that turned out to cost real icons: a lot of
 * sites now ship favicon.svg and nothing else. An <img src> will not run
 * script in an SVG in any current browser — the tag is a picture, not a
 * document — so the risk was always theoretical. It is cheap to close
 * anyway: anything that could execute comes out before the bytes are stored,
 * and what is left is shapes.
 */
const SVG_DANGEROUS = /<\s*(script|foreignObject|iframe|use)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|foreignObject|iframe|use)\b[^>]*\/?>|\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)|(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi;

/** At least one thing that puts ink on the page. */
const SVG_DRAWS = /<\s*(path|circle|rect|ellipse|line|polyline|polygon|text|image|symbol)\b/i;

function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}

const MAX_BYTES = 140_000;
const MAX_HTML_BYTES = 300_000;
/*
  Three seconds, and two candidates at most.

  The first version allowed six seconds across four fetches, which is up to
  twenty-four seconds inside one request — past what the host will run before
  it kills the function, and a killed function is a sweep that stops at the
  first slow website. A site that cannot hand over an icon in three seconds
  is a site whose icon we can live without.
*/
const TIMEOUT_MS = 3000;
const MAX_CANDIDATES = 2;

/**
 * A website we are willing to ask for a picture.
 *
 * https only, and nothing that points back inside. A company's website is
 * typed into a form by hand, so "http://localhost:3000/admin" is a thing
 * somebody could put there — and this code runs on the server, where that
 * address means something quite different from what they would see.
 *
 * Hostname checks rather than resolution: this cannot stop a domain that
 * resolves to a private address, and does not pretend to. It stops the
 * straightforward mistakes and the straightforward abuse, which is what the
 * field's threat model actually is — four people typing in the websites of
 * trailer manufacturers.
 */
const BLOCKED_HOSTS = /^(localhost|.*\.local|.*\.internal|metadata\..*)$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function safeWebsite(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (BLOCKED_HOSTS.test(url.hostname)) return null;

  const ip = IPV4.exec(url.hostname);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || a === 169) return null;
    if (a === 192 && b === 168) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
  }
  /* Bracketed IPv6 covers ::1 and the unique-local range in one go. */
  if (url.hostname.startsWith("[")) return null;
  return url;
}

async function get(url: URL, accept: string): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      /*
        A browser's user agent, because the honest one got 403s.

        Ryder, FedEx, UPS and Walmart all sit behind a CDN that refuses
        anything it does not recognise, and "Kap-Klimber-Tasks/1.0" is not a
        browser. This is not pretending to be a person — the request is for
        one public icon, once, and it is the same request a browser makes
        when it renders their tab.
      */
      headers: {
        accept,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? response : null;
  } catch {
    /* A site that is down, slow or rude is not an error worth surfacing. */
    return null;
  }
}

/**
 * Where a site says its icon is, best first.
 *
 * apple-touch-icon before the rest on purpose: it is meant to be a tile, so
 * it is square, sized for a screen rather than a browser tab, and looks like
 * the company rather than like a smudge. A 16px favicon in a 44px box is the
 * thing this change exists to stop.
 *
 * Read with a regex rather than a parser. The alternative is a dependency
 * for one job on one line of somebody's <head>, and a malformed match here
 * costs nothing — the URL is checked again before it is fetched, and the
 * bytes are checked again before they are stored.
 */
export function iconCandidates(html: string, base: URL): string[] {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const scored: { href: string; score: number }[] = [];

  for (const tag of links) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref\s*=\s*["']([^"']+)/i.exec(tag)?.[1];
    if (!href) continue;
    if (!/\b(icon|apple-touch-icon|apple-touch-icon-precomposed|shortcut icon|mask-icon)\b/.test(rel)) {
      continue;
    }
    if (/mask-icon/.test(rel)) continue;

    const sizes = /\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const size = sizes ? Number(sizes) : 0;
    /* Apple's tile wins, then the biggest declared size, then anything. */
    const score = (/apple-touch-icon/.test(rel) ? 1000 : 0) + Math.min(size, 512);
    scored.push({ href, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { href } of scored) {
    try {
      const absolute = new URL(href, base).toString();
      if (!seen.has(absolute)) {
        seen.add(absolute);
        out.push(absolute);
      }
    } catch {
      /* A href we cannot resolve is a href we do not want. */
    }
  }
  /* Every site has this whether it says so or not. Last, because it is the
     16px tab smudge when a better one was on offer. */
  const fallback = new URL("/favicon.ico", base).toString();
  if (!seen.has(fallback)) out.push(fallback);
  return out;
}

export interface FetchedLogo {
  dataUri: string;
  contentType: string;
  sourceUrl: string;
}

/**
 * Bytes off the wire, checked and encoded.
 *
 * Split out from the fetching so the rules can be tested without a network:
 * what is accepted, what is refused and what the stored string looks like are
 * the parts worth proving, and they do not need a server to prove.
 */
export function encodeLogo(buffer: Buffer, sourceUrl: string): FetchedLogo | null {
  /*
    Size first, and measured on the bytes that arrived rather than on
    content-length, which is a claim.
  */
  if (buffer.length < 4 || buffer.length > MAX_BYTES) return null;

  const signature = SIGNATURES.find((s) => s.match(buffer));
  if (signature) {
    return {
      dataUri: `data:${signature.type};base64,${buffer.toString("base64")}`,
      contentType: signature.type,
      sourceUrl,
    };
  }

  if (looksLikeSvg(buffer)) {
    const cleaned = buffer.toString("utf8").replace(SVG_DANGEROUS, "");
    /* Still an SVG after the dangerous parts came out, or it was not one. */
    if (!/<svg[\s>]/i.test(cleaned)) return null;
    /*
      And still a picture. An SVG whose only content was a <script> cleans
      down to an empty one — harmless, but it would draw a blank square where
      the type mark used to be, and a blank square reads as broken. Nothing
      left to draw means we never had an icon.
    */
    if (!SVG_DRAWS.test(cleaned)) return null;
    return {
      dataUri: `data:image/svg+xml;base64,${Buffer.from(cleaned, "utf8").toString("base64")}`,
      contentType: "image/svg+xml",
      sourceUrl,
    };
  }

  /* Not a picture. An HTML 404 wearing an image header lands here. */
  return null;
}

/** The bytes, fetched. `reached` says whether the server answered at all. */
async function download(candidate: string): Promise<{ logo: FetchedLogo | null; reached: boolean }> {
  const url = safeWebsite(candidate);
  if (!url) return { logo: null, reached: false };

  const response = await get(url, "image/*");
  if (!response) return { logo: null, reached: false };

  return {
    logo: encodeLogo(Buffer.from(await response.arrayBuffer()), url.toString()),
    reached: true,
  };
}

/**
 * Why nothing came back.
 *
 * Reported rather than swallowed, because the first version of this returned
 * a bare null and got nothing from thirty-one websites — which left no way
 * to tell a site that blocks us from a site with no icon from a bug in our
 * own code. The sweep tallies these and says so.
 */
export type LogoFailure =
  | "no-website"
  | "site-unreachable"
  | "icon-unreachable"
  | "not-an-image";

export type LogoResult =
  | { ok: true; logo: FetchedLogo }
  | { ok: false; reason: LogoFailure };

/**
 * A company's icon, or the reason there isn't one.
 *
 * Failing is an ordinary outcome, not an error: plenty of sites publish
 * nothing usable, and the type mark the book already draws is a perfectly
 * good answer. Nothing here throws.
 */
export async function fetchCompanyLogo(website: string | null): Promise<LogoResult> {
  const site = safeWebsite(website);
  if (!site) return { ok: false, reason: "no-website" };

  const page = await get(site, "text/html");
  let candidates: string[];

  if (page && (page.headers.get("content-type") ?? "").includes("text/html")) {
    const html = (await page.text()).slice(0, MAX_HTML_BYTES);
    candidates = iconCandidates(html, site);
  } else {
    /* The page refused us, but /favicon.ico is often served by something else. */
    candidates = [new URL("/favicon.ico", site).toString()];
  }

  let reached = false;
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    const attempt = await download(candidate);
    if (attempt.logo) return { ok: true, logo: attempt.logo };
    if (attempt.reached) reached = true;
  }
  /*
    Told apart on purpose. "We were refused" is somebody else's CDN and there
    is nothing to fix here; "we got bytes that were not a picture" is ours.
  */
  return { ok: false, reason: reached ? "not-an-image" : "icon-unreachable" };
}

/**
 * One URL, fetched and checked — for when somebody says which image to use.
 *
 * The sweep guesses from a site's <head>; this is the answer to the sweep
 * guessing wrong. Liddell's favicon is the WordPress logo, which is a mark
 * the auto-fetch will happily and confidently store, and is worse than no
 * mark at all because it looks deliberate.
 *
 * Same checks as everything else here: https only, nothing pointing inside,
 * a timeout, a size cap, and the bytes decide what it is.
 */
export async function fetchLogoFromUrl(raw: string): Promise<LogoResult> {
  const url = safeWebsite(raw);
  if (!url) return { ok: false, reason: "no-website" };

  const response = await get(url, "image/*");
  if (!response) return { ok: false, reason: "icon-unreachable" };

  const logo = encodeLogo(Buffer.from(await response.arrayBuffer()), url.toString());
  return logo ? { ok: true, logo } : { ok: false, reason: "not-an-image" };
}

/**
 * Bytes that arrived as a data: URI from the browser, checked as if they had
 * come off the wire.
 *
 * The picker shrinks an image before sending it, which means the bytes were
 * last touched by code running on somebody's phone — so they get exactly the
 * same treatment as a stranger's web server. The browser saying "image/png"
 * is not evidence; the signature is.
 */
export function decodeDataUri(raw: string): FetchedLogo | null {
  const match = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?;base64,([a-z0-9+/=]+)$/i.exec(
    raw.trim()
  );
  if (!match) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2]!, "base64");
  } catch {
    return null;
  }
  return encodeLogo(buffer, "uploaded");
}
