"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  avatarColour,
  cachedToken,
  forgetSeat,
  forgetSession,
  initial,
  loadSession,
  memberClient,
  message,
  postAsMember,
  wasSeatIn,
  type ClientSession,
} from "@/lib/client/session";
import { Reconnect } from "@/app/(app)/reconnect";
import { MrWhitePlay, MrWhiteResults, type MrWhiteMine, type MrWhitePublic } from "./mr-white-play";

interface RoomRow {
  id: string;
  code: string;
  join_code: string | null;
  locked_at: string | null;
  host_member_id: string;
  status: "open" | "closed";
  phase: string;
  current_game: string | null;
  state: Record<string, unknown>;
}

/** Why a phone that joined by link is no longer in the night. */
type Ended = "left" | "removed" | "over" | "gone";

const ENDED: Record<Ended, { title: string; body: string }> = {
  left: { title: "You left the game night", body: "To join again, tap the host's link." },
  removed: { title: "You are out of this game night", body: "The host took you out of the room. To join again, ask for the link." },
  over: { title: "Game night is over", body: "The host has closed this room. Thanks for playing." },
  gone: { title: "You are not in this game night any more", body: "If it is still going, tap the host's link to join again." },
};

/** End this phone's link session for good: on the server, then in memory. */
async function endSeatSession() {
  const token = cachedToken();
  await fetch("/api/auth/signout", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }).catch(() => {});
  forgetSession();
  forgetSeat();
}

function inviteUrl(joinCode: string): string {
  return `${window.location.origin}/j/${joinCode}`;
}

interface Seat {
  id: string;
  name: string;
  connected: boolean;
  colour: string;
}

