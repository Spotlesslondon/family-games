"use client";

// Fix the Machine on a phone. The Fixer sees the machine and nobody else
// does; every Helper sees the whole rulebook (Joshua, 20 Nov: "everyone
// should see the rule book") and nobody sees the answer. The talking happens
// at the table, not on the screen. Words are the CEO seat's copy deck
// (claude/machine-review-v1.md).

import { useEffect, useState } from "react";
import { useServerOffset } from "@/lib/client/clock";
import { message } from "@/lib/client/session";
import { LEVELS, MAX_WOBBLES, PART_NAMES, type DialSymbol, type KeyColour, type Lamp, type LampColour, type MachineLength, type MachineLevel, type MachineMine, type MachinePace, type MachinePublic, type MachineView, type PartKey, type Pattern, type Picture, type RuleCard } from "@/games/machine/shape";
import type { Person } from "./mr-white-play";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

const LAMP_FILL: Record<LampColour, string> = { red: "#e4572e", blue: "#2e6fe4", green: "#3da35d", yellow: "#f4c542", purple: "#8e5bd3", white: "#f7f3e8" };
const KEY_FILL: Record<KeyColour, string> = { red: "#f3a58f", blue: "#9dbcf2", green: "#a6d8b3", yellow: "#f9e08f" };

