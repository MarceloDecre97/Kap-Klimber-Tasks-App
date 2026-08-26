"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center w-14 h-14 rounded-2xl shrink-0",
          "bg-card border-[1.5px] border-border text-fg cursor-pointer",
          "transition-transform duration-150 ease-out active:scale-[0.97] hover:bg-muted",
          className
        )}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";
