import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Instructions that used to sit under every heading as a grey sentence.
 * The heading stays short; the explanation shows on hover, on keyboard focus,
 * or on tap. Nothing is lost — it just stops crowding the page.
 */
export function HelpTip({
  children,
  label = "What this is",
  className,
  align = "left",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "grid size-5 place-items-center rounded-full text-steel transition-colors hover:text-org-accent focus:outline-none focus-visible:text-org-accent",
          open && "text-org-accent",
        )}
      >
        <HelpCircle className="size-4" aria-hidden />
      </button>
      {open ? (
        <span
          role="tooltip"
          className={cn(
            "surface-raised absolute top-7 z-40 w-64 rounded-lg border border-border p-3 text-left text-xs leading-relaxed font-normal text-steel normal-case shadow-[0_18px_40px_-20px_rgba(0,0,0,0.75)] sm:w-72",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
