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

/** Raw bytes we will accept. No SVG — see below. */
const IMAGE_TYPES = [
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/*
  SVG is deliberately absent.

  An <img src> will not run script in an SVG in any current browser, so this
  is belt and braces rather than a known hole — but the file is arbitrary
  markup from a third party that we would be storing and serving back, and
  the whole point of holding the bytes ourselves is not to be at the mercy of
  what somebody else's server hands over. Every company worth an icon also
  ships a PNG or an ICO.
*/

const MAX_BYTES = 140_000;
const MAX_HTML_BYTES = 300_000;
const TIMEOUT_MS = 6000;

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
      headers: { accept, "user-agent": "Kap-Klimber-Tasks/1.0 (address book icon fetch)" },
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
export function encodeLogo(
  buffer: Buffer,
  rawContentType: string,
  sourceUrl: string
): FetchedLogo | null {
  const type = (rawContentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return null;

  /*
    Checked after the fact as well as by the header: content-length is a
    claim, and the only number that matters is how much actually arrived.
  */
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;

  return {
    dataUri: `data:${type};base64,${buffer.toString("base64")}`,
    contentType: type,
    sourceUrl,
  };
}

/** The bytes, fetched, or null if the site had nothing usable. */
async function download(candidate: string): Promise<FetchedLogo | null> {
  const url = safeWebsite(candidate);
  if (!url) return null;

  const response = await get(url, "image/*");
  if (!response) return null;

  return encodeLogo(
    Buffer.from(await response.arrayBuffer()),
    response.headers.get("content-type") ?? "",
    url.toString()
  );
}

/**
 * A company's icon, or null.
 *
 * Null is an ordinary outcome, not a failure: plenty of sites have no icon
 * worth the name, and the letter mark the book already draws is a perfectly
 * good answer. Nothing here throws.
 */
export async function fetchCompanyLogo(website: string | null): Promise<FetchedLogo | null> {
  const site = safeWebsite(website);
  if (!site) return null;

  const page = await get(site, "text/html");
  let candidates: string[];

  if (page && (page.headers.get("content-type") ?? "").includes("text/html")) {
    const html = (await page.text()).slice(0, MAX_HTML_BYTES);
    candidates = iconCandidates(html, site);
  } else {
    candidates = [new URL("/favicon.ico", site).toString()];
  }

  /* Three at most. Past that a site is telling us it has nothing. */
  for (const candidate of candidates.slice(0, 3)) {
    const logo = await download(candidate);
    if (logo) return logo;
  }
  return null;
}
