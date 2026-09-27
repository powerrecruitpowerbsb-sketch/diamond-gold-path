import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/console/PageHeader";

export const Route = createFileRoute("/_authenticated/admin/handbook")({
  head: () => ({
    meta: [
      { title: "Super admin handbook — Curve Recruit" },
      { name: "description", content: "What a Curve Recruit super admin does: the weekly routine, the season calendar and how to fix common problems." },
      { property: "og:title", content: "Super admin handbook — Curve Recruit" },
      { property: "og:description", content: "The job of a super admin, written for whoever takes it over." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Handbook,
});

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-graphite">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-graphite">{children}</div>
    </section>
  );
}

function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-semibold text-org-primary underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

function Handbook() {
  return (
    <>
      <PageHeader
        title="Super admin handbook"
        description="Everything the person running Curve Recruit's data needs to know. About 10 minutes to read."
      />

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {[
          ["job", "The job"],
          ["how", "How data stays fresh"],
          ["weekly", "Weekly routine"],
          ["calendar", "Season calendar"],
          ["fix", "When something breaks"],
          ["rules", "Rules to never break"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded border border-border bg-card px-3 py-1.5 hover:bg-muted">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-4">
        <Section id="job" title="The job, in four parts">
          <ol className="list-decimal space-y-2 pl-5">
            <li><b>Keep the refresh running.</b> Autopilot does the work. You check it's on and not stuck.</li>
            <li><b>Answer the questions it can't.</b> Confirm suggested pages and pick the right school record. These pile up in "Needs you".</li>
            <li><b>Fix what breaks.</b> A school redesigns its site, blocks us, or hires a new coach before the next refresh.</li>
            <li><b>Look after clubs and people.</b> Create organizations, invite owners, handle flagged conversations.</li>
          </ol>
          <p>Everything starts from the <Go to="/admin">Command center</Go>.</p>
        </Section>

        <Section id="how" title="How the data stays fresh on its own">
          <p><b>Rosters and coaches</b> come from each school's own athletics site. Every team gets re-read every <b>6 months</b>.</p>
          <p><b>Tuition, GPA, test scores, acceptance rate and majors</b> come from the U.S. Department of Education. Every school is re-checked <b>once a year</b>.</p>
          <p>Every morning, <b>Autopilot</b> sends anything due for a fresh read. The refresh then works through the list in small batches, day and night, with no page open. New rosters and coaches go live in the app right away.</p>
          <p>Every saved roster and coach records the page it came from. If a page belongs to a different school, the write is refused. That stops one school's roster showing up under another.</p>
          <p><b>Starting a refresh yourself:</b></p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Run the check now</b> (Autopilot box): sends everything due today without waiting for morning.</li>
            <li><b>Refresh one team now</b>: search the school and press Refresh. Use it for a new coach or a fresh roster.</li>
            <li><b>Start / Stop</b> (the "Running now" box): starts or stops the whole refresh. Stopping keeps everything saved so far.</li>
          </ul>
        </Section>

        <Section id="weekly" title="The 10-minute weekly routine">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the <Go to="/admin">Command center</Go>. Check <b>Autopilot</b> is <b>On</b> and the last check was within a day.</li>
            <li>If "Running now" says it's running, check its last heartbeat is minutes old, not hours. If it's hours old, press Stop, then Start.</li>
            <li>Clear <Go to="/admin/discovery">Suggested addresses</Go>. Confirm only pages on the school's own athletics site.</li>
            <li>Clear <Go to="/admin/federal-decisions">School identity</Go>. Pick the record with the matching city and state.</li>
            <li>Skim <Go to="/admin/review">Proposed changes</Go>. Approve anything with a clear source page.</li>
            <li>Check <Go to="/admin/reports">Flagged conversations</Go>.</li>
          </ol>
        </Section>

        <Section id="calendar" title="Season calendar">
          <ul className="list-disc space-y-2 pl-5">
            <li><b>September to October:</b> fall rosters go up. Autopilot catches most. For big programs your clubs care about, use "Refresh one team now" once their roster posts.</li>
            <li><b>January to February:</b> spring rosters are final. Same as above.</li>
            <li><b>June to August:</b> coaching changes and the transfer portal. Refresh a team whenever a coach change is announced.</li>
            <li><b>Each fall:</b> the Department of Education publishes new school numbers. Autopilot picks them up as each school's yearly date comes around.</li>
          </ul>
        </Section>

        <Section id="fix" title="When something breaks">
          <dl className="space-y-3">
            <div>
              <dt className="font-semibold">A team shows the wrong or an old roster</dt>
              <dd>Open the team under <Go to="/admin/programs">All teams</Go>. Check the roster address is the school's own page, fix it if not, then use "Refresh one team now".</dd>
            </div>
            <div>
              <dt className="font-semibold">A site blocks us or times out</dt>
              <dd>It shows under <Go to="/admin/operations">Blocked & broken sites</Go>. Each blocked site gets one retry. If it still fails, enter the right address by hand or leave it. Never mark a school down for missing roster data.</dd>
            </div>
            <div>
              <dt className="font-semibold">A team has no roster page or head coach</dt>
              <dd>Use <Go to="/admin/missing">Missing pages & coaches</Go>. Paste the page from the school's athletics site.</dd>
            </div>
            <div>
              <dt className="font-semibold">Transfer counts look wrong</dt>
              <dd>Most sites list a player's previous college for transfers and a high school for everyone else. If a whole roster shows as transfers, the site's layout has probably changed. Note the school and ask a developer to check the roster reader.</dd>
            </div>
            <div>
              <dt className="font-semibold">Autopilot says nothing was sent but data looks stale</dt>
              <dd>Nothing was due yet. Use "Refresh one team now" for specific teams, or Start in "Running now" to re-read everything waiting in line.</dd>
            </div>
          </dl>
        </Section>

        <Section id="rules" title="Rules to never break">
          <ul className="list-disc space-y-1 pl-5">
            <li>Only use a school's own athletics site for rosters and coaches. No aggregator sites.</li>
            <li>Never collect coach email addresses in bulk.</li>
            <li>Never assume a junior college doesn't have the sport. Check first.</li>
            <li>Coaches can't add players. Players are added by owners and admins only.</li>
            <li>Green means verified data. Red means our own intelligence. Don't mix them.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