const ORDINAL = ["First", "Second", "Third"];

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
  const [shake, setShake] = useState(0);
  const [lastWobbles, setLastWobbles] = useState(s.wobbles);
  if (s.wobbles !== lastWobbles) {
    setLastWobbles(s.wobbles);
    if (s.wobbles > lastWobbles) setShake((n) => n + 1);
  }
  const isHost = me === hostId;
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const total = Object.keys(s.parts ?? {}).length;
  const fixed = Object.values(s.parts ?? {}).filter((v) => v === "fixed").length;
  const hostName = people.get(hostId)?.name ?? "the host";

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold tracking-widest text-muted">
          {s.round > 0 ? `MACHINE ${s.round} OF ${s.settings.rounds}` : `${s.settings.rounds} ${s.settings.rounds === 1 ? "MACHINE" : "MACHINES"}`} · LEVEL {s.settings.level}
        </span>
        {s.round > 0 && <Wobbles n={s.wobbles} />}
      </div>
      {s.round > 0 && phase === "fixing" && <PartLights parts={s.parts} />}
    </div>
  );

  if (phase === "briefing") {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <h2 className="font-display text-4xl font-bold leading-tight">How to fix it</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-lg">
          <li>The Fixer is the only one who can see the machine.</li>
          <li>Everyone else has the rulebook.</li>
          <li>Fixer: say what you see and answer every question.</li>
          <li>Helpers: ask questions until you find the rule that fits. Then say what to do.</li>
          <li>More than one Helper? Share out the parts: one takes the lamps, one the dial.</li>
          <li>Only the Fixer touches the machine.</li>
          <li>A wrong try is a wobble. Three wobbles and it goes pop.</li>
        </ul>
        {s.nextFixerId && <p className="font-bold">First up: {name(s.nextFixerId)} {s.nextFixerId === me ? "are" : "is"} the Fixer.</p>}
        {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("deal")} className={`${primary} mt-auto`}>
            Deal the machine
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName} to deal the machine.</p>
        )}
      </section>
    );
  }

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false) setError(message(out.reason ?? "server_error"));
  }

  if (phase === "round_over" && s.last) {
    const L = s.last;
    const last = s.round >= s.settings.rounds;
    return (
      <section className="relative flex flex-1 flex-col gap-4">
        {L.won && <Confetti />}
        {header}
        {L.won ? (
          <div className="machine-big my-4 flex flex-col items-center gap-2 text-center">
            <PartLights parts={s.parts} big />
            <h2 className="font-display text-7xl font-bold leading-none">Fixed!</h2>
          </div>
        ) : (
          <h2 className="font-display text-4xl font-bold leading-tight">Pop!</h2>
        )}
        {L.won ? (
          <p className="text-lg">
            All {total} parts fixed, {L.wobbles ? `${L.wobbles} ${L.wobbles === 1 ? "wobble" : "wobbles"}.` : "no wobbles. Clean fix: 1 extra point."}
          </p>
        ) : (
          <p className="text-lg">
            {L.popped === "time" ? "The clock ran out." : "Three wobbles and the machine gave up."} {L.fixed} of {total} parts fixed.
          </p>
        )}
        <p className="text-lg font-bold">
          {L.points} {L.points === 1 ? "point" : "points"} for the team.
        </p>
        <div className="card flex items-center justify-between px-5 py-4">
          <span className="font-bold">Team score</span>
          <span className="font-display text-3xl font-bold">{L.won ? <CountUp from={s.score - L.points} to={s.score} /> : s.score}</span>
        </div>
        {!last && s.nextFixerId && (
          <p className="text-muted">
            {L.won ? "" : "On to the next one. "}Next: Machine {s.round + 1}. {name(s.nextFixerId)} {s.nextFixerId === me ? "are" : "is"} the Fixer.
          </p>
        )}
        {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("deal", { round: s.round })} className={`${primary} mt-auto`}>
            {last ? "See the final score" : "Deal the next machine"}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName}</p>
        )}
      </section>
    );
  }

  const fixerName = name(s.fixerId);
  const hints = LEVELS[s.settings.level]?.hints ?? true;
  const clock = <Clock endsAt={phaseEndsAt} fire={() => act("advance_if_expired")} />;
  const flash = <Flash flash={s.flash} />;

  if (mine?.role === "fixer" && mine.round === s.round) {
    return (
      <section key={shake} className={`flex flex-1 flex-col gap-4 ${shake ? "machine-shake" : ""}`}>
        {header}
        {clock}
        <h2 className="font-display text-3xl font-bold leading-tight">You are the Fixer</h2>
        <p className="text-muted">Only you can see the machine. Say what you see. Serial number {mine.view.serial}.</p>
        {flash}
        {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
        {s.parts.lamps && <Lamps key={`lamps-${s.parts.lamps}`} view={mine.view} hints={hints} state={s.parts.lamps} busy={busy} onTry={(a) => attempt("lamps", a)} />}
        {s.parts.pictures && <PictureRow view={mine.view} hints={hints} fixed={s.parts.pictures === "fixed"} busy={busy} onTry={(a) => attempt("pictures", a)} />}
        {s.parts.dial && <Dial view={mine.view} hints={hints} fixed={s.parts.dial === "fixed"} busy={busy} onTry={(a) => attempt("dial", a)} />}
      </section>
    );
  }

  if (mine?.role === "helper" && mine.round === s.round) {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        {clock}
        <h2 className="font-display text-3xl font-bold leading-tight">You are a Helper</h2>
        <p className="text-muted">{fixerName} is the Fixer. Ask them questions to find the rule that fits.</p>
        {flash}
        <Rulebook cards={mine.cards} parts={s.parts} />
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      {header}
      {clock}
      <h2 className="font-display text-3xl font-semibold leading-tight">Watching this one</h2>
      <p className="text-muted">
        {fixerName} is fixing the machine. {fixed} of {total} fixed.
      </p>
      {flash}
    </section>
  );
}

/** A line every phone shows for a moment: a part fixed, a wobble, the lamps changing. */
function Flash({ flash }: { flash: MachinePublic["flash"] }) {
  // Hidden once its moment has passed; a new flash (a higher n) shows again.
  const [hidden, setHidden] = useState<number | null>(null);
  const n = flash?.n ?? null;
  useEffect(() => {
    if (n === null) return;
    const id = setTimeout(() => setHidden(n), 4000);
    return () => clearTimeout(id);
  }, [n]);
  useEffect(() => {
    if (n === null || !flash) return;
    buzz(flash.text.startsWith("Wobble") ? [60, 50, 60] : [40]);
  }, [n, flash]);
  if (!flash || hidden === flash.n) return null;
  const wobble = flash.text.startsWith("Wobble");
  if (wobble) {
    return (
      <p role="status" className="rounded-2xl bg-alert px-4 py-3 text-center font-display text-2xl font-bold text-white">
        {flash.text}
      </p>
    );
  }
  // A part fixed, or the lamps changing: a stamp slams down over the screen on every phone.
  const changed = flash.text.startsWith("The lamps changed");
  const words = changed ? "GO AGAIN" : flash.text.replace(/!$/, "").toUpperCase();
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-6" aria-live="assertive">
      <div className={`machine-stamp rounded-3xl border-[6px] px-6 py-4 text-center font-display text-5xl font-bold leading-none shadow-[8px_8px_0_#111] ${changed ? "border-ink bg-go text-ink" : "border-[#1f6b3a] bg-[#3da35d] text-white"}`}>
        {words}
        {changed && <div className="mt-2 text-base font-bold">The lamps changed. Find the rule again.</div>}
      </div>
    </div>
  );
}

