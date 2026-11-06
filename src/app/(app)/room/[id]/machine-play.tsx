"use client";

// Fix the Machine on a phone. The Fixer sees the machine and nobody else
// does; each Helper sees their piece of the rulebook and nobody else's. The
// talking happens at the table, not on the screen.

import { useEffect, useState } from "react";
import { useServerOffset } from "@/lib/client/clock";
import { message } from "@/lib/client/session";
import { MAX_WOBBLES, PART_NAMES, type LampColour, type MachineLength, type MachineMine, type MachinePace, type MachinePublic, type MachineView, type PartKey, type Pattern, type Picture } from "@/games/machine/shape";
import type { Person } from "./mr-white-play";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

const LAMP_FILL: Record<LampColour, string> = { red: "#e4572e", blue: "#2e6fe4", green: "#3da35d", yellow: "#f4c542", purple: "#8e5bd3", white: "#f7f3e8" };

export function MachinePlay({
  phase,
  phaseEndsAt,
  state: s,
  mine,
  me,
  hostId,
  people,
  act,
}: {
  phase: string;
  phaseEndsAt: string | null;
  state: MachinePublic;
  mine: MachineMine | null;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isHost = me === hostId;
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const total = Object.keys(s.parts ?? {}).length;
  const fixed = Object.values(s.parts ?? {}).filter((v) => v === "fixed").length;

  async function attempt(part: PartKey, answer: unknown) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await act("attempt", { round: s.round, part, answer });
    setBusy(false);
    if (out && out.ok === false) {
      setError(message(out.reason ?? "server_error"));
      return false;
    }
    return true;
  }

  const header = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold tracking-widest text-muted">ROUND {s.round} OF {s.settings.rounds}</span>
      <Wobbles n={s.wobbles} />
    </div>
  );

  if (phase === "round_over" && s.last) {
    const L = s.last;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <h2 className="font-display text-4xl font-bold leading-tight">{L.won ? "Fixed!" : L.popped === "time" ? "Out of time. Pop!" : "Too many wobbles. Pop!"}</h2>
        <p className="text-lg">
          {L.fixed} of {total} {total === 1 ? "part" : "parts"} fixed{L.wobbles ? `, ${L.wobbles} ${L.wobbles === 1 ? "wobble" : "wobbles"}` : ", no wobbles"}. {L.points} {L.points === 1 ? "point" : "points"} for the team.
        </p>
        <div className="card flex items-center justify-between px-5 py-4">
          <span className="font-bold">Team score</span>
          <span className="font-display text-3xl font-bold">{s.score}</span>
        </div>
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => act("next_round", { round: s.round })} className={`${primary} mt-auto`}>
            {s.round >= s.settings.rounds ? "See the final score" : "Next round"}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for the host</p>
        )}
      </section>
    );
  }

  const fixerName = name(s.fixerId);
  const clock = <Clock endsAt={phaseEndsAt} fire={() => act("advance_if_expired")} />;

  if (mine?.role === "fixer" && mine.round === s.round) {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        {clock}
        <h2 className="font-display text-3xl font-bold leading-tight">You are the Fixer</h2>
        <p className="text-muted">Say what you see. The others have the rulebook, but they cannot see the machine. Serial number {mine.view.serial}.</p>
        <p className="text-sm font-bold">
          {fixed} of {total} fixed. Who has which rule:{" "}
          {Object.entries(s.holders)
            .map(([id, parts]) => `${name(id)}: ${parts.map((p) => PART_NAMES[p].toLowerCase()).join(" and ")}`)
            .join("; ")}
          .
        </p>
        {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
        {s.parts.lamps && <Lamps view={mine.view} fixed={s.parts.lamps === "fixed"} busy={busy} onTry={(a) => attempt("lamps", a)} />}
        {s.parts.pictures && <PictureRow view={mine.view} fixed={s.parts.pictures === "fixed"} busy={busy} onTry={(a) => attempt("pictures", a)} />}
        {s.parts.dial && <Dial view={mine.view} fixed={s.parts.dial === "fixed"} busy={busy} onTry={(a) => attempt("dial", a)} />}
      </section>
    );
  }

  if (mine?.role === "helper" && mine.round === s.round) {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        {clock}
        <h2 className="font-display text-3xl font-bold leading-tight">You hold part of the rulebook</h2>
        <p className="text-muted">{fixerName} is the Fixer and can see the machine. Read your rules out loud. Do not show your phone.</p>
        <p className="text-sm font-bold">{fixed} of {total} fixed.</p>
        {mine.cards.map((c, i) => (
          <div key={i} className="card flex flex-col gap-2 px-5 py-4">
            <span className="text-xs font-bold tracking-widest text-muted">{c.title.toUpperCase()}</span>
            {c.lines.map((l, j) => (
              <p key={j} className={j === 0 ? "font-bold" : "text-lg"}>
                {l}
              </p>
            ))}
            {s.parts[c.part] === "fixed" && <span className="self-start rounded-full bg-go px-3 py-1 text-sm font-extrabold">Fixed</span>}
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      {header}
      {clock}
      <h2 className="font-display text-3xl font-semibold leading-tight">Watching this one</h2>
      <p className="text-muted">{fixerName} is fixing the machine. {fixed} of {total} fixed.</p>
    </section>
  );
}

function Wobbles({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${n} of ${MAX_WOBBLES} wobbles`}>
      {Array.from({ length: MAX_WOBBLES }, (_, i) => (
        <span key={i} className={`h-4 w-4 rounded-full border-2 border-ink ${i < n ? "bg-alert" : "bg-surface"}`} />
      ))}
      <span className="ml-1 text-sm font-bold">{n ? `${n} wobble${n === 1 ? "" : "s"}` : "steady"}</span>
    </span>
  );
}

/** The round's clock, from the server's time. At zero every phone asks the server to end the round. */
function Clock({ endsAt, fire }: { endsAt: string | null; fire: () => unknown }) {
  const offset = useServerOffset();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - (now + offset)) / 1000)) : null;
  const due = left === 0;
  useEffect(() => {
    if (!due) return;
    fire();
    const id = setInterval(fire, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, endsAt]);
  if (left === null) return null;
  const m = Math.floor(left / 60);
  const sec = String(left % 60).padStart(2, "0");
  return (
    <div className={`flex items-center justify-between rounded-2xl px-4 py-2 ${left <= 20 ? "bg-alert text-white" : "bg-surface-2"}`} role="timer" aria-live="off">
      <span className="font-bold">Time left</span>
      <span className="font-display text-3xl font-bold tabular-nums">
        {m}:{sec}
      </span>
    </div>
  );
}

// ---- the parts ------------------------------------------------------------

function Lamps({ view, fixed, busy, onTry }: { view: MachineView; fixed: boolean; busy: boolean; onTry: (a: number[]) => Promise<boolean> }) {
  const [pressed, setPressed] = useState<number[]>([]);
  const lamps = view.lamps ?? [];
  async function press(i: number) {
    if (fixed || busy || pressed.includes(i)) return;
    const next = [...pressed, i];
    setPressed(next);
    if (next.length === lamps.length) {
      await onTry(next);
      setPressed([]);
    }
  }
  return (
    <Part title={PART_NAMES.lamps} fixed={fixed} hint={fixed ? "" : "Press the lamps in the right order. Say which are lit and what colour they are."}>
      <div className="flex justify-around py-2">
        {lamps.map((l, i) => (
          <button
            key={i}
            type="button"
            disabled={fixed || busy}
            onClick={() => press(i)}
            aria-label={`${l.colour} lamp, ${l.lit ? "lit" : "off"}${pressed.includes(i) ? ", pressed" : ""}`}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-ink font-display text-xl font-bold ${l.lit ? "shadow-[0_0_0_6px_rgba(244,197,66,0.6)]" : "opacity-50"}`}
              style={{ background: LAMP_FILL[l.colour], color: l.colour === "white" || l.colour === "yellow" ? "#1d1a14" : "#fff" }}
            >
              {pressed.includes(i) ? pressed.indexOf(i) + 1 : ""}
            </span>
            <span className="text-xs font-bold">{l.colour}</span>
            <span className="text-xs text-muted">{l.lit ? "lit" : "off"}</span>
          </button>
        ))}
      </div>
      {!fixed && pressed.length > 0 && (
        <button type="button" onClick={() => setPressed([])} className="self-start text-sm font-bold text-pick underline">
          Start again
        </button>
      )}
    </Part>
  );
}

