"use client";

// Chat in a game night (Joshua, 2 Nov: remote play is flat without it).
// A small button in the header with a count of new messages; tapping it opens
// the chat over the screen, so it never covers a question or a vote by itself.
// Every message goes through the server (lib/rooms/chat); this phone only reads.

import { useCallback, useEffect, useRef, useState } from "react";
import { memberClient, message, postAsMember } from "@/lib/client/session";
import { CHAT_WORDS, type ChatMode } from "@/lib/chat/rules";
import { Avatar, type Person } from "./mr-white-play";

interface Line {
  id: string;
  member_id: string;
  body: string | null;
  quick: string | null;
  created_at: string;
}

interface Status {
  mode: ChatMode;
  chosen: ChatMode | null;
  isHost: boolean;
  quick: Record<string, string>;
}


export function Chat({
  roomId,
  me,
  people,
  isHost,
  chatOff,
}: {
  roomId: string;
  me: string;
  people: Map<string, Person>;
  /** The real host: only they switch chat on or off (a stand-in cannot). */
  isHost: boolean;
  /** The host has switched chat off for the night. */
  chatOff: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenUpTo, setSeenUpTo] = useState(() => new Date().toISOString());
  const [removing, setRemoving] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // "The host turned chat on." for a few seconds after it comes back.
  const [wasOff, setWasOff] = useState(chatOff);
  const [justOn, setJustOn] = useState(false);
  if (wasOff !== chatOff) {
    setWasOff(chatOff);
    setJustOn(!chatOff);
  }
  useEffect(() => {
    if (!justOn) return;
    const t = setTimeout(() => setJustOn(false), 8000);
    return () => clearTimeout(t);
  }, [justOn]);
  const headcount = people.size;

  const load = useCallback(async () => {
    const { data } = await memberClient()
      .from("room_messages")
      .select("id, member_id, body, quick, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(60);
    setLines(((data ?? []) as Line[]).reverse());
  }, [roomId]);

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await postAsMember("/api/rooms/chat", { roomId, ...payload }).catch(() => null);
      if (!res) return { error: "offline" };
      return res.json().catch(() => ({ error: "server_error" }));
    },
    [roomId]
  );

  // Messages arrive live; read them again on every change and (re)subscribe.
  useEffect(() => {
    const db = memberClient();
    const first = setTimeout(load, 0);
    const channel = db
      .channel(`chat-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` }, () => load())
      .subscribe((s) => {
        if (s === "SUBSCRIBED") load();
      });
    return () => {
      clearTimeout(first);
      db.removeChannel(channel);
    };
  }, [roomId, load]);

  // The chat setting: on opening, and when people come or go (a child arriving
  // turns automatic chat to quick replies only).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    call({ action: "status" }).then((s) => {
      if (alive && s && !s.error) setStatus(s as Status);
    });
    return () => {
      alive = false;
    };
  }, [open, call, headcount, chatOff]);

  // Chat switched off or back on: what was said is gone, so read again.
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [chatOff, load]);

  // While open, everything shown counts as read, and the newest is in view.
  useEffect(() => {
    if (!open || !lines.length) return;
    const t = setTimeout(() => {
      setSeenUpTo(lines[lines.length - 1].created_at);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, 0);
    return () => clearTimeout(t);
  }, [open, lines]);

  const unread = lines.filter((l) => l.member_id !== me && l.created_at > seenUpTo).length;
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name ?? "Someone");

  async function send(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await call({ action: "send", ...payload });
    setBusy(false);
    if (out?.error) {
      setError(message(out.error));
      return;
    }
    if ("text" in payload) setText("");
    load();
  }

  async function setMode(mode: ChatMode | null) {
    const out = await call({ action: "mode", mode });
    if (out?.error) setError(message(out.error));
    const s = await call({ action: "status" });
    if (s && !s.error) setStatus(s as Status);
  }

  async function remove(id: string) {
    setRemoving(null);
    const out = await call({ action: "remove", messageId: id });
    if (out?.error) setError(message(out.error));
    load();
  }

  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="btn btn-secondary relative h-10 px-4 text-sm font-bold"
      aria-label={unread ? `Chat, ${unread} new` : "Chat"}
    >
      Chat
      {unread > 0 && (
        <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-alert px-1 text-xs font-extrabold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  // Chat off: the button goes from every phone but the host's, with one plain line.
  if (chatOff && !isHost) return <span className="max-w-40 text-right text-sm font-bold text-muted">{CHAT_WORDS.turnedOff}</span>;
  if (!open) {
    return justOn && !isHost ? (
      <span className="flex items-center gap-2">
        <span className="max-w-32 text-right text-xs font-bold text-muted">{CHAT_WORDS.turnedOn}</span>
        {button}
      </span>
    ) : (
      button
    );
  }

  const mode = status?.mode;

  return (
    <>
      {button}
      <div className="fixed inset-0 z-50 flex flex-col bg-ground" role="dialog" aria-modal="true" aria-label="Chat">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 overflow-hidden px-5 pb-5 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl font-semibold">Chat</h2>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-primary h-12 px-5 font-display text-lg font-bold text-ink">
              Back to the game
            </button>
          </div>
          <p className="text-sm text-muted">Only people in tonight&apos;s room see this. It is deleted when the night ends.</p>

          {isHost && status && (
            <div className="card flex flex-col gap-1 p-2" role="group" aria-label="Chat switches">
              <Switch label={CHAT_WORDS.chat} on={status.mode !== "off"} onTap={() => setMode(status.mode === "off" ? null : "off")} />
              {status.mode !== "off" && (
                <Switch label={CHAT_WORDS.typing} on={status.mode === "typed"} onTap={() => setMode(status.mode === "typed" ? "quick" : "typed")} />
              )}
            </div>
          )}

          <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto py-2">
            {lines.length === 0 && <p className="m-auto text-center text-muted">No messages yet. Say hello.</p>}
            {lines.map((l) => (
              <div key={l.id} className={`flex items-start gap-2 ${l.member_id === me ? "flex-row-reverse" : ""}`}>
                <Avatar p={people.get(l.member_id)} size="h-9 w-9 text-base" />
                <div className={`card max-w-[78%] px-3 py-2 ${l.member_id === me ? "bg-surface" : ""}`}>
                  <p className="text-xs font-bold text-muted">{name(l.member_id)}</p>
                  <p className={l.quick ? "font-display text-xl font-semibold" : "text-lg"}>
                    {l.quick ? status?.quick?.[l.quick] ?? l.quick : l.body}
                  </p>
                  {status?.isHost && l.member_id !== me && (
                    removing === l.id ? (
                      <button type="button" onClick={() => remove(l.id)} className="mt-1 text-sm font-bold text-alert">
                        Tap again to remove
                      </button>
                    ) : (
                      <button type="button" onClick={() => setRemoving(l.id)} className="mt-1 text-sm font-bold text-muted">
                        Remove
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}

          {mode === "off" ? (
            <p className="text-center font-bold text-muted">{CHAT_WORDS.turnedOff}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
                {Object.entries(status?.quick ?? {}).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={busy}
                    onClick={() => send({ quick: key })}
                    className="rounded-full border-2 border-ink bg-surface px-3 py-2 font-bold disabled:opacity-60"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === "typed" && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send({ text });
                  }}
                >
                  <input
                    className="card h-14 min-w-0 flex-1 px-4 text-lg outline-none focus:border-pick"
                    value={text}
                    maxLength={120}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Say something"
                    aria-label="Message"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary h-14 px-5 font-display text-lg font-bold text-ink disabled:opacity-60">
                    Send
                  </button>
                </form>
              )}
              {mode === "quick" && (
                <p className="text-center text-sm text-muted">
                  {status?.chosen === "quick" ? "The host has set quick replies only." : "Quick replies only while a child is in the room. The host can change this."}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Switch({ label, on, onTap }: { label: string; on: boolean; onTap: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onTap} className="flex min-h-12 items-center justify-between rounded-2xl px-3 text-left text-lg font-bold">
      <span>{label}</span>
      <span className={`rounded-full border-2 border-ink px-4 py-1 text-sm ${on ? "bg-go text-ink" : "bg-surface-2 text-muted"}`}>{on ? CHAT_WORDS.on : CHAT_WORDS.off}</span>
    </button>
  );
}
