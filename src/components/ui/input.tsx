"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldStyle =
  "w-full min-h-[60px] px-4 py-3 rounded-2xl bg-card border-[1.5px] border-border text-[18px] leading-7 text-fg " +
  "placeholder:text-sub focus-visible:border-prim focus-visible:outline-[3px] focus-visible:outline-offset-2 " +
  "aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return <input ref={ref} className={cn(fieldStyle, "h-[60px]", className)} {...props} />;
  }
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return <textarea ref={ref} className={cn(fieldStyle, "resize-none", className)} {...props} />;
  }
);
Textarea.displayName = "Textarea";
