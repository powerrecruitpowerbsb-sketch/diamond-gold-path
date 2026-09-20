/**
 * The player's accounts as two small marks that open the account itself. A
 * handle nobody supplied shows nothing at all.
 */

export function socialHandle(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const bare = value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com|instagram\.com)\//i, "")
    .split(/[?#/]/)[0]
    ?.replace(/^@/, "")
    .trim();
  return bare ? bare : null;
}

type Props = {
  twitter?: unknown;
  instagram?: unknown;
  className?: string;
};

const linkClass =
  "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-steel transition-colors hover:border-org-primary hover:text-org-primary";

export function SocialLinks({ twitter, instagram, className }: Props) {
  const x = socialHandle(twitter);
  const ig = socialHandle(instagram);
  if (!x && !ig) return null;

  return (
    <div className={className ? `flex items-center gap-2 ${className}` : "flex items-center gap-2"}>
      {x ? (
        <a
          href={`https://x.com/${x}`}
          target="_blank"
          rel="noreferrer"
          title={`@${x} on X`}
          aria-label={`@${x} on X`}
          className={linkClass}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      ) : null}
      {ig ? (
        <a
          href={`https://instagram.com/${ig}`}
          target="_blank"
          rel="noreferrer"
          title={`@${ig} on Instagram`}
          aria-label={`@${ig} on Instagram`}
          className={linkClass}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.336 3.608 1.311.975.975 1.249 2.242 1.311 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.336 2.633-1.311 3.608-.975.975-2.242 1.249-3.608 1.311-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.336-3.608-1.311-.975-.975-1.249-2.242-1.311-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.336-2.633 1.311-3.608C4.519 2.567 5.786 2.293 7.152 2.231 8.418 2.175 8.797 2.163 12 2.163zm0 1.802c-3.148 0-3.503.012-4.74.068-.94.043-1.61.19-2.06.64-.45.45-.597 1.12-.64 2.06-.056 1.237-.068 1.592-.068 4.74s.012 3.503.068 4.74c.043.94.19 1.61.64 2.06.45.45 1.12.597 2.06.64 1.237.056 1.592.068 4.74.068s3.503-.012 4.74-.068c.94-.043 1.61-.19 2.06-.64.45-.45.597-1.12.64-2.06.056-1.237.068-1.592.068-4.74s-.012-3.503-.068-4.74c-.043-.94-.19-1.61-.64-2.06-.45-.45-1.12-.597-2.06-.64-1.237-.056-1.592-.068-4.74-.068zm0 3.063a4.972 4.972 0 110 9.944 4.972 4.972 0 010-9.944zm0 1.802a3.17 3.17 0 100 6.34 3.17 3.17 0 000-6.34zm5.23-2.04a1.161 1.161 0 110 2.322 1.161 1.161 0 010-2.322z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
