import { useEffect } from "react";

import { useOrgBranding } from "@/hooks/use-org-branding";

function setLink(rel: string, href: string) {
  document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`).forEach((el) => {
    if (el.getAttribute("href") !== href) el.setAttribute("href", href);
  });
}

/** Browser tab + home-screen icon follow the organization's logo; app icon otherwise. */
export function OrgAppIcon() {
  const { branding } = useOrgBranding();
  const logo = branding?.logoUrl ?? null;
  const name = branding?.name ?? null;

  useEffect(() => {
    setLink("icon", logo ?? "/favicon.png");
    setLink("apple-touch-icon", logo ?? "/icon-180.png");

    let blobUrl: string | null = null;
    if (logo) {
      const origin = window.location.origin;
      const manifest = {
        name: name ?? "Curve Recruit",
        short_name: (name ?? "Curve").slice(0, 12),
        start_url: `${origin}/`,
        scope: `${origin}/`,
        display: "standalone",
        background_color: "#0a1628",
        theme_color: "#0a1628",
        icons: [
          { src: logo, sizes: "192x192", purpose: "any" },
          { src: logo, sizes: "512x512", purpose: "any" },
        ],
      };
      blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
      setLink("manifest", blobUrl);
    } else {
      setLink("manifest", "/manifest.webmanifest");
    }

    return () => {
      setLink("icon", "/favicon.png");
      setLink("apple-touch-icon", "/icon-180.png");
      setLink("manifest", "/manifest.webmanifest");
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [logo, name]);

  return null;
}
