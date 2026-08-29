import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Database, Home, Menu, Table2, UserRound, X } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Home };

const PRIMARY_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/admin/data", label: "Data", icon: Table2 },
];

const OVERFLOW_NAV: NavItem[] = [
  { to: "/admin/data", label: "College database", icon: Database },
  { to: "/auth", label: "Account", icon: UserRound },
];

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-chalk pb-[76px] min-[680px]:pb-0">
      {/* Chrome: top nav on desktop, condensed bar + hamburger on mobile */}
      <header className="sticky top-0 z-40 bg-org-primary text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="touch-target flex items-center gap-2.5">
            <span
              className="grid size-8 place-items-center rounded-md bg-org-accent font-display text-[15px] font-bold text-navy-deep"
              aria-hidden
            >
              P
            </span>
            <span className="font-display text-lg font-bold text-white">Power Recruit</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 min-[680px]:flex">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="touch-target flex items-center rounded-md px-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                activeProps={{ className: "bg-white/12 text-white" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden min-[680px]:block">{right}</div>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="touch-target grid place-items-center rounded-md text-white/85 hover:bg-white/10 hover:text-white"
            >
              {menuOpen ? <Menu className="size-5 hidden" /> : null}
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/10 bg-navy-deep px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col">
              {OVERFLOW_NAV.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="touch-target flex items-center gap-3 rounded-md px-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              ))}
              <div className="py-2 min-[680px]:hidden">{right}</div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      {/* Fixed bottom tab bar below ~680px */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-white shadow-[0_-4px_20px_-8px_rgba(18,35,58,0.25)] min-[680px]:hidden"
      >
        {[
          { to: "/", label: "Home", icon: Home, exact: true },
          { to: "/admin/data", label: "Data", icon: Table2, exact: false },
          { to: "/admin/data", label: "Colleges", icon: Database, exact: false },
          { to: "/auth", label: "Account", icon: UserRound, exact: false },
        ].map((item, index) => (
          <Link
            key={`${item.label}-${index}`}
            to={item.to}
            className={cn(
              "touch-target flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-steel",
            )}
            activeProps={{ className: "text-org-primary" }}
            activeOptions={{ exact: item.exact }}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
