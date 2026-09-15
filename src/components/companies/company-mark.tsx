import {
  COMPANY_TYPE_ICONS,
  DEFAULT_COMPANY_TYPE_ICON,
  type CompanySummary,
} from "@/lib/companies-view";
import { cn } from "@/lib/utils";

/**
 * The square beside a company: its own mark if we have one, its type's icon
 * if we do not.
 *
 * The fallback is not a degraded state. Most icons on the web are a letter in
 * a box, and the type icon at least says what kind of company it is — which
 * is more than a blurred W would. See 0042.
 */
export function CompanyMark({
  company,
  logo,
  size = 44,
  className,
}: {
  company: CompanySummary;
  /** A data: URI. Absent for a company nobody has fetched one for. */
  logo?: string;
  size?: number;
  className?: string;
}) {
  const Icon = COMPANY_TYPE_ICONS[company.types[0]?.icon ?? ""] ?? DEFAULT_COMPANY_TYPE_ICON;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-border bg-muted text-sub",
        className
      )}
      style={{ width: size, height: size }}
    >
      {logo ? (
        /*
          Contained rather than cropped, and on the muted ground rather than
          on white: a favicon is usually a mark with its own padding, and
          stretching it to the corners makes a set of them look like a jumble
          of different sizes. `alt` is empty because the company's name is
          already the next thing on the row — announcing it twice is worse
          than announcing it once.

          A plain img, not next/image: these are data: URIs a few kilobytes
          long that are already in the payload. There is nothing to optimise
          and nothing to fetch.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="size-full object-contain p-1"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Icon className="size-[22px]" strokeWidth={1.75} />
      )}
    </span>
  );
}
