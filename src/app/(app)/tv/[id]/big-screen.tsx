"use client";

// The big screen for a game night: the TV (or a laptop plugged into it) opens
// the host's link and taps "Show on the TV". It shows the invite code, big
// enough to read across a room, and everyone as they arrive. It watches only:
// it cannot take a turn or see anyone's secret (0014).

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarColour, initial, loadSession, memberClient } from "@/lib/client/session";
import type { MrWhitePublic } from "@/app/(app)/room/[id]/mr-white-play";

interface RoomRow {
  code: string;
  join_code: string | null;
  locked_at: string | null;
  host_member_id: string;
  status: "open" | "closed";
  current_game: string | null;
  phase: string;
  state: MrWhitePublic;
}

interface Person {
  id: string;
  name: string;
  connected: boolean;
}

type State = "loading" | "watching" | "over" | "gone" | "offline";

export function BigScreen() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>("loading");
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [attempt, setAttempt] = useState(0);
  const dbRef = useRef<SupabaseClient | null>(null);

  const reload = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const [{ data: r }, { data: inRoom }, { data: names }] = await Promise.all([
      db.from("rooms").select("code, join_code, locked_at, host_member_id, status, current_game, phase, state").eq("id", id).maybeSingle(),
      db.from("room_members").select("member_id, connected, joined_at").eq("room_id", id).order("joined_at"),
      db.from("members").select("id, display_name"),
    ]);
    if (!r) {
      setState("gone");
      return;
    }
    if (r.status === "closed") {
      setState("over");
      return;
    }
    // An open night always has its host in it. Seeing nobody means this TV's
    // access has ended (for example the device became a player instead).
    if (!inRoom || inRoom.length === 0) {
      setState("gone");
      return;
    }
    const byId = new Map((names ?? []).map((m) => [m.id as string, m.display_name as string]));
    setRoom(r as RoomRow);
    setPeople(
      (inRoom ?? []).map((m) => ({ id: m.member_id as string, name: byId.get(m.member_id as string) ?? "Someone", connected: m.connected as boolean }))
    );
    setState("watching");
  }, [id]);

  // Sign-in state: only a TV session for this room may watch it.
  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((s) => {
        if (cancelled) return;
        if (!s?.screen || s.screen.roomId !== id) {
          setState("gone");
          return;
        }
        dbRef.current = memberClient();
        reload();
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload, attempt]);

  // Live updates, and a re-read on every reconnect.
  useEffect(() => {
    const db = dbRef.current;
    if (!db || state === "gone" || state === "over") return;
    const channel = db
      .channel(`tv-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${id}` }, () => reload())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") reload();
      });
    // A TV sits untouched for hours: a slow re-read catches anything a dropped
    // connection missed.
    const poll = setInterval(reload, 30_000);
    return () => {
      clearInterval(poll);
      db.removeChannel(channel);
    };
    // Subscribe once the first read has succeeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reload, state === "watching"]);

  // Keep the TV's screen awake while the night is on, where the browser allows it.
  useEffect(() => {
    if (state !== "watching" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    take();
    const again = () => {
      if (document.visibilityState === "visible") take();
    };
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      lock?.release().catch(() => {});
    };
  }, [state]);

  if (state === "loading") return <main className="flex flex-1 items-center justify-center text-3xl text-muted">Loading...</main>;

  if (state === "offline") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-10 text-center">
        <h1 className="font-display text-5xl font-semibold">Can&apos;t reach Asher Games</h1>
        <p className="text-2xl text-muted">Check the Wi-Fi, then try again.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-16 rounded-full bg-go px-10 font-display text-2xl font-bold text-ground">Try again</button>
      </main>
    );
  }

  if (state === "over" || state === "gone") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
        <div className="font-display text-3xl font-bold text-go">Asher Games</div>
        <h1 className="font-display text-6xl font-semibold">{state === "over" ? "Game night is over" : "This TV is not showing a game night"}</h1>
        <p className="text-2xl text-muted">{state === "over" ? "Thanks for playing." : "To show the next one, open the host's link on this screen and choose Show on the TV."}</p>
      </main>
    );
  }

  const host = people.find((p) => p.id === room?.host_member_id);
  const open = !!room?.join_code && !room?.locked_at;

  if (room?.current_game === "mr-white" && room.phase !== "lobby") {
    return <MrWhiteTv phase={room.phase} state={room.state ?? {}} people={people} />;
  }

  return (
    <main className="flex flex-1 flex-col gap-10 px-[5vw] py-[4vh]">
      <header className="flex items-center justify-between">
        <div className="font-display text-[clamp(1.5rem,3vw,3rem)] font-bold text-go">Asher Games</div>
        <div className="text-[clamp(1.1rem,2vw,2rem)] text-muted">{host ? `${host.name}'s game night` : "Game night"}</div>
      </header>

      {open ? (
        <section className="flex flex-col items-center gap-3 rounded-[2rem] bg-surface px-8 py-[4vh] text-center">
          <span className="text-[clamp(1.1rem,2.2vw,2.2rem)] font-bold text-muted">Join on your phone: ashergames.com/j/</span>
          <span className="font-display text-[clamp(4rem,14vw,12rem)] font-bold leading-none tracking-[0.12em] text-go">{room?.join_code}</span>
          <span className="text-[clamp(1rem,1.8vw,1.8rem)] text-muted">or tap the link the host sent to your group chat</span>
        </section>
      ) : (
        <section className="rounded-[2rem] bg-surface px-8 py-[3vh] text-center text-[clamp(1.4rem,3vw,3rem)] font-bold">Everyone is in. The room is locked.</section>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-[clamp(1rem,1.6vw,1.6rem)] font-bold tracking-widest text-muted">IN THE ROOM · {people.length}</h2>
        <ul className="flex flex-wrap gap-[3vw]">
          {people.map((p, i) => (
            <li key={p.id} className="flex flex-col items-center gap-3">
              <span
                className={`flex h-[clamp(5rem,9vw,9rem)] w-[clamp(5rem,9vw,9rem)] items-center justify-center rounded-full font-display text-[clamp(2.2rem,4vw,4rem)] font-bold ${p.connected ? "text-ground" : "border-4 border-dashed bg-surface-2"}`}
                style={p.connected ? { background: avatarColour(i) } : { borderColor: avatarColour(i), color: avatarColour(i) }}
              >
                {initial(p.name)}
              </span>
              <span className={`text-[clamp(1.1rem,2vw,2rem)] font-bold ${p.connected ? "" : "text-muted"}`}>
                {p.name}
                {p.id === room?.host_member_id ? " · host" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-auto text-center text-[clamp(1.2rem,2.4vw,2.4rem)] text-muted">Waiting for the host to pick a game</p>
    </main>
  );
}

function TvFace({ colour, name }: { colour: string; name: string }) {
  const size = "clamp(5rem,10vw,10rem)";
  return (
    <span className="flex items-center justify-center rounded-full font-display font-bold text-ground" style={{ background: colour, width: size, height: size, fontSize: `calc(${size} / 2.2)` }}>
      {initial(name)}
    </span>
  );
}

/** Mr White on the TV: only what everyone may see. Words and votes appear only at the end. */
function MrWhiteTv({ phase, state, people }: { phase: string; state: MrWhitePublic; people: Person[] }) {
  const order = state.order ?? [];
  const colour = (id?: string) => avatarColour(Math.max(0, people.findIndex((p) => p.id === id)));
  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const headline = "font-display text-[clamp(2.5rem,7vw,7rem)] font-bold leading-none";
  const sub = "text-[clamp(1.2rem,2.6vw,2.6rem)] text-muted";
  const face = (id?: string) => <TvFace colour={colour(id)} name={name(id)} />;

  let body: React.ReactNode = null;
  if (phase === "reveal") {
    body = (
      <>
        <h1 className={headline}>Check your secret word</h1>
        <p className={sub}>Keep your phone hidden. {(state.seen ?? []).length} of {order.length} have looked.</p>
      </>
    );
  } else if (phase === "clues") {
    const turn = state.turn ?? 0;
    const speaker = order[turn];
    body = (
      <>
        {face(speaker)}
        <h1 className={headline}>{name(speaker)}&apos;s turn</h1>
        <p className={sub}>Say one word that fits the secret word</p>
        <ol className="flex flex-wrap justify-center gap-3">
          {order.map((id, i) => (
            <li key={id} className={`rounded-full px-5 py-2 text-[clamp(1rem,1.8vw,1.8rem)] font-bold ${i === turn ? "bg-go text-ground" : i < turn ? "text-muted line-through" : "bg-surface"}`}>
              {name(id)}
            </li>
          ))}
        </ol>
      </>
    );
  } else if (phase === "between") {
    body = (
      <>
        <h1 className={headline}>Round {state.rounds ?? 1} done</h1>
        <p className={sub}>Another round of clues, or time to vote?</p>
      </>
    );
  } else if (phase === "vote") {
    body = (
      <>
        <h1 className={headline}>{state.runoff ? "A tie! Vote again" : "Who is Mr White?"}</h1>
        <p className={sub}>Vote on your phone. {(state.voted ?? []).length} of {order.length} have voted.</p>
      </>
    );
  } else if (phase === "guess") {
    body = (
      <>
        {face(state.picked)}
        <h1 className={headline}>{name(state.picked)} is Mr White!</h1>
        <p className={sub}>One guess at the secret word to steal the win...</p>
      </>
    );
  } else if (phase === "results" && state.reveal) {
    const r = state.reveal;
    const won = r.outcome.winner === "mr_white";
    body = (
      <>
        <h1 className={`${headline} text-go`}>{won ? "Mr White wins!" : "Mr White is caught!"}</h1>
        <div className="flex items-center gap-[3vw]">
          {face(r.mrWhite)}
          <div className="flex flex-col text-left">
            <span className={sub}>Mr White was</span>
            <span className="font-display text-[clamp(2rem,5vw,5rem)] font-bold">{name(r.mrWhite)}</span>
          </div>
        </div>
        <p className="text-[clamp(1.5rem,3.5vw,3.5rem)]">
          The word was <span className="font-display font-bold text-go">{r.word}</span>
        </p>
        {r.outcome.guess && <p className={sub}>Mr White guessed &ldquo;{r.outcome.guess}&rdquo;</p>}
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-[4vh] px-[5vw] py-[4vh] text-center">
      <div className="font-display text-[clamp(1.5rem,3vw,3rem)] font-bold text-go">Mr White</div>
      {body}
    </main>
  );
}
