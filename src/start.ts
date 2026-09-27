import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { supabase } from "@/integrations/supabase/client";

// A signed-in page can outlive its session (sign-out in another tab, expired
// login). Rather than firing protected calls with no token and crashing the
// page, send the browser to sign in. Public server functions are unaffected
// because the check only runs when there is no session AND we are on a
// signed-in page.
const PUBLIC_PATHS = /^\/($|auth|forgot-password|reset-password|p\/|wall|packet|api\/)/;
const requireSessionInBrowser = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (typeof window !== "undefined" && !PUBLIC_PATHS.test(window.location.pathname)) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      window.location.assign("/auth");
      return new Promise<never>(() => {});
    }
  }
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [requireSessionInBrowser, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
