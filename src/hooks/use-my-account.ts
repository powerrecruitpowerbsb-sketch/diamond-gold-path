import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccount } from "@/lib/admin.functions";

/**
 * Reads the signed-in account, but only after a Supabase session exists.
 * Without the session gate the protected server fn is called with no bearer
 * token and throws "Unauthorized: No authorization header provided".
 */
export function useMyAccount() {
  const accountFn = useServerFn(getMyAccount);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const query = useQuery({
    queryKey: ["my-account"],
    queryFn: () => accountFn(),
    enabled: hasSession === true,
    retry: false,
  });

  return {
    account: hasSession === false ? null : (query.data ?? null),
    isPending: hasSession === null || (hasSession === true && query.isPending),
    signedIn: hasSession === true,
  };
}
