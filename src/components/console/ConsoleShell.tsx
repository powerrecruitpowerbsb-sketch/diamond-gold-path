import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";

import { AuthButton } from "@/components/brand/AuthButton";
import { cn } from "@/lib/utils";

export type ConsoleNavItem = { to: string; label: string; exact?: boolean; count?: number };
export type ConsoleNavSection = { label: string; to?: string; count?: number; items?: ConsoleNavItem[] };

/**
 * The staff console frame: a fixed 220px sidebar and a 24px content gutter.
 * The old top strip overflowed once the console passed a dozen sections.
 */
export function ConsoleShell({
  sections,
  children,
}: {
  sections: ConsoleNavSection[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-chalk">
      <header className="flex items-center gap-3 border-b border-border bg-navy-deep px-4 py-2 text-white">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close sections" : "Open sections"}
          aria-expanded={open}
          className="touch-target grid place-items-center rounded text-white/85 hover:bg-white/10 lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Link to="/admin" className="font-display text-base font-bold text-white">
          Curve Recruit
        </Link>
        <span className="meta text-white/50">Staff console</span>
        <div className="ml-auto">
          <AuthButton />
        </div>
      </header>

      <div className="flex">
        <nav
          aria-label="Console sections"
          className={cn(
            "w-[220px] shrink-0 border-r border-border bg-card px-2 py-3 lg:block",
            "fixed inset-y-0 top-[45px] z-30 overflow-y-auto lg:sticky lg:top-0 lg:h-[calc(100vh-45px)]",
            open ? "block" : "hidden",
          )}
        >
          {sections.map((section) => (
            <div key={section.label} className="mb-4">
              {section.to ? (
                <Link
                  to={section.to}
                  onClick={() => setOpen(false)}
                  activeOptions={{ exact: true }}
                  activeProps={{ className: "bg-muted text-org-primary" }}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-[11px] font-semibold tracking-wide text-steel uppercase hover:bg-muted"
                >
                  <span>{section.label}</span>
                  {section.count ? (
                    <span className="tabular text-[11px] font-semibold text-seam-red">
                      {section.count.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <p className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold tracking-wide text-steel uppercase">
                  <span>{section.label}</span>
                  {section.count ? (
                    <span className="tabular font-semibold text-seam-red">
                      {section.count.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </p>
              )}

              {(section.items ?? []).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  activeOptions={{ exact: item.exact ?? false }}
                  activeProps={{ className: "bg-muted font-semibold text-org-primary" }}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-graphite hover:bg-muted"
                >
                  <span className="truncate">{item.label}</span>
                  {item.count ? (
                    <span className="tabular shrink-0 text-xs font-semibold text-steel">
                      {item.count.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
