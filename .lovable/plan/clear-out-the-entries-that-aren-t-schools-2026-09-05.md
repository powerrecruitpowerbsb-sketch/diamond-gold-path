# Clear out the entries that aren't schools

You're right — 19 of the leftover rows aren't schools at all. They're Wikipedia
index pages ("List of NCAA Division II institutions", "List of NAIA institutions",
"List of junior college football programs in the United States", and similar) that
got swept up when we imported the governing-body directories. Each one also
created a fake baseball and softball team, so they're cluttering the school count
and the program count too.

All 19 are tagged to either Wisconsin or Wyoming — the last state headings on
those pages — which confirms the importer ran past the end of the real member
list and started reading the "See also" links at the bottom.

## What to do

1. **Delete the 19 fake schools** along with their 38 fake programs and the 95
   collection-queue jobs pointing at them. None of them have rosters, saved
   shortlists, or review items attached, so nothing real is lost.
2. **Stop it happening again** — the importer will ignore names that are clearly
   index pages (anything starting with "List of", "Index of", "Outline of",
   "Comparison of", or "Category:"/"Template:"), and will stop reading a page
   once it hits a "See also", "References", "Notes", or "External links" heading
   instead of continuing into the link lists there.
3. **Add a small clean-up tool** on the collection pipeline screen: a
   "Non-school entries" panel that shows anything matching those patterns with a
   one-click remove, so if a future import picks up junk you can clear it without
   waiting on me.
4. **Re-check the counts** afterwards so the school and program totals on the
   console reflect only real schools, and confirm the decision list drops to the
   58 genuine schools still waiting.

## Not included

The remaining list also has a few things worth a separate look later — Canadian
schools (Simon Fraser, UBC, Douglas College, Trinity Western) that will never
appear in the US federal data, combined-college athletic entries like
"Pomona-Pitzer Colleges" and "Claremont McKenna-Harvey Mudd-Scripps Colleges",
and a handful of real schools that were parked but do have federal records
(Trinity University in Texas, University at Buffalo, Lock Haven). Say the word
and I'll take those on next.

## Technical notes

- Deletion runs as a migration scoped by explicit id list: `ingest_queue` and
  `url_discovery_queue` rows first, then `programs`, then `universities`.
- Name guard lives in `src/lib/wiki-directory.server.ts` as a shared
  `looksLikeIndexPage()` check applied in all four table/bullet parsers, plus a
  section-heading stop condition in the bullet parser.
- Clean-up panel: new superadmin server functions in
  `src/lib/pipeline.functions.ts` (`listNonSchoolEntries`, `removeNonSchoolEntry`)
  surfaced in `src/routes/_authenticated/admin.pipeline.tsx`; removals write to
  the audit log like every other admin change.
