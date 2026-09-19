# Design pass: give the product weight and a voice

Presentation only. No data, query, or permission changes. Tables and data rows keep the dense hairline style — the work is everything around them.

## Report first: yes, this touches shared tokens

This pass changes shared pieces, so it will show up on every screen at once:

- `src/styles.css` — a few new tokens: accent hover/pressed shades, an accent tint for chips and active nav, a filled-track color for bars.
- A new shared `ActionButton` (primary / secondary / tertiary) plus a shared `EmptyState` block. Existing one-off buttons get swapped to them screen by screen.
- Gold becomes the action color. On navy chrome the accent already reads well; inside white content areas primary buttons are gold fill with navy text, which is the boldest of the three options you were offered.

Fixed platform meaning does not move: green stays Verified Data, red stays Our Intelligence. Neither is ever used for an ordinary button.

## 1. Button hierarchy

Three variants, one component, used everywhere:

- **Primary** — gold fill, navy text, generous padding (h-11, 16-20px sides), darkens on hover, presses down 1px, visible focus ring. Applied to: Search, Add athlete, Save relationship, Log interaction, Create season, Invite, Add to list, Save (branding).
- **Secondary** — white fill, accent border, accent text; accent tint on hover.
- **Tertiary** — text-only accent, underline on hover. Cancel, Clear filters, Back.
- **Destructive** stays separate and rare.

Disclosure controls ("More filters", sport toggle, stage picker) become a distinct control: accent-tinted, accent-bordered, with a chevron that rotates — clearly not a text input. A count badge shows when filters are active behind it.

## 2. Accent outside the hero

- Active nav item: accent left/underline marker plus accent text, not a white wash.
- Active filter chips: accent tint fill, accent border, accent text; the X is accent.
- Links and any clickable text: accent, underline on hover.
- Section headers get a short accent rule so the page scans top-to-bottom in gold.
- Table rows stay neutral; only their save/open affordance picks up accent on hover.

## 3. Stat blocks and bars with presence

Dashboard division / region / pipeline bars:

- 10px tall, fully rounded, visible unfilled track, accent fill (stage bars follow their stage color).
- The number moves up beside the label in display type at real size; the segment label stays small and quiet.
- Bars are already backed by segment data, so each becomes a real button that filters the roster/list to that segment. Hover lifts the track, shows a cursor and the count; the active segment stays filled darker with a small "clear" affordance.

## 4. Empty states as a moment

One shared block: centered, generous vertical space, icon in an accent tint circle, a short headline in display type, one line of context, and one primary button. Replaces the thin gray sentences on:

- Roster with no athletes → "Start your roster"
- No seasons → "Start your first season"
- Intelligence with nothing rated → "Nothing logged yet"
- College list with no schools → "Add your first school"
- Search before a filter → single short line, no block (the box already says it)

## 5. Uppercase mono gets demoted

Mono uppercase is kept for column headers, tags, and 2-4 word data labels. Every instructional or descriptive sentence currently rendered with the `meta` treatment moves to body type, sentence case. Provenance lines ("Source: … · Last verified: …") stay mono — that is what it is for.

## 6. Copy rewrite — warm and coaching

Every instructional and empty-state line gets rewritten, short, active, speaking to a person. No em-dash asides explaining what something is not; no restating the layout. Mechanism explanations move into tooltips or disappear.

Examples:

- "Pick a level, a location, or type a school name" → "Search 3,238 programs by name, location, or level"
- "Your organization's players — separate from the verified college roster data" → headline "Your roster", with the distinction in a tooltip
- "No seasons yet. Create your first season" → "Start your first season"
- The long "Set a filter below to start…" line → cut

## 7. Less label noise

In the Intelligence workstation and program profile, repeated italic "Not rated" / "Not recorded" / "Never" stop competing for attention. Each field keeps its label at full strength, and the unset value becomes one quiet accent "Add" affordance instead of a gray non-answer. Filled values read at normal weight so a worked-on record looks worked on.

## Then I show you

The same five screens after the pass, as screenshots: search filters, the dashboard, the intelligence workstation, and the athlete roster both empty and populated.

## Technical notes

- New tokens in `src/styles.css`: `--org-accent-strong`, `--org-accent-tint`, `--track`, mapped through `@theme inline`; no existing token values change.
- New `src/components/brand/ActionButton.tsx` and `src/components/brand/EmptyState.tsx`; `src/components/ui/button.tsx` gains matching variants so shadcn usages inherit the same look.
- Bar segments become buttons that push existing filter params in the URL — reusing the filter state already on `/list` and `/roster`, no new server work.
- Touched screens: `search.tsx`, `dashboard.tsx`, `index.tsx`, `intelligence.tsx`, `list.tsx`, `roster.*`, `settings.*`, `programs.$id.tsx`, `AppShell`, `PageHeader`, `SchoolSheet`, `StageSettings`, `form-kit`, `DataLayers`, `Composition`, `ShortlistSaveButton`. Console admin screens keep their terminal density, getting only the button and empty-state swaps.