function PictureRow({ view, fixed, busy, onTry }: { view: MachineView; fixed: boolean; busy: boolean; onTry: (a: Picture[]) => Promise<boolean> }) {
  const [tapped, setTapped] = useState<Picture[]>([]);
  const pics = view.pictures ?? [];
  async function tap(p: Picture) {
    if (fixed || busy || tapped.includes(p)) return;
    const next = [...tapped, p];
    setTapped(next);
    if (next.length === pics.length) {
      await onTry(next);
      setTapped([]);
    }
  }
  return (
    <Part title={PART_NAMES.pictures} fixed={fixed} hint={fixed ? "" : "Tap the pictures in the right order. Say what pictures you have."}>
      <div className="flex justify-around py-2">
        {pics.map((p) => (
          <button key={p} type="button" disabled={fixed || busy} onClick={() => tap(p)} aria-label={`${p}${tapped.includes(p) ? ", tapped" : ""}`} className="flex flex-col items-center gap-1">
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-ink bg-surface">
              <Icon p={p} />
              {tapped.includes(p) && <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-go text-xs font-extrabold">{tapped.indexOf(p) + 1}</span>}
            </span>
            <span className="text-xs font-bold">{p}</span>
          </button>
        ))}
      </div>
      {!fixed && tapped.length > 0 && (
        <button type="button" onClick={() => setTapped([])} className="self-start text-sm font-bold text-pick underline">
          Start again
        </button>
      )}
    </Part>
  );
}

function Dial({ view, fixed, busy, onTry }: { view: MachineView; fixed: boolean; busy: boolean; onTry: (a: number) => Promise<boolean> }) {
  const [setting, setSetting] = useState<number | null>(null);
  const pattern = view.dial?.pattern ?? "dots";
  return (
    <Part title={PART_NAMES.dial} fixed={fixed} hint={fixed ? "" : `The dial shows ${pattern}. Set it to the right number.`}>
      <div className="flex items-center gap-4 py-2">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-ink bg-surface" aria-label={`pattern: ${pattern}`}>
          <PatternIcon p={pattern} />
        </span>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              disabled={fixed || busy}
              aria-pressed={setting === n}
              onClick={() => setSetting(n)}
              className={`h-12 w-12 rounded-full border-2 border-ink font-display text-xl font-bold ${setting === n ? "bg-go" : "bg-surface"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {!fixed && (
        <button
          type="button"
          disabled={busy || setting === null}
          onClick={async () => {
            if (setting === null) return;
            await onTry(setting);
            setSetting(null);
          }}
          className={`${secondary} h-12 w-auto self-start px-5 text-base disabled:opacity-60`}
        >
          Set the dial
        </button>
      )}
    </Part>
  );
}

function Part({ title, fixed, hint, children }: { title: string; fixed: boolean; hint: string; children: React.ReactNode }) {
  return (
    <div className={`card flex flex-col gap-2 px-4 py-3 ${fixed ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-bold">{title}</span>
        {fixed && <span className="rounded-full bg-go px-3 py-1 text-sm font-extrabold">Fixed</span>}
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  );
}

// Simple original pictures, drawn here so nothing is loaded from anywhere.
function Icon({ p }: { p: Picture }) {
  const c = "#1d1a14";
  switch (p) {
    case "sun":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <circle cx="20" cy="20" r="8" fill="#f4c542" stroke={c} strokeWidth="2.5" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={20 + Math.cos(a) * 12} y1={20 + Math.sin(a) * 12} x2={20 + Math.cos(a) * 17} y2={20 + Math.sin(a) * 17} stroke={c} strokeWidth="2.5" strokeLinecap="round" />;
          })}
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <polygon points="20,4 24.7,15 36,15.5 27,22.5 30,34 20,27.5 10,34 13,22.5 4,15.5 15.3,15" fill="#f4c542" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <path d="M26 5a15 15 0 1 0 9 27 12 12 0 0 1-9-27z" fill="#f7f3e8" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "fish":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <path d="M4 20c6-9 16-11 25-4l7-6v20l-7-6c-9 7-19 5-25-4z" fill="#2e6fe4" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="12" cy="18" r="2" fill={c} />
        </svg>
      );
    case "hat":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <rect x="12" y="6" width="16" height="18" rx="2" fill="#8e5bd3" stroke={c} strokeWidth="2.5" />
          <rect x="4" y="24" width="32" height="7" rx="3" fill="#8e5bd3" stroke={c} strokeWidth="2.5" />
        </svg>
      );
    case "key":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <circle cx="13" cy="20" r="7" fill="#f4c542" stroke={c} strokeWidth="2.5" />
          <path d="M20 20h16v6h-4v-3h-3v4h-4v-4h-5" fill="#f4c542" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "bell":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <path d="M20 5c-7 0-11 5-11 12v8l-4 5h30l-4-5v-8c0-7-4-12-11-12z" fill="#f4c542" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="20" cy="34" r="3" fill={c} />
        </svg>
      );
    case "boot":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <path d="M11 5h12v16l12 6v6H9v-6l2-6z" fill="#e4572e" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
  }
}

