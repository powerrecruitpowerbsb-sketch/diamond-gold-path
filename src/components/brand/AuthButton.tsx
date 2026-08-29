import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!ready) return <div className="h-11 w-24" aria-hidden />;

  if (!email) {
    return (
      <Button
        asChild
        className="touch-target bg-seam-red text-white hover:bg-seam-red/90"
        size="default"
      >
        <Link to="/auth">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="meta hidden max-w-[180px] truncate text-white/70 min-[680px]:inline">
        {email}
      </span>
      <Button
        variant="outline"
        onClick={signOut}
        className="touch-target border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
      >
        Sign out
      </Button>
    </div>
  );
}
