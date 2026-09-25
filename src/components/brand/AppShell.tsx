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


type NavItem = { to: string; label: string; icon: typeof Search };

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { account } = useMyAccount();
  const { branding } = useOrgBranding();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const role = account?.primaryRole ?? null;
  const actingOrg = account?.actingOrg ?? null;
  // Curve Recruit staff see the console — unless they have entered an
  // organization, in which case they run it as its owner.
  const isStaff = Boolean(account?.isSuperadmin) && !actingOrg;
  const isOrgManager = isOrgManagerRole(role);
  const isOrgOwner = isOwnerRole(role);
  

  // The superadmin console always shows the fixed Curve Recruit identity —
  // never an organization's colors or logo, whatever the database holds.
  const consoleView = pathname === "/admin" || pathname.startsWith("/admin/");
  const themed = !isStaff && !consoleView;
  const orgLogo = themed ? branding?.logoUrl : null;
  const orgName = themed ? branding?.name : null;

  // One sport at a time, for everyone working inside an organization. The
  // switch only appears once the club actually has players in both sports.
  const { sport, setSport } = useSportMode();
  const orgSide = themed && (isOrgManager || Boolean(actingOrg));
  const fetchSportMix = useServerFn(getAthleteSportMix);
  const { data: sportMix } = useQuery({
    queryKey: ["athlete-sport-mix", actingOrg?.id ?? "self"],
    queryFn: () => fetchSportMix(),
    enabled: orgSide,
    staleTime: 60_000,
  });
  // Always available to anyone running an organization, on every page — a club
  // needs to reach its softball side before it has a single softball player.
  const showSportSwitch = orgSide;
  void sportMix;


  const primaryNav: NavItem[] = [
    ...(role === "player" ? [{ to: "/athlete", label: "My hub", icon: Home }] : []),
    { to: "/search", label: "Search", icon: Search },
    ...(isOrgManager
      ? [
          { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { to: "/intelligence", label: "Intelligence", icon: Lightbulb },
          { to: "/roster", label: "Roster", icon: Users },
          { to: "/list", label: "College list", icon: ListChecks },
        ]
      : []),
    ...(role === "player" ? [{ to: "/list", label: "My colleges", icon: ListChecks }] : []),
    ...(role === "parent"
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
    ...(role === "player" ? [{ to: "/athlete", label: "Hub", icon: Home, exact: false }] : []),
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
      sport={themed ? sport : null}
    >
    <div className="min-h-screen bg-chalk pb-[76px] min-[680px]:pb-0">
      {actingOrg ? <ActingOrgBar name={actingOrg.name} /> : null}

      {/* Chrome: top nav on desktop, condensed bar + hamburger on mobile */}
      {/* Dark chrome, brand-lit: the club's color marks the active tab and the
          top hairline rather than flooding the whole bar. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-deep text-white shadow-[0_1px_0_color-mix(in_srgb,var(--org-primary)_40%,transparent)]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="touch-target flex items-center gap-2.5">
            <OrgMark
              logoUrl={orgLogo ?? null}
              name={orgName ?? null}
              size={32}
              className={orgLogo ? "bg-white/10" : undefined}
            />
            <span className="font-display text-lg font-bold text-white">Curve Recruit</span>
          </Link>

          {showSportSwitch ? (
            <SportSwitch sport={sport} onChange={setSport} />
          ) : null}


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
        className="fixed inset-x-0 bottom-0 z-40 grid grid-flow-col auto-cols-fr border-t border-border bg-card shadow-[0_-4px_20px_-8px_rgba(18,35,58,0.25)] min-[680px]:hidden"
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
