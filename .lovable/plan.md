# Step 6 — Collision remediation (plan only, nothing runs yet)

## First: the count reconciliation

I re-read the quarantine table directly just now. The truth is **38 sites**, none lifted: 36 Amazon firewall, 2 Cloudflare. My earlier prose said 37 and the exported file listed 35 — both wrong. The file was written before the last two detections landed, and the prose figure was typed from an in-flight count rather than the table.

Fix for the pattern, not just this number: from here on every count I quote comes from one query run at reporting time, and the same query writes the CSV, so prose and file can't diverge. Any re-exported file gets a new version name rather than being overwritten.

## 6A. Resolved groups — clear the confirmed non-owners

Scope: groups where ownership was decided by a federal-website match or an NCAA-directory match (athletics-site field or the school's own site field). The 29 name-and-state rows are already reverted to unknown and count as ambiguous, not resolved.

- Non-owner schools: the address is cleared from that program's field and the program is queued to look for its own page.
- **The declined-value memory is scoped to the one school it was cleared from.** Clearing an address from Central Lakes College never stops that same address being proposed for Central College (Iowa), which actually owns it. There is no global decline list.
- Owner school: the address stays, and its state stays **unverified** — nobody has read the page yet, so it is not promoted.
- Deliverable: exact number of school-rows touched and links cleared, computed in the dry run before anything is written.

## 6A-b. The re-search queue is inert until you release it

Each cleared program gets a waiting job, and **nothing runs it**. The queue is parked in a held state that no runner picks up, no schedule wakes, and no other step drains. Identity-bound discovery proves itself on a small batch you choose, and only then do I release the rest — as a separate approval. I will confirm the held count and show that no runner can claim those rows.

## 6B. Ambiguous groups — keep, flag, withhold

For every group still unresolved:

- Nothing is deleted and no address is changed.
- Each link stays in the **conflicted** state.
- Conflicted links are withheld from every product surface: search results, school and program pages, comparison, shortlists, exports, and the family-facing views. Where a page would have shown the link it shows nothing rather than a doubtful address.
- Deliverable: number of links held this way, and how many programs and schools they sit on.

## 6C. Reversibility

- An archive table records, for every clearing: school, program, institution ID, field, prior value, the evidence sentence that justified it, the run it belonged to, and the timestamp.
- One undo operation restores an entire run: prior values back into place, that school's decline memory for those rows removed, and the held re-search jobs it created withdrawn.
- The archive is append-only, so an undo is itself recorded.

## 6D. Dry run first

Before any write, a CSV with one row per affected link: school, institution ID, program, sport, field, current value, action (clear / keep / flag), owner decision, and the evidence.

**Every row also carries its whole collision group**, so the group reads side by side: a group identifier and the shared address, plus each other school on that address with its institution ID, state, federal website, and its own determination (owner / not the owner / unknown). Rows are ordered so a group is contiguous — "clear from Central Lakes" sits directly under "keep for Central College".

Plus a small summary file with group and link totals. You review the file; executing the clearing is a separate approval.

## 6E. The 11 coach-page 404s (separate, read-only)

All 11 sit on a `/sports/<sport>/roster/coaches` address, a retired Sidearm path. I test the single substitution to `/sports/<sport>/coaches` on those 11 addresses only — one read each, no rendering, no retries — and report which resolve. Nothing is written until you say so.

## Also noted

The 10 probed sites that came back reachable are not quarantined. Their pages stay in the ordinary queue and get retried on the next normal sweep under the current reader settings — no separate run for them.

## Guardrails held throughout

No clearing executed in this step. No discovery run. No crawler run beyond the 11 test reads. No full-database sweep. No scraping-service key. No coverage chasing. No stored address changed for a blocked host. Schema changes for 6C are shown for approval before they run.

## Technical notes

- Ownership input: the existing resolution output (federal-site and NCAA-athletics/institution-site matches only); no name or state similarity may assign or deny ownership.
- Clearing will reuse `clearWrongLink` (nulls the field, records the declined value against that program/school only, queues rediscovery), extended to write the archive row in the same operation — but it is not called in this step.
- The queued `ingest_queue` rows are written in a held status outside the statuses any runner leases, so the discovery loop cannot pick them up; release flips them to pending in a batch you approve.
- New: an archive table for cleared links plus a run identifier; undo keyed on that identifier.
- Conflicted-state reads come from `link_verification_state`; consumer queries filter on it so a conflicted link cannot be served as good.
- Dry run is a read-only script writing to `/mnt/documents`; it shares its query with the reported counts.
