"use client";

// The page a WhatsApp invite opens: ashergames.com/j/583920.
// No account, no PIN: tap your name (or add yourself) and you are in.

import { PlayerAvatar } from "@/components/avatars";
import type { AvatarKey } from "@/lib/avatars";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { avatarColour, forgetSession, initial, loadSession, message, newPhoneSession, postAsMember, rememberSeat } from "@/lib/client/session";

interface Person {
  id: string;
  name: string;
  taken: boolean;
  avatar?: AvatarKey | null;
}

const BANDS: { value: string; label: string }[] = [
  { value: "6-8", label: "6 to 8" },
  { value: "9-11", label: "9 to 11" },
  { value: "12-15", label: "12 to 15" },
  { value: "16+", label: "16 or over" },
];

export function NightJoin() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [night, setNight] = useState<{ host: string; people: Person[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guest, setGuest] = useState(false);
  const [name, setName] = useState("");
  const [band, setBand] = useState<string | null>(null);

  const look = useCallback(async () => {
    const res = await fetch(`/api/j/${encodeURIComponent(code)}`, { cache: "no-store" }).catch(() => null);
    if (!res) {
      setError(message("offline"));
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGone(message(body.error));
      return;
    }
    setError(null);
    setNight(body);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A family member already signed in on this phone joins as themselves.
      const session = await loadSession().catch(() => null);
      if (cancelled) return;
      if (session && !session.seat) {
        const res = await postAsMember("/api/rooms/join", { code }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (cancelled) return;
        if (res?.ok && body.room?.id) {
          router.replace(`/room/${body.room.id}`);
          return;
        }
        // Not this family's night: carry on and join by name like anyone else.
      }
      look();
    })();
    return () => {
      cancelled = true;
    };
  }, [code, look, router]);

  async function claim(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const send = (extra: Record<string, unknown>) =>
      fetch(`/api/auth/join/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      }).catch(() => null);
    // A phone already holding a link session reuses it; otherwise it makes one.
    let res = await send({});
    let out = res ? await res.json().catch(() => ({})) : { error: "offline" };
    if (res?.status === 401 && out.error === "phone_session_needed") {
      const phoneSession = await newPhoneSession();
      if (!phoneSession) {
        out = { error: "offline" };
        res = null;
      } else {
        res = await send({ phoneSession });
        out = res ? await res.json().catch(() => ({})) : { error: "offline" };
      }
    }
    if (!res?.ok) {
      setBusy(false);
      if (out.error === "night_not_found") {
        setGone(message(out.error));
        return;
      }
      setError(message(out.error));
      look(); // someone may have just taken that name
      return;
    }
    forgetSession();
    if (out.screen) {
      router.replace(`/tv/${out.screen.roomId}`);
      return;
    }
    rememberSeat(out.seat.roomId);
    router.replace(`/room/${out.seat.roomId}`);
  }

  if (gone) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-16">
        <div className="font-display text-xl font-bold text-ink">Asher Games</div>
        <h1 className="font-display text-3xl font-semibold">This link has closed</h1>
        <p className="text-lg text-muted">{gone}</p>
      </main>
    );
  }

  if (!night) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-muted">
        {error ? (
          <>
            <p role="alert" className="text-center font-bold text-alert">{error}</p>
            <button type="button" onClick={look} className="btn btn-primary h-14 w-full font-display text-xl font-bold text-ink">Try again</button>
          </>
        ) : (
          "Loading..."
        )}
      </main>
    );
  }

  if (guest) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-10">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            setGuest(false);
            setError(null);
          }}
          className="flex h-12 w-12 items-center justify-center self-start rounded-full bg-surface"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1 className="font-display text-3xl font-semibold">Join as a guest</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            claim({ guestName: name, ageBand: band });
          }}
          className="flex flex-col gap-6"
        >
          <label className="flex flex-col gap-2">
            <span className="font-bold">Your first name</span>
            <input
              className="card h-16 px-4 font-display text-2xl font-bold outline-none focus:border-pick"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              autoComplete="given-name"
              autoCapitalize="words"
              required
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-bold">How old are you?</legend>
            <p className="-mt-1 mb-1 text-sm text-muted">So the quiz questions are fair for everyone.</p>
            <div className="grid grid-cols-2 gap-3">
              {BANDS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={band === b.value}
                  onClick={() => setBand(b.value)}
                  className={`h-14 rounded-md border-[3px] font-bold ${band === b.value ? "border-pick bg-go text-ink" : "border-ink bg-surface"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
          <p role="alert" aria-live="polite" className="min-h-6 text-center font-bold text-alert">{error ?? ""}</p>
          <button type="submit" disabled={busy || !name.trim() || !band} className="btn btn-primary h-15 font-display text-xl font-bold text-ink disabled:opacity-60">
            {busy ? "Joining..." : "Join game night"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-12">
      <div className="flex flex-col gap-1.5">
        <div className="font-display text-xl font-bold text-ink">Asher Games</div>
        <div className="text-muted">{night.host}&apos;s game night</div>
      </div>
      <h1 className="font-display text-4xl font-semibold leading-tight">Who are you?</h1>
      <p role="alert" aria-live="polite" className="-my-2 min-h-6 font-bold text-alert">{error ?? ""}</p>
      {night.people.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {night.people.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.taken || busy}
              onClick={() => claim({ memberId: p.id })}
              className="card flex flex-col items-center gap-3 px-3 py-5 disabled:opacity-50"
            >
              {p.avatar ? (
                <PlayerAvatar avatar={p.avatar} className="h-20 w-auto" label={p.name} />
              ) : (
                <span className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-ink font-display text-3xl text-ink" style={{ background: avatarColour(p.id) }}>
                  {initial(p.name)}
                </span>
              )}
              <span className="text-lg font-bold">{p.name}</span>
              {p.taken && <span className="-mt-2 text-sm font-semibold text-muted">already in</span>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setGuest(true);
          setError(null);
        }}
        className="btn btn-secondary h-15 font-display text-xl font-bold"
      >
        {night.people.length > 0 ? "I'm not on the list" : "Join with my name"}
      </button>
      <div className="mt-auto flex flex-col gap-2 border-t-[3px] border-ink pt-5">
        <p className="text-muted">Is this the TV or a laptop by the TV?</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => claim({ screen: true })}
          className="btn btn-secondary h-13 font-bold disabled:opacity-60"
        >
          Show on the TV
        </button>
      </div>
    </main>
  );
}
