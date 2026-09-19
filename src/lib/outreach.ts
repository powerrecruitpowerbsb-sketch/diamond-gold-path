/**
 * The wording side of coach outreach. Kept away from the server functions so
 * both the composer and its tests can use it without a database.
 */

export type ScoutFact = { label: string; value: string };

export const COACH_ROLES = [
  "Head Coach",
  "Recruiting Coordinator",
  "Assistant Coach",
  "Pitching Coach",
  "Hitting Coach",
  "Volunteer Coach",
  "Director of Operations",
] as const;

/**
 * Subject lines that read like a person wrote them: who, what position, and
 * what class. Coaches open on class year and position, not adjectives.
 */
export const SUBJECT_TEMPLATES: { id: string; label: string; build: (o: OutreachInput) => string }[] =
  [
    {
      id: "intro",
      label: "Straight introduction",
      build: (o) =>
        `${o.gradYear || "Recruit"} ${o.position || "Athlete"} — ${o.name}${o.state ? ` (${o.state})` : ""}`,
    },
    {
      id: "interest",
      label: "Interest in the program",
      build: (o) =>
        `${o.name} — ${o.gradYear || ""} ${o.position || ""} interested in ${o.school}`.replace(
          /\s+/g,
          " ",
        ),
    },
    {
      id: "schedule",
      label: "Come see me play",
      build: (o) =>
        o.nextEvent
          ? `${o.gradYear || ""} ${o.position || ""} ${o.name} — playing ${o.nextEvent}`.replace(
              /\s+/g,
              " ",
            )
          : `${o.gradYear || ""} ${o.position || ""} ${o.name} — upcoming schedule`.replace(
              /\s+/g,
              " ",
            ),
    },
    {
      id: "video",
      label: "Video attached",
      build: (o) =>
        `${o.gradYear || ""} ${o.position || ""} ${o.name} — highlight video`.replace(/\s+/g, " "),
    },
  ];

export type OutreachInput = {
  name: string;
  gradYear: string;
  position: string;
  state: string;
  school: string;
  coachName: string;
  coachRole: string;
  highSchool: string;
  clubTeam: string;
  gpa: string;
  testScore: string;
  facts: ScoutFact[];
  videoLinks: string[];
  events: string[];
  nextEvent: string;
  scoutCardUrl: string;
  contactLine: string;
};

const block = (lines: (string | null | false)[]) => lines.filter(Boolean).join("\n");

/** One honest email: who I am, what I can do, where to watch, how to reach me. */
export function buildEmailBody(o: OutreachInput): string {
  const greeting = `Coach ${o.coachName.split(/\s+/).slice(-1)[0] || o.coachName || ""}`.trim();
  const who = [
    o.gradYear ? `${o.gradYear} graduate` : null,
    o.position || null,
    o.highSchool || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return block([
    `${greeting},`,
    "",
    `My name is ${o.name}${who ? ` — ${who}` : ""}. I'm very interested in ${o.school} and wanted to introduce myself directly.`,
    "",
    o.facts.length ? "Where I am right now:" : false,
    ...o.facts.map((fact) => `  • ${fact.label}: ${fact.value}`),
    o.gpa ? `  • GPA: ${o.gpa}` : false,
    o.testScore ? `  • ${o.testScore}` : false,
    o.clubTeam ? `  • Club team: ${o.clubTeam}` : false,
    o.facts.length || o.gpa ? "" : false,
    o.events.length ? "Where you can see me play:" : false,
    ...o.events.map((event) => `  • ${event}`),
    o.events.length ? "" : false,
    o.videoLinks.length ? "Video:" : false,
    ...o.videoLinks.map((link) => `  ${link}`),
    o.videoLinks.length ? "" : false,
    o.scoutCardUrl ? `Full profile, measurables and schedule: ${o.scoutCardUrl}` : false,
    o.scoutCardUrl ? "" : false,
    "Thank you for your time — I'd welcome the chance to talk about your program.",
    "",
    o.name,
    o.contactLine || false,
  ]);
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
