"use client";

// The big screen for a game night: the TV (or a laptop plugged into it) opens
// the host's link and taps "Show on the TV". It shows the invite code, big
// enough to read across a room, and everyone as they arrive. It watches only:
// it cannot take a turn or see anyone's secret (0014).

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarColour, initial, loadSession, memberClient } from "@/lib/client/session";
import { PlayerAvatar } from "@/components/avatars";
import { isAvatarKey, type AvatarKey } from "@/lib/avatars";
import { useShownAway } from "@/lib/client/away";
import { SIDE_NAME, findThemLine, hiddenLine, stillHiddenLine, stillIn, wasLine, type MrWhitePublic } from "@/app/(app)/room/[id]/mr-white-play";

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
  avatar: AvatarKey | null;
}

type State = "loading" | "watching" | "over" | "gone" | "offline";

export function BigScreen() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<State>("loading");
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [attempt, setAttempt] = useState(0);
  const shownAway = useShownAway(people);
  const dbRef = useRef<SupabaseClient | null>(null);

  const reload = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const [{ data: r }, { data: inRoom }, { data: names }] = await Promise.all([
      db.from("rooms").select("code, join_code, locked_at, host_member_id, status, current_game, phase, state").eq("id", id).maybeSingle(),
      db.from("room_members").select("member_id, connected, joined_at").eq("room_id", id).order("joined_at"),
      db.from("members").select("id, display_name, avatar"),
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
    const avatarOf = new Map((names ?? []).map((m) => [m.id as string, isAvatarKey(m.avatar) ? m.avatar : null]));
    setRoom(r as RoomRow);
    setPeople(
      (inRoom ?? []).map((m) => ({
        id: m.member_id as string,
        name: byId.get(m.member_id as string) ?? "Someone",
        connected: m.connected as boolean,
        avatar: avatarOf.get(m.member_id as string) ?? null,
      }))
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
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn btn-primary h-16 px-10 font-display text-2xl font-bold text-ink">Try again</button>
      </main>
    );
  }

  if (state === "over" || state === "gone") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
        <div className="font-display text-3xl font-bold text-ink">Asher Games</div>
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
        <div className="font-display text-[clamp(1.5rem,3vw,3rem)] font-bold text-ink">Asher Games</div>
        <div className="text-[clamp(1.1rem,2vw,2rem)] text-muted">{host ? `${host.name}'s game night` : "Game night"}</div>
      </header>

      {open ? (
        <section className="card flex flex-col items-center gap-3 px-8 py-[4vh] text-center">
          <span className="text-[clamp(1.1rem,2.2vw,2.2rem)] font-bold text-muted">Join on your phone: ashergames.com/j/</span>
          <span className="font-display text-[clamp(4rem,14vw,12rem)] font-bold leading-none tracking-[0.12em] text-ink">{room?.join_code}</span>
          <span className="text-[clamp(1rem,1.8vw,1.8rem)] text-muted">or tap the link the host sent to your group chat</span>
        </section>
      ) : (
        <section className="card px-8 py-[3vh] text-center text-[clamp(1.4rem,3vw,3rem)] font-bold">Everyone is in. The room is locked.</section>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-[clamp(1rem,1.6vw,1.6rem)] font-bold tracking-widest text-muted">IN THE ROOM · {people.length}</h2>
        <ul className="flex flex-wrap gap-[3vw]">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col items-center gap-3">
              <span className={!shownAway.has(p.id) ? "" : "opacity-40"}>
                <TvFace person={p} size="clamp(5rem,9vw,9rem)" wobble={!shownAway.has(p.id)} />
              </span>
              <span className={`text-[clamp(1.1rem,2vw,2rem)] font-bold ${!shownAway.has(p.id) ? "" : "text-muted"}`}>
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

/** A player on the TV: their character, or their initial if they have not picked one. */
function TvFace({ person, size = "clamp(5rem,10vw,10rem)", wobble = false }: { person?: Person; size?: string; wobble?: boolean }) {
  if (person?.avatar) {
    return (
      <span className="inline-flex" style={{ height: size }}>
        <PlayerAvatar avatar={person.avatar} className="h-full w-auto" label={person.name} wobble={wobble} />
      </span>
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full border-4 border-ink font-display text-ink"
      style={{ background: avatarColour(person?.id ?? ""), width: size, height: size, fontSize: `calc(${size} / 2.2)` }}
    >
      {initial(person?.name ?? "?")}
    </span>
  );
}

/** Mr White on the TV: only what everyone may see. Words appear only at the end. */
function MrWhiteTv({ phase, state, people }: { phase: string; state: MrWhitePublic; people: Person[] }) {
  const order = state.order ?? [];
  const left = stillIn(state);
  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const headline = "font-display text-[clamp(2.2rem,5.5vw,5.5rem)] font-bold leading-none";
  const sub = "text-[clamp(1.2rem,2.4vw,2.4rem)] text-muted";
  const face = (id?: string) => <TvFace person={people.find((p) => p.id === id)} />;
  const spoken = !!state.settings?.spoken;
  const outSide = new Map((state.out ?? []).map((o) => [o.id, o.side]));
  const speaker = phase === "clues" ? left[state.turn ?? 0] : undefined;

  // Everyone's clues so far, big enough to read from the sofa.
  const board = !spoken && (
    <ul className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))] gap-[1.5vw]">
      {order.map((id) => {
        const side = outSide.get(id);
        const theirs = (state.clues ?? []).filter((c) => c.id === id);
        return (
          <li key={id} className={`flex items-center gap-[1.2vw] rounded-md border-4 border-ink px-[1.2vw] py-[1vh] text-left shadow-[4px_4px_0_#111] ${id === speaker ? "bg-go" : "bg-surface"} ${side ? "opacity-50" : ""}`}>
            <TvFace person={people.find((p) => p.id === id)} size="clamp(3rem,5vw,5rem)" />
            <div className="flex min-w-0 flex-col">
              <span className="text-[clamp(1rem,1.6vw,1.6rem)] font-bold text-muted">
                {name(id)}
                {side ? ` · out, ${SIDE_NAME[side]}` : ""}
              </span>
              <span className="flex flex-wrap gap-x-[1vw] font-display text-[clamp(1.6rem,3vw,3rem)] font-bold leading-tight">
                {theirs.length === 0 && <span className="text-muted">{id === speaker ? "..." : ""}</span>}
                {theirs.map((c, i) => (
                  <span key={i} className={c.text ? "" : "text-muted"}>{c.text ?? "skipped"}</span>
                ))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );

  let body: React.ReactNode = null;
  if (phase === "reveal") {
    body = (
      <>
        <h1 className={headline}>Check your secret word</h1>
        <p className="text-[clamp(1.4rem,3vw,3rem)] font-bold">{findThemLine(state.settings)}</p>
        <p className={sub}>Keep your phone hidden. Hidden this game: {hiddenLine(state.settings)}.</p>
        <p className={sub}>{(state.seen ?? []).length} of {order.length} have looked</p>
      </>
    );
  } else if (phase === "clues") {
    body = (
      <>
        <h1 className={headline}>{name(speaker)}&apos;s turn</h1>
        <p className={sub}>{spoken ? "Say one word that fits your secret word" : "Type one word on your phone"}</p>
        {spoken ? (
          <>
            {face(speaker)}
            <ol className="flex flex-wrap justify-center gap-3">
              {left.map((id, i) => (
                <li key={id} className={`rounded-full px-5 py-2 text-[clamp(1rem,1.8vw,1.8rem)] font-bold ${i === state.turn ? "bg-go text-ink" : i < (state.turn ?? 0) ? "text-muted line-through" : "bg-surface"}`}>
                  {name(id)}
                </li>
              ))}
            </ol>
          </>
        ) : (
          board
        )}
      </>
    );
  } else if (phase === "between") {
    body = (
      <>
        <h1 className={headline}>Clues done</h1>
        <p className={sub}>Another round of clues, or time to vote?</p>
        {board}
      </>
    );
  } else if (phase === "vote") {
    body = (
      <>
        <h1 className={headline}>{state.runoff ? "A tie! Vote again" : state.settings?.mrWhite ? "Vote now. Find Mr White and the Wolves." : "Vote now. Find the Wolves."}</h1>
        <p className={sub}>Vote on your phone. {(state.voted ?? []).length} of {left.length} have voted.</p>
        {board}
      </>
    );
  } else if (phase === "guess") {
    const caught = (state.out ?? [])[(state.out ?? []).length - 1];
    body = (
      <>
        {face(caught?.id)}
        <h1 className={headline}>Mr White is out. One guess to win it all.</h1>
        <p className={sub}>One guess at the word to win...</p>
      </>
    );
  } else if (phase === "out") {
    const gone = state.lastVote?.outId ? (state.out ?? []).find((o) => o.id === state.lastVote!.outId) : undefined;
    body = gone ? (
      <>
        {face(gone.id)}
        <h1 className={headline}>{wasLine(gone.side, name(gone.id), false)}</h1>
        {gone.guess !== undefined && <p className={sub}>Mr White guessed &ldquo;{gone.guess}&rdquo;. Wrong!</p>}
        <p className={sub}>Still hidden: {stillHiddenLine(state)}</p>
      </>
    ) : (
      <>
        <h1 className={headline}>A tie again</h1>
        <p className={sub}>Nobody is out this round. Still hidden: {stillHiddenLine(state)}</p>
      </>
    );
  } else if (phase === "results" && state.reveal) {
    const r = state.reveal;
    const title = r.outcome.winner === "villagers" ? "The Villagers win!" : r.outcome.winner === "mr_white" ? "Mr White wins!" : "The hidden players win!";
    const hidden = order.filter((id) => r.sides[id] !== "villager");
    body = (
      <>
        <h1 className={`${headline} text-ink`}>{title}</h1>
        <p className="text-[clamp(1.5rem,3.2vw,3.2rem)]">
          Villagers had <span className="font-display font-bold text-ink">{r.villagerWord}</span>, Wolves had <span className="font-display font-bold">{r.wolfWord}</span>
        </p>
        <div className="flex flex-wrap justify-center gap-[3vw]">
          {hidden.map((id) => (
            <div key={id} className="flex flex-col items-center gap-2">
              {face(id)}
              <span className="text-[clamp(1.2rem,2.2vw,2.2rem)] font-bold">{name(id)}</span>
              <span className={sub}>{SIDE_NAME[r.sides[id]]}</span>
            </div>
          ))}
        </div>
        {r.outcome.winner === "mr_white" && <p className={sub}>Mr White guessed &ldquo;{r.outcome.guess}&rdquo;</p>}
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-[3vh] px-[4vw] py-[3vh] text-center">
      <div className="font-display text-[clamp(1.5rem,3vw,3rem)] font-bold text-ink">Mr White</div>
      {body}
    </main>
  );
}
