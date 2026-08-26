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

const variants: Record<Variant, string> = {
  primary:
    "bg-prim text-on-prim border border-transparent hover:bg-prim-hover active:bg-prim-active " +
    "disabled:bg-muted disabled:text-sub disabled:border-border disabled:border",
  secondary:
    "bg-card text-fg border-[1.5px] border-fg hover:bg-muted active:bg-muted " +
    "disabled:text-sub disabled:border-border",
  destructive:
    "bg-card text-danger border-[1.5px] border-danger hover:bg-[var(--color-danger-hover-bg)] active:bg-[var(--color-danger-active-bg)]",
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
