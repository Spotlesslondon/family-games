"use client";

// A phone only shows someone as away once they have been out of the app for a
// minute (Joshua, 2 Nov: "Away should be if they are from the app for a longer
// length of time"). The server marks a phone away the moment it locks or
// switches app; this hides the quick ones, such as checking WhatsApp.
// The server uses the same minute before a stand-in gets the host's buttons
// (room engine AWAY_GRACE_SECONDS).

import { useEffect, useRef, useState } from "react";

export const AWAY_AFTER_MS = 60_000;

/** The time now, refreshed every `everyMs`, for screens that change as time passes. */
export function useNow(everyMs = 3000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Ids of people to show as away: out of the app for at least a minute, as this screen has seen it. */
export function useShownAway(people: { id: string; connected: boolean }[]): Set<string> {
  const latest = useRef(people);
  useEffect(() => {
    latest.current = people;
  }, [people]);
  const [seen, setSeen] = useState<{ since: Record<string, number>; now: number }>({ since: {}, now: 0 });
  useEffect(() => {
    const tick = () =>
      setSeen((prev) => {
        const now = Date.now();
        const since: Record<string, number> = {};
        for (const p of latest.current) if (!p.connected) since[p.id] = prev.since[p.id] ?? now;
        return { since, now };
      });
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  const stillAway = new Set(people.filter((p) => !p.connected).map((p) => p.id));
  return new Set(Object.entries(seen.since).filter(([id, t]) => stillAway.has(id) && seen.now - t >= AWAY_AFTER_MS).map(([id]) => id));
}
