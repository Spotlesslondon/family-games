"use client";

// Nerve on a player's phone: one big button. Thumb down to get ready, keep it
// there while the pot climbs, lift it to bank. The bust number never reaches
// this phone before the round is over.

import { useCallback, useEffect, useRef, useState } from "react";
import { postAsMember } from "@/lib/client/session";
import { potAt, type NerveLength, type NerveLevel, type NervePace, type NervePublic } from "@/games/nerve/shape";
import { Avatar, type Person } from "./mr-white-play";
import { topPlaces } from "./quiz-play";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

/** A thumb lifted and put back within this long is a slip, not a bank. */
const GRACE_MS = 500;
/** How often each phone asks the server whether the pot has bust. */
const CHECK_MS = 1000;

/** The gap between this phone's clock and the server's, from the quickest of three asks. */
function useServerOffset(): number {
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

/** Keeps the screen on while the game is up, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    let lock: Lock | null = null;
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => null);
    get();
    const again = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      lock?.release().catch(() => null);
    };
  }, []);
}

export function NervePlay({
  roomId,
  phase,
  state: s,
  me,
  hostId,
  people,
  act,
}: {
  roomId: string;
  phase: string;
  state: NervePublic;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const offset = useServerOffset();
  useWakeLock();
  const [now, setNow] = useState(() => Date.now());
  const [down, setDown] = useState(false);
  const [pending, setPending] = useState(false);
  // This phone's own bank, shown at once: { round, value }.
  const [mine, setMine] = useState<{ nonce: string; value: number } | null>(null);
  const lift = useRef<{ at: number; value: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const isHost = me === hostId;
  const playing = me in (s.scores ?? {});
  const inRound = s.inRound?.includes(me) ?? false;
  const banked = (mine?.nonce === s.nonce ? mine : null) ?? (s.bankedOrder?.includes(me) ? { nonce: s.nonce, value: -1 } : null);
  const hasBanked = !!banked;
  const climbing = phase === "climb";
  const pot = potAt(now + offset, s.startAt, s.settings.beatMs);
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");

  // The pot ticks on this phone from the shared start time.
  useEffect(() => {
    if (!climbing) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [climbing]);

  const bank = useCallback(
    (value: number, keepalive = false) => {
      if (!climbing || !inRound || hasBanked) return;
      setMine({ nonce: s.nonce, value });
      postAsMember("/api/room-action", { roomId, type: "bank", payload: { round: s.round, claim: value } }, { keepalive }).catch(() => null);
    },
    [climbing, inRound, hasBanked, s.nonce, s.round, roomId]
  );

  // Every phone asks, about once a second, whether the pot has bust. The answer
  // is only "not yet" (nothing written) until the server says it has.
  useEffect(() => {
    if (!climbing) return;
    const id = setInterval(() => {
      postAsMember("/api/room-action", { roomId, type: "check", payload: { round: s.round } }).catch(() => null);
    }, CHECK_MS + Math.floor(Math.random() * 200));
    return () => clearInterval(id);
  }, [climbing, roomId, s.round]);

  // The screen going off or another app coming up banks at once.
  useEffect(() => {
    const hide = () => {
      const waiting = lift.current;
      if (document.visibilityState !== "hidden" || (!down && !waiting)) return;
      if (waiting) clearTimeout(waiting.timer);
      lift.current = null;
      setPending(false);
      bank(waiting ? waiting.value : potAt(Date.now() + offset, s.startAt, s.settings.beatMs), true);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [down, bank, offset, s.startAt, s.settings.beatMs]);

  function press(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (lift.current) {
      clearTimeout(lift.current.timer); // back down within the grace: a slip
      lift.current = null;
      setPending(false);
    }
    setDown(true);
    if (phase === "ready" && playing && !s.ready.includes(me)) act("ready", { round: s.round });
  }

  function release() {
    if (!down) return;
    setDown(false);
    if (!climbing || !inRound || banked) return;
    const value = potAt(Date.now() + offset, s.startAt, s.settings.beatMs);
    const timer = setTimeout(() => {
      lift.current = null;
      setPending(false);
      bank(value);
    }, GRACE_MS);
    lift.current = { at: Date.now(), value, timer };
    setPending(true);
  }

  // ---- reveal -------------------------------------------------------------

  if (phase === "reveal" && s.last) {
    const L = s.last;
    const order = [...Object.entries(L.banked)].sort((a, b) => b[1] - a[1]);
    return (
      <section className="flex flex-1 flex-col gap-4">
        <p className="text-center text-sm font-bold tracking-widest text-muted">ROUND {L.round} OF {s.settings.rounds}</p>
        <h2 className="text-center font-display text-5xl font-bold">Bust at {L.bust}</h2>
        {me in L.banked ? (
          <p className="text-center text-xl">You banked <b>{L.banked[me]}</b>.</p>
        ) : L.busted.includes(me) ? (
          <p className="text-center text-xl">You held on too long. Nothing this round.</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {order.map(([id, v]) => (
            <div key={id} className="card flex items-center gap-3 px-3 py-2">
              <Avatar p={people.get(id)} size="h-9 w-9 text-base" />
              <span className="flex-1 font-bold">{name(id)}</span>
              <span className="font-display text-2xl font-bold">{v}</span>
            </div>
          ))}
          {L.busted.length > 0 && <p className="text-center text-muted">Still holding at the bust: {L.busted.map(name).join(", ")}</p>}
        </div>
        <Standings scores={s.scores} me={me} people={people} name={name} />
        {isHost ? (
          <button type="button" onClick={() => act("next", { round: s.round })} className={`${primary} mt-auto`}>
            {s.round >= s.settings.rounds ? "See who won" : "Next round"}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for the host</p>
        )}
      </section>
    );
  }

  // ---- ready and climb ----------------------------------------------------

  const holding = (s.inRound ?? []).filter((id) => !s.bankedOrder.includes(id));
  const counting = climbing && pot === 0;
  const label = !playing
    ? "Watching this one"
    : phase === "ready"
      ? down
        ? "Keep holding"
        : "Put your thumb here"
      : !inRound
        ? "Sitting this round out"
        : banked
          ? "Banked"
          : down
            ? "Let go to bank"
            : pending
              ? "Banking"
              : "Press and hold";
  return (
    <section className="flex flex-1 flex-col gap-4 select-none">
      <p className="text-center text-sm font-bold tracking-widest text-muted">ROUND {s.round} OF {s.settings.rounds}</p>
      <div className="text-center">
        {climbing && !counting ? (
          <span className="font-display text-8xl font-bold leading-none tabular-nums" aria-live="off">
            {pot}
          </span>
        ) : (
          <span className="font-display text-5xl font-bold leading-none">{climbing ? "Ready..." : "Hold on"}</span>
        )}
        {banked && banked.value >= 0 && <p className="mt-2 text-xl">You banked {banked.value}</p>}
      </div>

      <button
        type="button"
        disabled={!playing || (climbing && (!inRound || !!banked))}
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        className={`mx-auto flex aspect-square w-full max-w-72 items-center justify-center rounded-full border-4 border-ink font-display text-3xl font-bold text-ink shadow-lg transition-transform disabled:opacity-50 ${
          down ? "scale-95 bg-go" : "bg-pick text-white"
        }`}
      >
        {label}
      </button>

      {phase === "ready" ? (
        <>
          <p className="text-center text-lg">
            {s.ready.length} of {Object.keys(s.scores).length} ready. The pot starts when everyone is holding.
          </p>
          {isHost && s.ready.length > 0 && s.ready.length < Object.keys(s.scores).length && (
            <button type="button" onClick={() => act("go", { round: s.round })} className={secondary}>
              Go now with {s.ready.length} {s.ready.length === 1 ? "player" : "players"}
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-center font-bold">Still holding: {holding.length ? holding.map(name).join(", ") : "nobody"}</p>
          {s.bankedOrder.length > 0 && <p className="text-center text-muted">Let go: {s.bankedOrder.map(name).join(", ")}</p>}
        </div>
      )}
    </section>
  );
}

function Standings({ scores, me, people, name }: { scores: Record<string, number>; me: string; people: Map<string, Person>; name: (id: string) => string }) {
  const top = topPlaces(scores);
  if (!top.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-widest text-muted">TOP SCORES</span>
      {top.map((r) => (
        <div key={r.id} className="card flex items-center gap-3 px-3 py-2">
          <span className="w-10 font-display text-xl font-bold">{["", "1st", "2nd", "3rd"][r.place]}</span>
          <Avatar p={people.get(r.id)} size="h-9 w-9 text-base" />
          <span className="flex-1 font-bold">{name(r.id)}</span>
          <span className="font-display text-2xl font-bold">{r.points}</span>
        </div>
      ))}
      {me in scores && !top.some((r) => r.id === me) && <p>You have {scores[me]} {scores[me] === 1 ? "point" : "points"}.</p>}
    </div>
  );
}

export function NerveResults({ state: s, me, hostId, people, act }: { state: NervePublic; me: string; hostId: string; people: Map<string, Person>; act: Act }) {
  const [busy, setBusy] = useState(false);
  const top = topPlaces(s.scores ?? {});
  const winners = top.filter((r) => r.place === 1);
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const go = async (type: string, payload?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  };
  const headline =
    winners.length === 0
      ? "Everyone held on too long"
      : winners.some((w) => w.id === me)
        ? winners.length > 1
          ? "You share the win!"
          : "Nerves of steel. You win!"
        : winners.length > 1
          ? `${winners.map((w) => name(w.id)).join(" and ")} share the win`
          : `${name(winners[0].id)} wins`;
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{headline}</h2>
      <Standings scores={s.scores} me={me} people={people} name={name} />
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "nerve", options: { pace: s.settings.pace, length: s.settings.length, level: s.settings.level } })} className={primary}>
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

/** The settings a host picks before starting Nerve. Defaults need no taps. */
export interface NerveOptions {
  pace: NervePace;
  length: NerveLength;
  level: NerveLevel;
}
