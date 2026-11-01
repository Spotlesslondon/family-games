"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { avatarColour, forgetSession, initial, message } from "@/lib/client/session";

interface Member {
  id: string;
  name: string;
}

export default function Join() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [family, setFamily] = useState<{ name: string; code: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [chosen, setChosen] = useState<{ member: Member; colour: string } | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function findFamily(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    // Six numbers is a game night code from a host's link: join that night.
    if (/^[0-9]{6}$/.test(code)) {
      router.push(`/j/${code}`);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/family/members?code=${encodeURIComponent(code)}`);
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(message(body.error));
      return;
    }
    setFamily(body.family);
    setMembers(body.members);
  }

  async function press(digit: string) {
    if (busy) return;
    const next = (pin + digit).slice(0, 4);
    setPin(next);
    setError(null);
    if (next.length < 4 || !chosen || !family) return;
    setBusy(true);
    const res = await fetch("/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: family.code, memberId: chosen.member.id, pin: next }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setPin("");
      setError(message(body.error, body));
      return;
    }
    forgetSession();
    router.push("/home");
  }

  if (chosen && family) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-6 pb-8 pt-10">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            setChosen(null);
            setPin("");
            setError(null);
          }}
          className="flex h-12 w-12 items-center justify-center self-start rounded-full bg-surface"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="flex h-26 w-26 items-center justify-center rounded-full font-display text-5xl font-bold text-ground" style={{ background: chosen.colour }}>
          {initial(chosen.member.name)}
        </span>
        <h1 className="font-display text-3xl font-semibold">Hi {chosen.member.name}</h1>
        <p className="text-lg text-muted">Type your secret PIN</p>
        <div className="my-2 flex gap-5" aria-label={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-5 w-5 rounded-full ${i < pin.length ? "bg-go" : "border-[3px] border-line"}`} />
          ))}
        </div>
        {/* Fixed space for the message, so the keypad never moves under a
            child's finger when it appears or clears. Two lines fit the
            longest PIN message. */}
        <p role="alert" aria-live="polite" className="flex min-h-14 w-[300px] items-center justify-center text-center font-bold text-alert">
          {error ?? ""}
        </p>
        <div className="grid w-[300px] grid-cols-3 gap-3.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="h-18 rounded-full bg-surface font-display text-3xl font-semibold">
              {d}
            </button>
          ))}
          <span />
          <button type="button" onClick={() => press("0")} className="h-18 rounded-full bg-surface font-display text-3xl font-semibold">0</button>
          <button type="button" aria-label="Delete last digit" onClick={() => setPin(pin.slice(0, -1))} className="flex h-18 items-center justify-center rounded-full">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#A9B0CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z" /><path d="M15 10l-4 4M11 10l4 4" /></svg>
          </button>
        </div>
        <p className="mt-auto text-center text-muted">Forgotten it? Ask a grown-up to reset it.</p>
      </main>
    );
  }

  if (family) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-6 pb-8 pt-14">
        <div className="flex flex-col gap-1.5">
          <div className="font-display text-xl font-bold text-go">Asher Games</div>
          <div className="text-muted">{family.name}</div>
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight">Who is playing?</h1>
        <div className="grid grid-cols-2 gap-4">
          {members.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setChosen({ member: m, colour: avatarColour(i) })}
              className="flex flex-col items-center gap-3 rounded-3xl border-2 border-surface-2 bg-surface px-3 py-5"
            >
              <span className="flex h-18 w-18 items-center justify-center rounded-full font-display text-3xl font-bold text-ground" style={{ background: avatarColour(i) }}>
                {initial(m.name)}
              </span>
              <span className="text-lg font-bold">{m.name}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-14">
      <div className="font-display text-xl font-bold text-go">Asher Games</div>
      <h1 className="font-display text-4xl font-semibold">Join your family</h1>
      <p className="text-muted">Type the six-letter family code, or the six-number game night code the host sent.</p>
      <form onSubmit={findFamily} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-bold">Code</span>
          <input
            className="h-16 rounded-2xl border-2 border-surface-2 bg-surface px-4 text-center font-display text-3xl font-bold uppercase tracking-[0.3em] text-go outline-none focus:border-go"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
        </label>
        {error && <p role="alert" className="font-bold text-alert">{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6} className="h-15 rounded-full bg-go font-display text-xl font-bold text-ground disabled:opacity-60">
          {busy ? "Looking..." : /^[0-9]{6}$/.test(code) ? "Join game night" : "Find my family"}
        </button>
      </form>
    </main>
  );
}
