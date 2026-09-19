import { useCallback, useEffect, useState } from "react";

import { normalizeSport, type Sport } from "@/lib/sport";

const KEY = "power-recruit.sport";
const EVENT = "power-recruit:sport";

function read(): Sport {
  if (typeof window === "undefined") return "baseball";
  try {
    return normalizeSport(window.localStorage.getItem(KEY));
  } catch {
    return "baseball";
  }
}

/**
 * The one sport the whole app is showing. Remembered per person in this
 * browser, and shared live between every mounted screen so the header switch,
 * the roster and the college list never disagree.
 */
export function useSportMode() {
  const [sport, setSportState] = useState<Sport>("baseball");

  // Read after mount: the server render has no browser storage.
  useEffect(() => {
    setSportState(read());
    const sync = () => setSportState(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setSport = useCallback((next: Sport) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* private browsing — the choice just doesn't persist */
    }
    setSportState(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { sport, setSport };
}
