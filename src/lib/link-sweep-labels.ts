/** Plain-language names for the tidy-up reasons, safe to use anywhere. */
const REASON_LABELS: Record<string, string> = {
  wrong_sport: "For a different sport",
  old_season: "An old season's page",
  news_page: "A news story, not a team page",
  junk_host: "Not a school athletics site",
  school_homepage: "The school's homepage, not its athletics site",
  sport_page_on_known_site: "Right sport on the confirmed athletics site",
};

export const sweepReasonLabel = (code: string) => REASON_LABELS[code] ?? "Needs a look";