export function Lobby() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dbRef = useRef<SupabaseClient | null>(null);
  const seatRef = useRef<{ memberId: string } | null>(null);

  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // This phone's own secret for the game running (its word, its vote). Only
  // ever this player's row: the database rules allow nothing else (0004).
  const [mine, setMine] = useState<Record<string, unknown>>({});
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Every action asks the session store for a current token, so a game night
  // longer than the one-hour token keeps working.
  const act = useCallback(
    async (type: string, payload?: Record<string, unknown>) => {
      const res = await postAsMember("/api/room-action", { roomId: id, type, payload }).catch(() => null);
      if (!res) {
        setActionError(message("offline"));
        return null;
      }
      setActionError(null);
      return res.json().catch(() => ({}));
    },
    [id]
  );

  // Read the room through the database rules, as this member.
  const reload = useCallback(async () => {
    const db = dbRef.current;
    if (!db) return;
    const [{ data: r }, { data: inRoom }, { data: people }, { data: secret }] = await Promise.all([
      db.from("rooms").select("id, code, join_code, locked_at, host_member_id, status, phase, current_game, state").eq("id", id).maybeSingle(),
      db.from("room_members").select("member_id, connected, joined_at").eq("room_id", id).order("joined_at"),
      db.from("members").select("id, display_name").order("created_at"),
      db.from("room_private").select("state").eq("room_id", id).maybeSingle(),
    ]);
    setMine(((secret?.state as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>);
    if (!r) {
      // A phone that joined by link reads nothing once its seat ends (0012).
      if (wasSeatIn(id)) {
        setEnded((e) => e ?? "gone");
        endSeatSession();
        return;
      }
      setError("This room was not found.");
      return;
    }
    // A phone that joined by link: if it is no longer among the people in an
    // open room, the host removed it. (It can still read the room row itself.)
    const seat = seatRef.current;
    if (seat && r.status === "open" && !(inRoom ?? []).some((m) => m.member_id === seat.memberId)) {
      setEnded((e) => e ?? "removed");
      endSeatSession();
      return;
    }
    if (seat && r.status === "closed") {
      setEnded((e) => e ?? "over");
      endSeatSession();
      return;
    }
    const names = new Map((people ?? []).map((p) => [p.id as string, p.display_name as string]));
    setRoom(r as RoomRow);
    setSeats(
      (inRoom ?? []).map((m) => ({
        id: m.member_id as string,
        name: names.get(m.member_id as string) ?? "Someone",
        connected: m.connected as boolean,
        colour: avatarColour(m.member_id as string),
      }))
    );
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          if (wasSeatIn(id)) {
            forgetSeat();
            setEnded("gone");
            return;
          }
          router.replace("/join");
          return;
        }
        if (s.screen) {
          router.replace(`/tv/${s.screen.roomId}`);
          return;
        }
        setOffline(false);
        dbRef.current = memberClient();
        seatRef.current = s.seat ? { memberId: s.member.id } : null;
        setSession(s);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  // Join on arrival, subscribe to changes, and say when this phone goes away.
  useEffect(() => {
    const db = dbRef.current;
    if (!session || !db) return;
    let alive = true;
    // Show the room as soon as it can be read; the join runs alongside and the
    // screen catches up when it lands (Realtime, plus the reload below).
    reload();
    act("join").then(() => {
      if (alive) reload();
    });

    const channel = db
      .channel(`room-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_private", filter: `room_id=eq.${id}` }, () => reload())
      // On every (re)subscribe, read the room again: changes made while the
      // connection was down are not replayed.
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && alive) reload();
      });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Must be sent without waiting: the page may be frozen straight after.
        postAsMember("/api/room-action", { roomId: id, type: "presence", payload: { connected: false } }, { keepalive: true }).catch(() => {});
      } else {
        act("join").then(() => reload());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibility);
      db.removeChannel(channel);
    };
  }, [session, id, act, reload]);

  async function leave() {
    if ((await act("leave")) === null) return; // offline: stay, the message says why
    if (session?.seat) {
      setEnded("left");
      await endSeatSession();
      return;
    }
    router.replace("/home");
  }

  async function removePlayer(memberId: string) {
    if (confirmRemove !== memberId) {
      setConfirmRemove(memberId); // a second tap removes, so a slip does nothing
      return;
    }
    setConfirmRemove(null);
    const out = await act("remove_player", { memberId });
    if (out && out.ok === false) setActionError(message(out.reason));
  }

  async function setLock(locked: boolean) {
    const res = await postAsMember("/api/rooms/lock", { roomId: id, locked }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : { error: "offline" };
    if (!res?.ok) setActionError(message(body.error));
    else reload();
  }

  async function share(joinCode: string) {
    const url = inviteUrl(joinCode);
    const text = `Join our game night on Asher Games: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Closed the share sheet, or not allowed here: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionError("Could not copy. The code is on screen to read out.");
    }
  }

  async function closeRoom() {
    if ((await act("close_room")) === null) return;
    router.replace("/home");
  }

  if (ended) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-16">
        <div className="font-display text-xl font-bold text-go">Asher Games</div>
        <h1 className="font-display text-3xl font-semibold">{ENDED[ended].title}</h1>
        <p className="text-lg text-muted">{ENDED[ended].body}</p>
      </main>
    );
  }

  if (offline) return <Reconnect onRetry={() => setAttempt((n) => n + 1)} />;

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-16">
        <p className="text-lg">{error}</p>
        <button type="button" onClick={() => router.replace("/home")} className="h-14 rounded-full bg-go font-display text-xl font-bold text-ground">Back home</button>
      </main>
    );
  }

  if (!session || !room) {
    return <main className="flex flex-1 items-center justify-center text-muted">Loading...</main>;
  }

  if (room.status === "closed") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-16">
        <h1 className="font-display text-3xl font-semibold">Game night is over</h1>
        <p className="text-muted">The host has closed this room.</p>
        <button type="button" onClick={() => router.replace("/home")} className="h-14 rounded-full bg-go font-display text-xl font-bold text-ground">Back home</button>
      </main>
    );
  }

  const isHost = room.host_member_id === session.member.id;
  const here = seats.length; // everyone in the room; anyone away is marked on their avatar
  const connectedCount = seats.filter((s) => s.connected).length;
  const people = new Map(seats.map((s) => [s.id, { id: s.id, name: s.name, colour: s.colour }]));

  // A game is running, or has just finished: the game's own screens take over.
  if (room.current_game === "mr-white" && room.phase !== "lobby") {
    const hostEnd = isHost && room.phase !== "results" && (
      <button
        type="button"
        onClick={() => {
          // A second tap ends it, so a slip mid-game does nothing.
          if (!confirmEnd) {
            setConfirmEnd(true);
            return;
          }
          setConfirmEnd(false);
          act("end_game");
        }}
        className={`h-10 rounded-full px-4 text-sm font-bold ${confirmEnd ? "bg-alert text-ground" : "border-2 border-line text-muted"}`}
      >
        {confirmEnd ? "Tap to end the game" : "End this game"}
      </button>
    );
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-6 pt-10">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-go">Mr White</h1>
          {hostEnd}
        </div>
        {actionError && <p role="alert" className="text-center font-bold text-alert">{actionError}</p>}
        {room.phase === "results" ? (
          <MrWhiteResults state={room.state as MrWhitePublic} me={session.member.id} hostId={room.host_member_id} people={people} act={act} />
        ) : (
          <MrWhitePlay
            phase={room.phase}
            state={room.state as MrWhitePublic}
            mine={mine as MrWhiteMine}
            me={session.member.id}
            hostId={room.host_member_id}
            people={people}
            act={act}
          />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pb-6 pt-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Game night</h1>
        {isHost && <span className="rounded-full bg-go px-3 py-1.5 text-sm font-extrabold text-ground">You are host</span>}
      </div>

      {isHost && room.join_code && !room.locked_at ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">INVITE CODE</span>
          <span className="font-display text-5xl font-bold tracking-[0.2em] text-go">{room.join_code}</span>
          <span className="text-sm text-muted">Send the link to your group chat. Anyone with it can join until you lock the room. To show the night on a TV, open the same link on the TV and choose Show on the TV.</span>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join our game night on Asher Games: ${inviteUrl(room.join_code)}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-13 items-center justify-center rounded-full bg-go font-bold text-ground"
            >
              WhatsApp
            </a>
            <button type="button" onClick={() => share(room.join_code as string)} className="h-13 rounded-full border-2 border-line font-bold">
              {copied ? "Link copied" : "Share link"}
            </button>
          </div>
        </div>
      ) : isHost ? (
        <div className="flex items-center justify-between gap-3 rounded-3xl bg-surface px-5 py-4">
          <span className="font-bold">Room locked. The link no longer works.</span>
          <button type="button" onClick={() => setLock(false)} className="h-11 shrink-0 rounded-full border-2 border-line px-4 font-bold">Open again</button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-3xl bg-surface px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">YOU ARE</span>
          <span className="font-display text-3xl font-bold text-go">{session.member.name}</span>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold tracking-widest text-muted">IN THE ROOM · {here}</h2>
        <ul className="grid grid-cols-3 gap-3">
          {seats.map((s) => (
            <li key={s.id} className="flex flex-col items-center gap-2">
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full font-display text-2xl font-bold ${s.connected ? "text-ground" : "border-2 border-dashed bg-surface-2"}`}
                style={s.connected ? { background: s.colour } : { borderColor: s.colour, color: s.colour }}
              >
                {initial(s.name)}
              </span>
              <span className={`text-center text-sm font-bold ${s.connected ? "" : "text-muted"}`}>
                {s.id === session.member.id ? "You" : s.name}
                {s.id === room.host_member_id ? " · host" : ""}
                {!s.connected && <span className="block font-semibold">away</span>}
              </span>
              {isHost && s.id !== session.member.id && room.phase === "lobby" && (
                <button
                  type="button"
                  onClick={() => removePlayer(s.id)}
                  className={`h-9 rounded-full px-3 text-sm font-bold ${confirmRemove === s.id ? "bg-alert text-ground" : "border-2 border-line text-muted"}`}
                >
                  {confirmRemove === s.id ? "Tap to remove" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto flex flex-col gap-3">
        {actionError && <p role="alert" className="text-center font-bold text-alert">{actionError}</p>}
        {isHost ? (
          <>
            {room.join_code && !room.locked_at && (
              <button type="button" onClick={() => setLock(true)} className="h-15 rounded-full bg-go font-display text-xl font-bold text-ground">
                Everyone is in: lock the room
              </button>
            )}
            <button
              type="button"
              disabled={connectedCount < 3}
              onClick={async () => {
                const out = await act("start_game", { gameId: "mr-white" });
                if (out && out.ok === false) setActionError(message(out.reason));
              }}
              className="h-15 rounded-full border-2 border-go font-display text-xl font-bold text-go disabled:border-line disabled:text-muted disabled:opacity-60"
            >
              {connectedCount < 3 ? "Mr White needs 3 players" : "Play Mr White"}
            </button>
            <button type="button" onClick={closeRoom} className="h-13 rounded-full border-2 border-line font-bold">End game night</button>
          </>
        ) : (
          <>
            <p className="text-center text-muted">Waiting for the host to start a game</p>
            <button type="button" onClick={leave} className="h-13 rounded-full border-2 border-line font-bold">Leave the room</button>
          </>
        )}
      </div>
    </main>
  );
}