function PatternIcon({ p }: { p: Pattern }) {
  const c = "#1d1a14";
  switch (p) {
    case "stripes":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[8, 16, 24, 32].map((x) => (
            <line key={x} x1={x} y1="4" x2={x} y2="36" stroke={c} strokeWidth="4" />
          ))}
        </svg>
      );
    case "dots":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[10, 20, 30].flatMap((x) => [10, 20, 30].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.5" fill={c} />))}
        </svg>
      );
    case "waves":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[10, 20, 30].map((y) => (
            <path key={y} d={`M3 ${y}c4-6 8-6 12 0s8 6 12 0 8-6 12 0`} fill="none" stroke={c} strokeWidth="3" />
          ))}
        </svg>
      );
    case "checks":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[0, 1, 2, 3].flatMap((i) => [0, 1, 2, 3].filter((j) => (i + j) % 2 === 0).map((j) => <rect key={`${i}${j}`} x={4 + i * 8} y={4 + j * 8} width="8" height="8" fill={c} />))}
        </svg>
      );
    case "zigzags":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[12, 24].map((y) => (
            <polyline key={y} points={`3,${y + 5} 10,${y - 5} 17,${y + 5} 24,${y - 5} 31,${y + 5} 38,${y - 5}`} fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />
          ))}
        </svg>
      );
    case "rings":
      return (
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
          {[6, 11, 16].map((r) => (
            <circle key={r} cx="20" cy="20" r={r} fill="none" stroke={c} strokeWidth="3" />
          ))}
        </svg>
      );
  }
}

export function MachineResults({ state: s, me, hostId, act }: { state: MachinePublic; me: string; hostId: string; people: Map<string, Person>; act: Act }) {
  const [busy, setBusy] = useState(false);
  const go = async (type: string, payload?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  };
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{s.score === 0 ? "The machine won this time" : "Good work, team"}</h2>
      <div className="card flex items-center justify-between px-5 py-4">
        <span className="font-bold">Team score</span>
        <span className="font-display text-4xl font-bold">{s.score}</span>
      </div>
      <p className="text-muted">
        {s.settings.rounds} {s.settings.rounds === 1 ? "round" : "rounds"}. Everyone on the team gets {s.score} {s.score === 1 ? "point" : "points"}.
      </p>
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "machine", options: { pace: s.settings.pace, length: s.settings.length } })} className={primary}>
            Play again
          </button>
          <button type="button" disabled={busy} onClick={() => go("back_to_lobby")} className={secondary}>
            Back to the room
          </button>
        </div>
      ) : (
        <p className="mt-auto text-center text-muted">Waiting for the host</p>
      )}
    </section>
  );
}

export interface MachineOptions {
  pace: MachinePace;
  length: MachineLength;
}
