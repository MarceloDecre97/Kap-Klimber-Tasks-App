"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "destructive" | "ghost" | "link";
type Size = "lg" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold cursor-pointer select-none " +
  "transition-[transform,background-color,color,opacity] duration-150 ease-out " +
  "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-100";

/*
  Primary is brand red with a white label in light mode, and the inverse —
  white with a brand red label — in dark. Marcelo's call.

  Hover differs by theme because the same gesture does not read the same way
  on both: light darkens the fill, dark keeps the white and draws a silver
  edge. A white button that greys on hover looks disabled rather than
  hovered, which is the opposite of what a hover state is for.

  The reason the label was unreadable in *both* themes was never the colours
  — it was `cn()` deleting the `text-on-*` class as a font-size conflict. See
  the note in utils.ts. These tokens are kept regardless: they are what makes
  the pair explicit rather than inherited.

  A disabled button still has to be readable.

  `disabled:opacity-100` in the base means the disabled look comes entirely
  from these colours rather than from fading, which is right — a faded button
  on a phone in daylight is unreadable — but it also means the pair has to
  carry the contrast on its own. `text-sub` on `bg-muted` is 6.9:1 in light
  and thinner than it looks at button weight, so both disabled states use
  `muted-fg` instead: 9.5:1 in light, 11:1 in dark.

  The enabled colours are stated explicitly rather than inherited. A button
  whose label falls back to `text-fg` over `bg-prim` is near-black on
  near-black, which is exactly the failure this is guarding against.
*/
const variants: Record<Variant, string> = {
  primary:
    "bg-btn text-on-btn border-[1.5px] border-transparent " +
    "hover:bg-btn-hover hover:border-btn-edge active:bg-btn-active " +
    "disabled:bg-muted disabled:text-muted-fg disabled:border-border disabled:border",
  secondary:
    "bg-card text-fg border-[1.5px] border-fg hover:bg-muted active:bg-muted " +
    "disabled:bg-muted disabled:text-muted-fg disabled:border-border",
  destructive:
    "bg-card text-danger border-[1.5px] border-danger hover:bg-[var(--color-danger-hover-bg)] active:bg-[var(--color-danger-active-bg)] " +
    "disabled:bg-muted disabled:text-muted-fg disabled:border-border",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-muted",
  link: "bg-transparent text-brand underline underline-offset-[3px] p-0 h-auto",
};

const sizes: Record<Size, string> = {
  lg: "h-[60px] px-5 text-[20px] leading-7 w-full",
  md: "h-14 px-4 text-chip",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "lg", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, variants[variant], variant !== "link" && sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
