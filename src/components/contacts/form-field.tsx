import { cn } from "@/lib/utils";

/**
 * The labelled group and the labelled field, shared by every form in the
 * address book.
 *
 * They started inside contact-form.tsx and moved here the moment a second
 * form needed them. Two copies of a field wrapper is two error outlines that
 * drift apart — one gets the fix and the other quietly stops matching.
 */
export function Group({
  heading,
  hint,
  children,
}: {
  heading: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-section-heading text-fg">{heading}</h2>
        {hint && <p className="text-[16px] leading-6 text-sub text-pretty">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Outlines the field and prints the reason under it. */
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className={cn("text-field-label", error ? "text-danger" : "text-fg")}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {/*
        The outline is drawn by a wrapper rather than by reaching into the
        input, so every control gets the same treatment whatever it is —
        and the app's focus ring still wins when the field is focused.
      */}
      <span className={cn("flex flex-col rounded-2xl", error && "outline-2 outline-offset-2 outline-danger")}>
        {children}
      </span>
      {error ? (
        <span className="text-[16px] leading-6 font-bold text-danger text-pretty">{error}</span>
      ) : (
        hint && <span className="text-timestamp text-sub text-pretty">{hint}</span>
      )}
    </label>
  );
}