/** A short buzz where the phone allows it (Android; iPhones ignore it). */
function buzz(pattern: number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate(pattern);
  } catch {
    // nothing to do; the buzz is a nicety
  }
}

/**
 * The machine's three lights, on every phone: red while a part is jammed,
 * green once it is fixed, amber between the two stages of the lamps. Helpers
 * cannot see the machine; this is how they watch it come back to life.
 */
function PartLights({ parts, big }: { parts: MachinePublic["parts"]; big?: boolean }) {
  const keys = (["lamps", "pictures", "dial"] as const).filter((k) => parts[k]);
  return (
    <div className={`flex ${big ? "justify-center gap-6" : "justify-around"} rounded-2xl border-[3px] border-ink bg-[#3b3f46] px-3 py-2`} aria-label="The machine's parts">
      {keys.map((k) => {
        const st = parts[k]!;
        const colour = st === "fixed" ? "#3da35d" : st === "stage2" ? "#f4c542" : "#e4572e";
        return (
          <div key={k} className="flex flex-col items-center gap-1">
            <span
              key={`${k}-${st}`}
              className={`rounded-full border-[3px] border-ink ${big ? "h-10 w-10" : "h-6 w-6"} ${st === "fixed" ? "machine-light-on" : ""}`}
              style={{ background: colour, boxShadow: `0 0 ${st === "fixed" ? 14 : 8}px 2px ${colour}` }}
              aria-label={`${PART_NAMES[k]}: ${st === "fixed" ? "fixed" : st === "stage2" ? "stage two" : "jammed"}`}
            />
            <span className={`font-bold text-white ${big ? "text-sm" : "text-[11px]"}`}>{PART_NAMES[k]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Falling confetti for a fixed machine. Drawn here, no library; hidden for reduced motion. */
function Confetti() {
  const colours = ["#ffd23f", "#3da35d", "#2e6fe4", "#e4572e", "#8e5bd3", "#f7f3e8"];
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 13) % 20) / 10,
    colour: colours[i % colours.length],
    w: 6 + (i % 3) * 3,
    h: 10 + (i % 4) * 3,
    round: i % 5 === 0,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="machine-confetti absolute top-0"
          style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.colour, borderRadius: p.round ? "50%" : 2, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  );
}

/** The team score counting up to its new value. */
function CountUp({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(Math.min(from, to));
  useEffect(() => {
    if (shown >= to) return;
    const id = setTimeout(() => setShown((v) => Math.min(v + 1, to)), 350);
    return () => clearTimeout(id);
  }, [shown, to]);
  return <>{Math.min(shown, to)}</>;
}

/** The whole rulebook, in tabs by part. Every Helper sees all of it; the Fixer never does. */
function Rulebook({ cards, parts }: { cards: RuleCard[]; parts: MachinePublic["parts"] }) {
  const tabs = (["lamps", "pictures", "dial", "tag"] as const).filter((t) => cards.some((c) => c.part === t));
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const label = (t: (typeof tabs)[number]) => (t === "tag" ? "Which manual" : PART_NAMES[t]);
  const isFixed = (t: (typeof tabs)[number]) => t !== "tag" && parts[t] === "fixed";
  // When the part on screen gets fixed, move to the next jammed part by itself.
  const [movedFor, setMovedFor] = useState<string | null>(null);
  const fixedKey = tabs.filter(isFixed).join(",");
  if (isFixed(tab) && movedFor !== fixedKey) {
    setMovedFor(fixedKey);
    const next = tabs.find((t) => t !== "tag" && !isFixed(t));
    if (next) setTab(next);
  }
  const active = tabs.includes(tab) ? tab : tabs[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold tracking-widest text-muted">THE RULEBOOK · THE FIXER CAN&apos;T SEE THIS</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rulebook">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active === t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-2 rounded-full border-2 border-ink px-4 py-2 font-display text-lg font-bold ${active === t ? "bg-go" : "bg-surface"}`}
          >
            {label(t)}
            {isFixed(t) && <Tick />}
          </button>
        ))}
      </div>
      {isFixed(active) && (
        <div className="flex flex-col items-center gap-2 rounded-3xl border-[4px] border-[#1f6b3a] bg-[#3da35d] px-5 py-6 text-center text-white shadow-[6px_6px_0_#111]">
          <span className="font-display text-4xl font-bold">{PART_NAMES[active as PartKey]} fixed</span>
          <span className="font-bold">Nothing more to read here.</span>
        </div>
      )}
      {!isFixed(active) && cards
        .filter((c) => c.part === active)
        .map((c, i) => (
          <div key={i} className="card flex flex-col gap-2 px-5 py-4" role="tabpanel">
            <span className="text-xs font-bold tracking-widest text-muted">{c.title.toUpperCase()}</span>
            {c.lines.map((l, j) => (
              <p key={j} className={j === 0 && c.part !== "tag" ? "font-bold" : "text-lg"}>
                <Arrows text={l} />
              </p>
            ))}
          </div>
        ))}
    </div>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 rounded-full border-2 border-ink bg-[#3da35d]" aria-label="fixed">
      <path d="M6 12.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "left to right" and "right to left" get a drawn arrow beside the words. */
function Arrows({ text }: { text: string }) {
  const parts = text.split(/(left to right|right to left)/);
  return (
    <>
      {parts.map((p, i) =>
        p === "left to right" || p === "right to left" ? (
          <span key={i} className="whitespace-nowrap">
            {p}
            <svg viewBox="0 0 20 12" className="ml-1 inline h-3 w-5 align-middle" aria-hidden>
              {p === "left to right" ? <path d="M1 6h17m-5-4 5 4-5 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M19 6H2m5-4-5 4 5 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function Wobbles({ n }: { n: number }) {
  const left = MAX_WOBBLES - n;
  return (
    <span className="flex items-center gap-1" aria-label={`Wobbles left: ${left}`}>
      {Array.from({ length: MAX_WOBBLES }, (_, i) => (
        <span key={i} className={`h-4 w-4 rounded-full border-2 border-ink ${i < n ? "bg-alert" : "bg-surface"}`} />
      ))}
      <span className="ml-1 text-sm font-bold">Wobbles left: {left}</span>
    </span>
  );
}

/** The machine's clock, from the server's time. At zero every phone asks the server to end the machine. */
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
// Joshua, 6 Nov 19:20: a part must look, feel and move like the part it is.
// Lamps are lamps with glass that glow; pictures are keys that press in; the
// dial is a knob that turns to the number. The panel shakes on a wobble.
// Nothing is judged until the Fixer presses Try it (CEO seat, change 3).

const PANEL = "rounded-3xl border-4 border-ink bg-[#3b3f46] p-4 text-white shadow-[6px_6px_0_#111]";

function TryBar({ ready, busy, onTry, onClear, dirty }: { ready: boolean; busy: boolean; onTry: () => void; onClear: () => void; dirty: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={busy || !ready} onClick={onTry} className={`${secondary} h-12 w-auto flex-1 px-5 text-lg disabled:opacity-60`}>
        Try it
      </button>
      <button type="button" disabled={busy || !dirty} onClick={onClear} className="h-12 rounded-2xl border-2 border-ink bg-surface px-4 font-bold disabled:opacity-40">
        Clear
      </button>
    </div>
  );
}

function Lamps({ view, hints, state, busy, onTry }: { view: MachineView; hints: boolean; state: "open" | "stage2" | "fixed"; busy: boolean; onTry: (a: number[]) => Promise<boolean> }) {
  const [pressed, setPressed] = useState<number[]>([]);
  const lamps = view.lamps ?? [];
  const fixed = state === "fixed";
  const small = lamps.length > 4;
  function press(i: number) {
    if (fixed || busy || pressed.includes(i)) return;
    setPressed([...pressed, i]);
  }
  async function tryIt() {
    if (pressed.length !== lamps.length) return;
    await onTry(pressed);
    setPressed([]);
  }
  return (
    <Part title={PART_NAMES.lamps} fixed={fixed} hint={fixed || !hints ? "" : "Press the lamps in the order your Helpers say."}>
      {state === "stage2" && <p className="text-sm font-bold">Stage two: the lamps have changed. Go again.</p>}
      <div className={`${PANEL} flex justify-around ${small ? "gap-0 px-2" : ""}`}>
        {lamps.map((l, i) => (
          <LampButton key={i} lamp={l} i={i} n={pressed.indexOf(i)} small={small} disabled={fixed || busy} onPress={() => press(i)} />
        ))}
      </div>
      {!fixed && <TryBar ready={pressed.length === lamps.length} dirty={pressed.length > 0} busy={busy} onTry={tryIt} onClear={() => setPressed([])} />}
    </Part>
  );
}

function LampButton({ lamp: l, i, n, small, disabled, onPress }: { lamp: Lamp; i: number; n: number; small: boolean; disabled: boolean; onPress: () => void }) {
  const blink = l.lit && l.blink === true;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-label={`${l.colour} lamp, ${blink ? "blinking" : l.lit ? "lit" : "off"}${n >= 0 ? ", pressed " + (n + 1) : ""}`}
      className="machine-key flex flex-col items-center gap-1"
      data-down={n >= 0}
    >
      <svg viewBox="0 0 64 80" className={small ? "h-14 w-11" : "h-20 w-16"} aria-hidden>
        <defs>
          <radialGradient id={`glow-${i}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="40%" stopColor={LAMP_FILL[l.colour]} stopOpacity="1" />
            <stop offset="100%" stopColor={LAMP_FILL[l.colour]} stopOpacity="0.9" />
          </radialGradient>
        </defs>
        {l.lit && <circle cx="32" cy="30" r="30" fill={LAMP_FILL[l.colour]} opacity="0.35" className={blink ? "machine-lamp-blink" : "machine-lamp-lit"} />}
        <rect x="14" y="52" width="36" height="14" rx="4" fill="#9a9ea6" stroke="#111" strokeWidth="2.5" />
        <rect x="20" y="64" width="24" height="10" rx="3" fill="#6b6f77" stroke="#111" strokeWidth="2.5" />
        <circle cx="32" cy="30" r="24" fill={l.lit ? `url(#glow-${i})` : "#2a2d33"} stroke="#111" strokeWidth="3" className={blink ? "machine-lamp-blink" : undefined} />
        {!l.lit && <circle cx="32" cy="30" r="18" fill={LAMP_FILL[l.colour]} opacity="0.25" />}
        {blink && <circle cx="32" cy="30" r="27.5" fill="none" stroke="#f7f3e8" strokeWidth="2" strokeDasharray="5 4" />}
        <ellipse cx="24" cy="20" rx="7" ry="4" fill="#fff" opacity={l.lit ? 0.7 : 0.15} />
        {n >= 0 && (
          <>
            <circle cx="32" cy="30" r="12" fill="#111" />
            <text x="32" y="36" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="inherit">
              {n + 1}
            </text>
          </>
        )}
      </svg>
      <span className="text-xs font-bold">{l.colour}</span>
      <span className={`text-xs ${l.lit ? "text-go" : "text-white/60"}`}>{blink ? "blinking" : l.lit ? "lit" : "off"}</span>
    </button>
  );
}

function PictureRow({ view, hints, fixed, busy, onTry }: { view: MachineView; hints: boolean; fixed: boolean; busy: boolean; onTry: (a: Picture[]) => Promise<boolean> }) {
  const [tapped, setTapped] = useState<Picture[]>([]);
  const keys = view.pictures ?? [];
  const small = keys.length > 4;
  function tap(p: Picture) {
    if (fixed || busy || tapped.includes(p)) return;
    setTapped([...tapped, p]);
  }
  async function tryIt() {
    if (tapped.length !== keys.length) return;
    await onTry(tapped);
    setTapped([]);
  }
  return (
    <Part title={PART_NAMES.pictures} fixed={fixed} hint={fixed || !hints ? "" : "Tap the pictures in the order your Helpers say."}>
      <div className={`${PANEL} flex justify-around ${small ? "px-2" : ""}`}>
        {keys.map((k) => {
          const n = tapped.indexOf(k.picture);
          return (
            <button
              key={k.picture}
              type="button"
              disabled={fixed || busy}
              onClick={() => tap(k.picture)}
              aria-label={`${k.colour ? k.colour + " " : ""}${k.picture}${k.flipped ? ", upside down" : ""}${n >= 0 ? ", pressed " + (n + 1) : ""}`}
              className="flex flex-col items-center gap-2"
            >
              <span
                className={`machine-key relative flex items-center justify-center rounded-xl border-[3px] border-ink shadow-[0_5px_0_#111] ${small ? "h-14 w-14" : "h-16 w-16"}`}
                style={{ background: k.colour ? KEY_FILL[k.colour] : "#f7f3e8" }}
                data-down={n >= 0}
              >
                <span style={k.flipped ? { transform: "rotate(180deg)", display: "inline-flex" } : { display: "inline-flex" }}>
                  <Icon p={k.picture} />
                </span>
                {n >= 0 && <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-go text-xs font-extrabold text-ink">{n + 1}</span>}
              </span>
              <span className="text-xs font-bold">{k.picture}</span>
            </button>
          );
        })}
      </div>
      {!fixed && <TryBar ready={tapped.length === keys.length} dirty={tapped.length > 0} busy={busy} onTry={tryIt} onClear={() => setTapped([])} />}
    </Part>
  );
}

/**
 * A knob with six positions, labelled with numbers or symbols. The combination
 * has one to three turns: each turn shows what it is read from (a pattern, the
 * lit lamps, the serial number), the Fixer turns the knob to each in order and
 * sets it, then tries the whole sequence at once.
 */
function Dial({ view, hints, fixed, busy, onTry }: { view: MachineView; hints: boolean; fixed: boolean; busy: boolean; onTry: (a: number[]) => Promise<boolean> }) {
  const [setting, setSetting] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const dial = view.dial ?? { turns: [{ source: "pattern" as const, pattern: "dots" as Pattern }], labels: "numbers" as const };
  const turns = dial.turns.length;
  const turn = done.length; // 0-based index of the turn being set
  const allSet = done.length === turns;
  const shown = setting ?? done[done.length - 1] ?? 1;
  const angle = (shown - 1) * 60;
  const label = (pos: number) => (dial.labels === "symbols" && dial.symbols ? dial.symbols[pos - 1] : String(pos));
  const reset = () => {
    setSetting(null);
    setDone([]);
  };
  function set() {
    if (setting === null || allSet) return;
    setDone([...done, setting]);
    setSetting(null);
  }
  async function tryIt() {
    if (!allSet) return;
    await onTry(done);
    reset();
  }
  const hint = fixed || !hints ? "" : "Turn the dial where your Helpers say.";
  return (
    <Part title={PART_NAMES.dial} fixed={fixed} hint={hint}>
      <div className={`${PANEL} flex flex-col items-center gap-3`}>
        <div className="flex items-center gap-3">
          {dial.turns.map((t, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold tracking-widest text-white/70">{turns === 1 ? "PATTERN" : `${ORDINAL[i].toUpperCase()} TURN`}</span>
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-xl border-[3px] bg-[#f7f3e8] ${i === turn && !fixed && !allSet ? "border-go shadow-[0_0_0_3px_#ffd23f]" : i < turn ? "border-[#3da35d] opacity-70" : "border-ink"}`}
                aria-label={`${ORDINAL[i]} turn: ${t.source === "pattern" ? t.pattern : t.source === "lamps" ? "the lamps" : "the serial number"}${i < turn ? ", set" : ""}`}
              >
                {t.source !== "pattern" ? <SourceIcon source={t.source} /> : t.pattern ? <PatternIcon p={t.pattern} /> : null}
              </span>
              <span className="text-xs font-bold">{t.source === "pattern" ? t.pattern : t.source === "lamps" ? "lamps" : "serial"}</span>
            </div>
          ))}
          {dial.light && (
            <div className="flex flex-col items-center gap-1" aria-label={`light: ${dial.light}`}>
              <span className="text-[10px] font-bold tracking-widest text-white/70">LIGHT</span>
              <span className="flex h-14 w-14 items-center justify-center">
                <span className="h-8 w-8 rounded-full border-[3px] border-ink" style={{ background: dial.light === "green" ? "#3da35d" : dial.light === "amber" ? "#f4c542" : "#e4572e", boxShadow: "0 0 14px 2px " + (dial.light === "green" ? "#3da35d" : dial.light === "amber" ? "#f4c542" : "#e4572e") }} />
              </span>
              <span className="text-xs font-bold">{dial.light}</span>
            </div>
          )}
        </div>
        <div className="relative h-48 w-48" role="group" aria-label={`Dial, pointing at ${label(shown)}`}>
          <svg viewBox="0 0 200 200" className="h-48 w-48" aria-hidden>
            <circle cx="100" cy="100" r="96" fill="#2a2d33" stroke="#111" strokeWidth="3" />
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const a = ((n - 1) * 60 - 90) * (Math.PI / 180);
              return <line key={n} x1={100 + Math.cos(a) * 78} y1={100 + Math.sin(a) * 78} x2={100 + Math.cos(a) * 88} y2={100 + Math.sin(a) * 88} stroke="#f7f3e8" strokeWidth="4" strokeLinecap="round" />;
            })}
            <g className="machine-knob" style={{ transform: `rotate(${angle}deg)` }}>
              <circle cx="100" cy="100" r="58" fill="#c9ccd2" stroke="#111" strokeWidth="3" />
              <circle cx="100" cy="100" r="46" fill="#e8eaee" stroke="#111" strokeWidth="2" />
              {Array.from({ length: 24 }, (_, i) => {
                const a = (i * 15 * Math.PI) / 180;
                return <line key={i} x1={100 + Math.cos(a) * 48} y1={100 + Math.sin(a) * 48} x2={100 + Math.cos(a) * 56} y2={100 + Math.sin(a) * 56} stroke="#111" strokeWidth="2" />;
              })}
              <polygon points="100,40 92,60 108,60" fill="#b3261e" stroke="#111" strokeWidth="2" />
              <circle cx="100" cy="100" r="8" fill="#111" />
            </g>
          </svg>
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const a = ((n - 1) * 60 - 90) * (Math.PI / 180);
            const x = 50 + Math.cos(a) * 44;
            const y = 50 + Math.sin(a) * 44;
            return (
              <button
                key={n}
                type="button"
                disabled={fixed || busy || allSet}
                aria-pressed={setting === n}
                aria-label={`turn to ${label(n)}`}
                onClick={() => setSetting(n)}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink font-display text-base font-bold ${setting === n ? "bg-go text-ink" : "bg-[#f7f3e8] text-ink"}`}
              >
                {dial.labels === "symbols" && dial.symbols ? <SymbolIcon s={dial.symbols[n - 1]} /> : n}
              </button>
            );
          })}
        </div>
        {dial.labels === "symbols" && dial.symbols && <p className="text-center text-xs text-white/80">Round the knob: {dial.symbols.join(", ")}.</p>}
        {done.length > 0 && <p className="text-center text-xs text-white/80">Set so far: {done.map((d) => label(d)).join(", ")}.</p>}
      </div>
      {!fixed && (
        <div className="flex flex-col gap-2">
          {!allSet && (
            <button type="button" disabled={busy || setting === null} onClick={set} className={`${secondary} h-12 text-lg disabled:opacity-60`}>
              {setting === null ? (turns === 1 ? "Turn the dial first" : `${ORDINAL[turn]} turn: turn the dial`) : turns === 1 ? `Set the dial to ${label(setting)}` : `${ORDINAL[turn]} turn: set it to ${label(setting)}`}
            </button>
          )}
          <TryBar ready={allSet} dirty={done.length > 0 || setting !== null} busy={busy} onTry={tryIt} onClear={reset} />
        </div>
      )}
    </Part>
  );
}

function Part({ title, fixed, hint, children }: { title: string; fixed: boolean; hint: string; children: React.ReactNode }) {
  return (
    <div className={`card flex flex-col gap-2 px-4 py-3 ${fixed ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-bold">{title}</span>
        {fixed ? (
          <span className="flex items-center gap-2 rounded-full bg-go px-3 py-1 text-sm font-extrabold">
            <span className="h-3 w-3 rounded-full border-2 border-ink bg-[#3da35d]" /> Fixed
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm font-bold text-muted">
            <span className="h-3 w-3 rounded-full border-2 border-ink bg-alert" /> Jammed
          </span>
        )}
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/** What a non-pattern turn of the dial is read from: the lamps, or the serial number. */
function SourceIcon({ source }: { source: "lamps" | "serial" }) {
  const c = "#1d1a14";
  if (source === "lamps") {
    return (
      <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
        {[10, 20, 30].map((x) => (
          <g key={x}>
            <circle cx={x} cy="16" r="6" fill={x === 20 ? "#2a2d33" : "#f4c542"} stroke={c} strokeWidth="2" />
            <rect x={x - 4} y="23" width="8" height="5" rx="1" fill="#9a9ea6" stroke={c} strokeWidth="1.5" />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect x="4" y="12" width="32" height="16" rx="3" fill="#f7f3e8" stroke={c} strokeWidth="2" />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="800" fill={c} fontFamily="inherit">
        No.
      </text>
    </svg>
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
    case "heart":
      return (
        <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
          <path d="M20 35 6 21a8 8 0 0 1 11-11l3 3 3-3a8 8 0 0 1 11 11z" fill="#e4572e" stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
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

// The knob's symbols at the harder levels. Original, simple, drawn here.
function SymbolIcon({ s }: { s: DialSymbol }) {
  const c = "#1d1a14";
  switch (s) {
    case "anchor":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <circle cx="12" cy="5" r="2.5" fill="none" stroke={c} strokeWidth="2" />
          <path d="M12 7.5v12M5 13c0 4 3 6.5 7 6.5s7-2.5 7-6.5M7 13H3m18 0h-4" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "bolt":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M13 2 5 13h6l-1 9 9-12h-6z" fill="#f4c542" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "cog":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={12 + Math.cos(a) * 6} y1={12 + Math.sin(a) * 6} x2={12 + Math.cos(a) * 10} y2={12 + Math.sin(a) * 10} stroke={c} strokeWidth="3" strokeLinecap="round" />;
          })}
          <circle cx="12" cy="12" r="6" fill="#c9ccd2" stroke={c} strokeWidth="2" />
          <circle cx="12" cy="12" r="2" fill={c} />
        </svg>
      );
    case "flag":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M6 22V3" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M6 4h12l-3 4 3 4H6z" fill="#e4572e" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "leaf":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M20 4C9 4 4 10 4 20c10 0 16-5 16-16z" fill="#3da35d" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M4 20 16 8" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "drop":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path d="M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z" fill="#2e6fe4" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
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
  const machines = s.settings.rounds;
  const master = s.allClean && s.tally.fixed === machines && machines > 0;
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{master ? "Master mechanics!" : "Team score"}</h2>
      <div className="card flex items-center justify-between px-5 py-4">
        <span className="font-bold">Team score</span>
        <span className="font-display text-4xl font-bold">{s.score}</span>
      </div>
      <p className="text-muted">
        {s.tally.fixed} fixed, {s.tally.popped} popped. Everyone on the team gets {s.score} {s.score === 1 ? "point" : "points"}.
      </p>
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "machine", options: { pace: s.settings.pace, length: s.settings.length, level: s.settings.level, fixedOnce: s.fixedOnce } })} className={primary}>
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
  level: MachineLevel;
}

