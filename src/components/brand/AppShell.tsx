import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Database,
  Home,
  LayoutDashboard,
  Lightbulb,
  Mail,
  ListChecks,
  Menu,

  Palette,
  Search,
  Table2,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { OrgTheme } from "@/components/brand/OrgTheme";
import { OrgMark } from "@/components/brand/OrgMark";
import { SportSwitch } from "@/components/brand/SportSwitch";
import { useSportMode } from "@/hooks/use-sport-mode";
import { getAthleteSportMix } from "@/lib/athletes.functions";
import { ActingOrgBar } from "@/components/brand/ActingOrgBar";
import { CompareTray } from "@/components/compare/CompareTray";
import { useMyAccount } from "@/hooks/use-my-account";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { isOrgManagerRole, isOwnerRole } from "@/lib/roles";
import { cn } from "@/lib/utils";


type NavItem = { to: string; label: string; icon: typeof Home };

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { account } = useMyAccount();
  const { branding } = useOrgBranding();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const role = account?.primaryRole ?? null;
  const actingOrg = account?.actingOrg ?? null;
  // Power Recruit staff see the console — unless they have entered an
  // organization, in which case they run it as its owner.
  const isStaff = Boolean(account?.isSuperadmin) && !actingOrg;
  const isOrgManager = isOrgManagerRole(role);
  const isOrgOwner = isOwnerRole(role);
  

  // The superadmin console always shows the fixed Power Recruit identity —
  // never an organization's colors or logo, whatever the database holds.
  const consoleView = pathname === "/admin" || pathname.startsWith("/admin/");
  const themed = !isStaff && !consoleView;
  const orgLogo = themed ? branding?.logoUrl : null;
  const orgName = themed ? branding?.name : null;


  const primaryNav: NavItem[] = [
    { to: "/", label: "Home", icon: Home },
    { to: "/search", label: "Search", icon: Search },
    ...(isOrgManager
      ? [
          { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { to: "/intelligence", label: "Intelligence", icon: Lightbulb },
          { to: "/roster", label: "Roster", icon: Users },
          { to: "/list", label: "College list", icon: ListChecks },
        ]
      : []),
    ...(role === "parent" || role === "player"
      ? [
          { to: "/list", label: "College list", icon: ListChecks },
          { to: "/family", label: "Family portal", icon: Database },
        ]
      : []),

    ...(isStaff ? [{ to: "/admin", label: "Console", icon: Table2 }] : []),

  ];

  const overflowNav: NavItem[] = [
    ...(isStaff ? [{ to: "/admin/universities", label: "College database", icon: Database }] : []),
    ...(isOrgManager ? [{ to: "/settings/team", label: "Team & invites", icon: Mail }] : []),
    ...(isOrgOwner
      ? [{ to: "/settings/branding", label: "Branding settings", icon: Palette }]
      : []),

    ...(role === "parent" || role === "player"
      ? [{ to: "/family", label: "Family portal", icon: Database }]
      : []),
    { to: "/auth", label: "Account", icon: UserRound },
  ];

  const tabs = [
    { to: "/", label: "Home", icon: Home, exact: true },
    { to: "/search", label: "Search", icon: Search, exact: false },
    ...(isStaff
      ? [{ to: "/admin", label: "Console", icon: Table2, exact: true }]
      : isOrgManager
        ? [{ to: "/roster", label: "Roster", icon: Users, exact: false }]
        : [{ to: "/list", label: "My list", icon: ListChecks, exact: false }]),
    { to: "/auth", label: "Account", icon: UserRound, exact: false },
  ];

  return (
    <OrgTheme
      primaryColor={themed ? (branding?.primary ?? null) : null}
      accentColor={themed ? (branding?.accent ?? null) : null}
    >
    <div className="min-h-screen bg-chalk pb-[76px] min-[680px]:pb-0">
      {actingOrg ? <ActingOrgBar name={actingOrg.name} /> : null}

      {/* Chrome: top nav on desktop, condensed bar + hamburger on mobile */}
      <header className="sticky top-0 z-40 bg-org-primary text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="touch-target flex items-center gap-2.5">
            <OrgMark
              logoUrl={orgLogo ?? null}
              name={orgName ?? null}
              size={32}
              className={orgLogo ? "bg-white/10" : undefined}
            />
            <span className="font-display text-lg font-bold text-white">Power Recruit</span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 min-[680px]:flex">
            {primaryNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="touch-target relative flex items-center rounded-md px-3 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                activeProps={{
                  className:
                    "bg-white/10 text-white after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:rounded-full after:bg-org-accent",
                }}
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
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/10 bg-navy-deep px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col">
              {overflowNav.map((item) => (
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
        {tabs.map((item, index) => (
          <Link
            key={`${item.label}-${index}`}
            to={item.to}
            className={cn(
              "touch-target flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-steel",
            )}
            activeProps={{ className: "text-org-accent-strong" }}
            activeOptions={{ exact: item.exact }}
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </nav>

      <CompareTray />
    </div>
    </OrgTheme>
  );
}
