"use client";

// Lining a phone's clock up with the server's, for anything timed that every
// phone must see at the same moment (Nerve's pot, the quiz's countdown).

import { useEffect, useState } from "react";

/** The gap between this phone's clock and the server's, from the quickest of three asks. */
export function useServerOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      let best = { rtt: Infinity, offset: 0 };
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" }).catch(() => null);
        const t1 = Date.now();
        const now = res ? ((await res.json().catch(() => null)) as { now?: number } | null)?.now : undefined;
        if (typeof now === "number" && t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: now - (t0 + t1) / 2 };
      }
      if (live && best.rtt < Infinity) setOffset(best.offset);
    })();
    return () => {
      live = false;
    };
  }, []);
  return offset;
}

