# Design pass: give the product weight and a voice

Presentation only. No data, query, or permission changes. Tables and data rows keep the dense hairline style — the work is everything around them.

## Confirmation on brand colors (your correction)

Checked, and you are right to flag it. Answers:

- **Is branding captured at upload?** Yes. An organization stores its logo plus two colors — a primary and an accent — and the owner sets all three on the branding screen. Those values are what the app already reads for the header and hero.
- **Was anything hardcoded?** The earlier wording "gold fill, navy text" described Power's own saved colors, but as written it invited fixed values. Corrected: **no new token or component contains a literal gold or navy value.** Every colored element in this pass resolves from the organization's two saved colors. Gold and navy remain only where they already are — as the fallback used when no organization has uploaded colors (Power Recruit's own default) and in the superadmin console, which deliberately keeps a fixed identity.
- **A second organization uploading blue and white re-themes automatically**, with no code change: primary buttons, the active nav marker, active filter chips, section-header rules, and stat-bar fills all read the same two values.
- **Text on a colored fill is computed, not fixed.** The app works out whether a saved color is light or dark and puts white or near-black text on it. Power's gold gets dark text; a deep blue gets white — automatically.
- **Logo:** driven by the same upload and currently shown in the header only. This pass uses it in every place an organization mark belongs: header, the home/dashboard banner, invitation and empty-state blocks, and the athlete/organization identity strip. Where no logo is uploaded, the existing lettermark stands in.

Green stays Verified Data and red stays Our Intelligence — never themeable, never used for an ordinary button.

## Shared tokens this touches

- `src/styles.css` — derived tokens only: a hover and pressed shade of the org accent, an accent tint for chips and active nav, a computed readable text color for accent fills, and a neutral bar track. All expressed from `--org-primary` / `--org-accent`, so they follow whatever an organization uploads.
- New shared `ActionButton` (primary / secondary / tertiary) and `EmptyState` blocks; existing one-off buttons get swapped to them.

## 1. Button hierarchy

Three variants, one component, used everywhere:

- **Primary** — filled with the organization's accent, text in the computed readable color, generous padding, darkens on hover, presses down 1px, visible focus ring. Applied to: Search, Add athlete, Save relationship, Log interaction, Create season, Invite, Add to list, Save.
- **Secondary** — white fill, accent border, accent text, accent tint on hover.
- **Tertiary** — text-only accent, underline on hover. Cancel, Clear filters, Back.
- **Destructive** stays separate and rare.

Disclosure controls ("More filters", sport toggle, stage picker) become clearly not-an-input: accent-tinted, accent-bordered, chevron that rotates, with a count badge when filters are active behind them.

## 2. The brand colors outside the hero

- Active nav item: accent marker plus accent text.
- Active filter chips: accent tint fill, accent border, accent text, accent X.
- Links and clickable text: accent, underline on hover.
- Section headers get a short accent rule so a page scans top-to-bottom in the org's color.
- Table rows stay neutral; only their save/open affordance picks up accent on hover.

## 3. Stat blocks and bars with presence

Dashboard division / region / pipeline bars:

- 10px tall, rounded, visible unfilled track, fill in the organization's accent (stage bars keep their stage color).
- The number moves beside the label in display type at real size; the segment label stays small and quiet.
- Each bar becomes a real button that filters the roster/list to that segment — hover lifts the track and shows the count, the active segment sits darker with a clear affordance.

## 4. Empty states as a moment

One shared block: centered, generous vertical space, icon in an accent tint circle (or the org logo where that reads better), short display-type headline, one line of context, one primary button. Replaces the thin gray sentences on:

- Roster with no athletes → "Start your roster"
- No seasons → "Start your first season"
- Intelligence with nothing rated → "Nothing logged yet"
- College list with no schools → "Add your first school"
- Search before a filter → one short line, no block

## 5. Uppercase mono gets demoted

Mono uppercase is kept for column headers, tags, and 2-4 word data labels. Every instructional or descriptive sentence moves to body type, sentence case. Provenance lines ("Source: … · Last verified: …") stay mono.

## 6. Copy rewrite — warm and coaching

Short, active, spoken to a person. No em-dash asides explaining what something is not, no restating the layout, no interface instructions as page copy.

- "Pick a level, a location, or type a school name" → "Search 3,238 programs by name, location, or level"
- "Your organization's players — separate from the verified college roster data" → headline "Your roster", distinction in a tooltip
- "No seasons yet. Create your first season" → "Start your first season"
- The long "Set a filter below to start…" line → cut

## 7. Less label noise

In the Intelligence workstation and program profile, repeated italic "Not rated" / "Not recorded" / "Never" stop competing for attention. Each field keeps its label at full strength; an unset value becomes one quiet accent "Add" affordance. Filled values read at normal weight so a worked-on record looks worked on.

## Then I show you

The same five screens after the pass, as screenshots: search filters, the dashboard, the intelligence workstation, and the athlete roster both empty and populated. I will also show one screen re-rendered with a blue-and-white test organization to prove the theming follows the upload.

## Technical notes

- `OrgTheme` already emits `--org-primary` / `--org-accent` from the saved branding. It gains derived emissions on the same element: `--org-accent-strong`, `--org-accent-pressed`, `--org-accent-tint`, `--org-accent-foreground` (luminance-picked), and `--org-primary-tint`. Computed with `color-mix`/`oklch` off the two saved values, so no literal hex enters any component.
- `src/styles.css` maps those through `@theme inline` to `bg-org-accent-strong`, `text-org-accent-foreground`, etc. The existing `:root` gold/navy stay exactly where they are: defaults for an organization with nothing uploaded, and the console's fixed identity.
- New `src/components/brand/ActionButton.tsx` and `src/components/brand/EmptyState.tsx`; `src/components/ui/button.tsx` gains matching variants so shadcn usages inherit the look.
- Logo: a small `OrgMark` component reading `useOrgBranding().logoUrl` with the lettermark fallback, used by `AppShell`, the home/dashboard banner, invite panels, and empty states — one source, one upload.
- Bar segments push existing filter params in the URL, reusing the filter state already on `/list` and `/roster`. No server work.
- Touched screens: `search.tsx`, `dashboard.tsx`, `index.tsx`, `intelligence.tsx`, `list.tsx`, `roster.*`, `settings.*`, `programs.$id.tsx`, `AppShell`, `PageHeader`, `SchoolSheet`, `StageSettings`, `form-kit`, `DataLayers`, `Composition`, `ShortlistSaveButton`. Console admin screens keep their terminal density and fixed identity, getting only the button and empty-state swaps.
