"use client";

// The app's front door for family phones: ashergames.com/play. The public
// coming-soon page lives at the root; this is where a family member signs in
// or starts a family, and where the installed app opens. Someone already
// signed in on this phone goes straight on to their screen.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadSession } from "@/lib/client/session";

export default function Welcome() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((s) => {
        if (cancelled || !s) return;
        router.replace(s.screen ? `/tv/${s.screen.roomId}` : s.seat ? `/room/${s.seat.roomId}` : "/home");
      })
      .catch(() => {
        // Offline or a blip: the buttons below still work.
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-16">
      <div className="font-display text-2xl font-bold tracking-wide text-ink">Asher Games</div>
      <h1 className="font-display text-4xl font-semibold leading-tight">Game night on everyone&apos;s phone</h1>
      <p className="text-lg text-muted">One phone each. One family. Secret words, sneaky missions and a quiz where everyone has a fair shot.</p>
      <div className="mt-auto flex flex-col gap-3">
        <Link
          href="/join"
          className="btn btn-primary flex h-15 items-center justify-center font-display text-xl font-bold text-ink"
        >
          Join your family
        </Link>
        <Link
          href="/start"
          className="btn btn-secondary flex h-15 items-center justify-center font-display text-xl font-semibold"
        >
          Start a new family
        </Link>
      </div>
    </main>
  );
}
