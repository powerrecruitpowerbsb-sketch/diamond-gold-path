# Player photo + clean social links

Two changes to the player card, applied to both the internal card and the shareable profile.

## 1. Add a player photo

Today there is nowhere to add a picture — the card has no photo at all.

- A photo slot sits at the left of the card header. Empty, it shows a dashed
  "+ Add photo" tile; filled, it shows the player's picture in the header,
  with "Replace photo" / "Remove photo" while editing.
- Tapping it opens the device's photo picker (camera roll on phone). The file
  uploads immediately and appears on the card.
- Files over 5MB are refused with a plain message; only image files accepted.
- The same photo appears on the shareable profile so a college coach sees a
  face, not a placeholder.
- Anyone who can edit the card (staff, parent, player) can set the photo.

## 2. Social links become real links

Today the card prints rows like "X — handle" and "Instagram — @handle" as
plain text. Instead:

- Show just two small icon links — the X mark and the Instagram mark — under
  the vitals line, each opening that account directly
  (`x.com/<handle>`, `instagram.com/<handle>`).
- Handles are stored without the `@`, so a pasted `@name` or a full profile URL
  is cleaned up on save.
- Missing handle means no icon — nothing empty shown.
- Same treatment on the shareable profile; the old text rows are removed from
  both places.

## Technical notes

- Migration: add `photo_path text` to `org_athletes`; create a **public**
  storage bucket `athlete-photos` (the shareable card is opened without an
  account, so signed URLs won't work there) with storage policies allowing
  insert/update/delete only for users who already pass
  `can_access_athlete` / `is_linked_athlete` on the athlete folder
  (`<athlete_id>/...`), and public read.
- Extend `athlete_scout_card(_slug)` to return `photo_path`; the public route
  builds the public URL from it. Photo is not gated by `share_contact`.
- `athlete-profile.functions.ts`: add `photo_path` to `PROFILE_COLUMNS` and to
  `saveAthleteProfile` (normalize/strip handle input for
  `twitter_handle` / `instagram_handle`: strip `@`, strip
  `x.com/`, `twitter.com/`, `instagram.com/` prefixes and query strings).
- `AthleteProfilePanel.tsx`: photo tile + upload handler via
  `supabase.storage.from("athlete-photos")` (mirrors the branding upload flow);
  drop the "Follow along" group rows and render a `SocialLinks` row of icon
  anchors instead.
- `p.$slug.tsx`: hero shows the photo; replace the two social fact rows with
  the same icon links.
- `invites.functions.ts` `getFamilyPortal` also needs `photo_path` selected so
  the family card renders the photo.
