<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Roster transfer reading: bare "Last School"/unlabelled school names count as colleges only if they read as a college or match the schools directory (loadKnownColleges before readRoster). Why: bare high-school names ("Central") are indistinguishable from college short names ("Mercer").
- Autopilot: pg_cron `curve-recruit-autopilot` (daily, autopilot_tick) queues due refreshes and starts the collection runner; `curve-recruit-federal` (10 min, federal_tick) posts to /api/public/federal-runner with the stored runner key. Why: refreshes must run with no one signed in.
