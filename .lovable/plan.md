# Wait for the page pass to finish, then hand over the list

## Where it stands right now

- The page check is switched on and moving on its own, a batch every minute.
- Pages that cannot be opened are now being written down by name for the first time (10 recorded in the first minute).
- The every-minute helper is scheduled and active, so nothing needs a page left open.

## What happens next

1. Let the pass run to the end. When it reaches the end of the stored pages it switches itself off and marks step 1 finished.
2. Any page that opens on this pass is checked normally: kept if it proves to be the right school and sport, cleared and sent back to be searched again if it proves wrong.
3. Any page that still cannot be opened stays on the record with its school, sport, which page it is, the address, and the reason.
4. Then export `/mnt/documents/unreadable-pages.csv` from that record — the only pages needing a human look, most of them sites that block automated readers.
5. Report the final counts on the build screen: pages checked, wrong ones cleared, and how many remain unreadable by name.

## After that

Step 1 is complete and step 2 (finish the rosters) can be started. Coach filling stays held back until its safety check passes, unchanged.

## Technical notes

- Monitor `build_stages` for `stage = 'pages'` reaching `status = 'done'`; no code change is needed for the pass itself.
- Export joins `unreadable_pages` (where `resolved_at is null`) to `programs` and `universities` for school, sport, field, URL, error and last-seen time.
- The stage's `failed` counter carries totals from the earlier pass; the named record is the authoritative list, so the export drives the final number quoted.
