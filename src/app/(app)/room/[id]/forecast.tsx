"use client";

// The Family Forecast on a phone (Joshua, 4 Nov: "This will be our main game").
// A button in the header beside Chat, in the lobby and in every game, with a
// count of what is waiting for you. It never interrupts the game in front:
// nothing pops up, the count just changes. Tapping it opens the cards.

import { useCallback, useEffect, useState } from "react";
import { memberClient, message, postAsMember } from "@/lib/client/session";
import { CARDS_PER_FORECAST, FORECAST_PACKS, suitable, type ForecastPack } from "@/games/forecast/cards";
import { Avatar, type Person } from "./mr-white-play";
import { topPlaces } from "./quiz-play";

interface Fc {
  id: string;
  host_member_id: string;
  presenter_member_id: string | null;
  status: "open" | "finished";
}
interface Card {
  id: string;
  text: string;
  kind: "person" | "yesno";
  position: number;
  status: "open" | "claimed" | "settled";
  claimed_by: string | null;
  outcome: string | null;
  points: Record<string, number>;
}
interface Call {
  card_id: string;
  member_id: string;
  call: string;
}

const btn = "btn btn-secondary px-4 font-bold disabled:opacity-60";

export function Forecast({ roomId, me, people, isHost }: { roomId: string; me: string; people: Map<string, Person>; isHost: boolean }) {
  const [open, setOpen] = useState(false);
  const [fc, setFc] = useState<Fc | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = useCallback((id: string) => (id === me ? "You" : people.get(id)?.name ?? "Someone"), [me, people]);

  const load = useCallback(async () => {
    const db = memberClient();
    const { data: f } = await db
      .from("forecasts")
      .select("id, host_member_id, presenter_member_id, status")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFc((f as Fc) ?? null);
    if (!f) {
      setCards([]);
      setCalls([]);
      setPlayers([]);
      return;
    }
    const [c, k, p] = await Promise.all([
      db.from("forecast_cards").select("id, text, kind, position, status, claimed_by, outcome, points").eq("forecast_id", f.id).order("position"),
      db.from("forecast_calls").select("card_id, member_id, call").eq("forecast_id", f.id),
      db.from("forecast_players").select("member_id").eq("forecast_id", f.id),
    ]);
    setCards((c.data as Card[]) ?? []);
    setCalls((k.data as Call[]) ?? []);
    setPlayers(((p.data ?? []) as { member_id: string }[]).map((x) => x.member_id));
  }, [roomId]);

  useEffect(() => {
    const db = memberClient();
    const first = setTimeout(load, 0);
    const ch = db
      .channel(`forecast-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forecasts", filter: `room_id=eq.${roomId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "forecast_cards" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "forecast_calls" }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      db.removeChannel(ch);
    };
  }, [roomId, load]);

  async function send(payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const res = await postAsMember("/api/rooms/forecast", { roomId, ...payload }).catch(() => null);
    const out = res ? await res.json().catch(() => ({ error: "server_error" })) : { error: "offline" };
    setBusy(false);
    if (out?.error) {
      setError(message(out.error));
      return false;
    }
    load();
    return true;
  }

  const live = fc?.status === "open";
  const ruler = fc ? fc.presenter_member_id ?? fc.host_member_id : null;
  const iRule = live && (me === ruler || me === fc?.host_member_id);
  const myCall = (cardId: string) => calls.find((c) => c.card_id === cardId && c.member_id === me)?.call;
  const waiting = live
    ? cards.filter((c) => c.status === "open" && !myCall(c.id)).length + (iRule ? cards.filter((c) => c.status === "claimed").length : 0)
    : 0;

  const button = (
    <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary relative h-10 px-4 text-sm font-bold" aria-label={waiting ? `Forecast, ${waiting} waiting` : "Forecast"}>
      Forecast
      {waiting > 0 && (
        <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-pick px-1 text-xs font-extrabold text-white">
          {waiting}
        </span>
      )}
    </button>
  );
  if (!open) return button;

  const scores: Record<string, number> = {};
  for (const p of players) scores[p] = 0;
  for (const c of cards) for (const [id, n] of Object.entries(c.points ?? {})) scores[id] = (scores[id] ?? 0) + n;
  const label = (card: Card, v: string) => (card.kind === "yesno" ? (v === "yes" ? "Yes" : "No") : name(v));
  // On a person card you call someone else, never yourself.
  const choices = (card: Card) => (card.kind === "yesno" ? ["yes", "no"] : players.filter((p) => p !== me));
  // The ruler can rule that it was anyone, themselves included.
  const outcomes = (card: Card) => (card.kind === "yesno" ? ["yes", "no"] : players);

  return (
    <>
      {button}
      <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground" role="dialog" aria-modal="true" aria-label="Family Forecast">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-10 pt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl font-semibold">Family Forecast</h2>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-primary h-12 shrink-0 px-5 font-display text-lg font-bold text-ink">
              Back to the game
            </button>
          </div>
          {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}

          {!live && fc?.status !== "finished" && (isHost ? <Setup people={people} me={me} busy={busy} onStart={(p) => send({ action: "start", ...p })} /> : <p className="text-lg">No Forecast yet. The host can start one.</p>)}

          {live && (
            <>
              <p className="text-muted">
                Make a secret call on every card. When something happens, tap It happened. {ruler === me ? "You rule on the cards." : `${name(ruler!)} rules on the cards.`} Calls stay secret until a card is settled.
              </p>
              {cards.map((card) => {
                const mine = myCall(card.id);
                const right = Object.keys(card.points ?? {});
                return (
                  <div key={card.id} className="card flex flex-col gap-3 p-4">
                    <p className="font-display text-xl font-semibold leading-snug">{card.text}</p>
                    {card.status === "settled" ? (
                      <>
                        <p className="font-bold">It was: {label(card, card.outcome!)}</p>
                        <p>{right.length ? `Called it: ${right.map((id) => `${name(id)} (+${card.points[id]})`).join(", ")}` : "Nobody called it."}</p>
                        {mine && <p className="text-sm text-muted">Your call: {label(card, mine)}</p>}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Your call">
                          {choices(card).map((v) => (
                            <button
                              key={v}
                              type="button"
                              disabled={busy || card.status !== "open"}
                              aria-pressed={mine === v}
                              onClick={() => send({ action: "call", cardId: card.id, call: v })}
                              className={`flex items-center gap-2 rounded-full border-2 border-ink px-3 py-2 font-bold disabled:opacity-60 ${mine === v ? "bg-go" : "bg-surface"}`}
                            >
                              {card.kind === "person" && <Avatar p={people.get(v)} size="h-7 w-7 text-sm" />}
                              {label(card, v)}
                            </button>
                          ))}
                        </div>
                        <p className="text-sm text-muted">{mine ? `Your secret call: ${label(card, mine)}.${card.status === "open" ? " You can change it until it happens." : ""}` : "You have not called this one yet."}</p>
                        {card.status === "open" && (
                          <button type="button" disabled={busy} onClick={() => send({ action: "claim", cardId: card.id })} className={`${btn} h-11 self-start`}>
                            It happened
                          </button>
                        )}
                        {card.status === "claimed" && <p className="font-bold">{name(card.claimed_by ?? "")} says it happened.{iRule ? "" : ` Waiting for ${name(ruler!)}.`}</p>}
                        {iRule && (card.status === "claimed" || card.kind === "yesno") && (
                          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
                            <span className="text-sm font-bold">{card.status === "claimed" ? "Rule on it:" : "Rule now, if you know:"}</span>
                            <div className="flex flex-wrap gap-2">
                              {outcomes(card).map((v) => (
                                <button key={v} type="button" disabled={busy} onClick={() => send({ action: "rule", cardId: card.id, outcome: v })} className={`${btn} h-10`}>
                                  {label(card, v)}
                                </button>
                              ))}
                              {card.status === "claimed" && (
                                <button type="button" disabled={busy} onClick={() => send({ action: "rule", cardId: card.id, outcome: "notyet" })} className={`${btn} h-10`}>
                                  Not yet
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <Board scores={scores} me={me} people={people} name={name} />
              {isHost && <EndButton busy={busy} onEnd={() => send({ action: "end" })} />}
            </>
          )}

          {fc?.status === "finished" && (
            <>
              <Review cards={cards} scores={scores} me={me} people={people} name={name} label={label} />
              {isHost && (
                <button type="button" disabled={busy} onClick={() => setFc(null)} className="btn btn-primary h-14 font-display text-xl font-bold text-ink">
                  Start a new Forecast
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Setup({ people, me, busy, onStart }: { people: Map<string, Person>; me: string; busy: boolean; onStart: (p: Record<string, unknown>) => void }) {
  const [pack, setPack] = useState<ForecastPack>("everyday");
  const pool = suitable(pack, people.size);
  const [picked, setPicked] = useState<{ pack: ForecastPack; keys: string[] }>(() => ({ pack, keys: draw(pool) }));
  // Cards drawn for another pack, or no longer suitable because people left,
  // are topped up from the pool in order, so render stays pure.
  const kept = picked.pack === pack ? picked.keys.filter((k) => pool.some((c) => c.key === k)) : [];
  const keys = [...kept, ...pool.map((c) => c.key).filter((k) => !kept.includes(k))].slice(0, CARDS_PER_FORECAST);
  const [presenter, setPresenter] = useState<string | null>(null);
  const choosePack = (p: ForecastPack) => {
    setPack(p);
    setPicked({ pack: p, keys: draw(suitable(p, people.size)) });
  };
  const swap = (i: number) => setPicked({ pack, keys: swapOne(keys, i, pool) });
  if (pool.length < CARDS_PER_FORECAST) return <p className="text-lg">A Forecast needs at least 3 people in the room.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">Everyone makes a secret call on the same six cards. The day settles them. Rare right calls score most.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which day">
        {FORECAST_PACKS.map((p) => (
          <button key={p.key} type="button" aria-pressed={pack === p.key} onClick={() => choosePack(p.key)} className={`rounded-full border-2 border-ink px-4 py-2 font-bold ${pack === p.key ? "bg-go" : "bg-surface"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-2">
        {keys.map((k, i) => (
          <li key={k} className="card flex items-center gap-3 px-4 py-3">
            <span className="flex-1">{pool.find((c) => c.key === k)?.text}</span>
            <button type="button" onClick={() => swap(i)} className="text-sm font-bold text-pick underline">
              Swap
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <span className="font-bold">Who rules on the cards?</span>
        <div className="flex flex-wrap gap-2">
          {[[null, "Me, the host"] as const, ...[...people.values()].filter((p) => p.id !== me).map((p) => [p.id, p.name] as const)].map(([id, n]) => (
            <button key={id ?? "me"} type="button" aria-pressed={presenter === id} onClick={() => setPresenter(id)} className={`rounded-full border-2 border-ink px-3 py-2 font-bold ${presenter === id ? "bg-go" : "bg-surface"}`}>
              {n}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted">Anyone can be the Weather Presenter, a child too. You can still rule.</span>
      </div>
      <button type="button" disabled={busy} onClick={() => onStart({ pack, cards: keys, presenterId: presenter })} className="btn btn-primary h-16 font-display text-2xl font-bold text-ink disabled:opacity-60">
        Start the Forecast
      </button>
    </div>
  );
}

function swapOne(keys: string[], i: number, pool: { key: string }[]): string[] {
  const spare = pool.filter((c) => !keys.includes(c.key));
  if (!spare.length) return keys;
  const next = [...keys];
  next[i] = spare[Math.floor(Math.random() * spare.length)].key;
  return next;
}

function draw(pool: { key: string }[]): string[] {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, CARDS_PER_FORECAST).map((c) => c.key);
}

function Board({ scores, me, people, name }: { scores: Record<string, number>; me: string; people: Map<string, Person>; name: (id: string) => string }) {
  const top = topPlaces(scores);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-widest text-muted">TOP SCORES</span>
      {top.length === 0 ? (
        <p className="text-muted">Nobody has scored yet.</p>
      ) : (
        top.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 px-3 py-2">
            <span className="w-10 font-display text-xl font-bold">{["", "1st", "2nd", "3rd"][r.place]}</span>
            <Avatar p={people.get(r.id)} size="h-9 w-9 text-base" />
            <span className="flex-1 font-bold">{name(r.id)}</span>
            <span className="font-display text-2xl font-bold">{r.points}</span>
          </div>
        ))
      )}
      {me in scores && !top.some((r) => r.id === me) && <p>You have {scores[me]} {scores[me] === 1 ? "point" : "points"}.</p>}
    </div>
  );
}

function EndButton({ busy, onEnd }: { busy: boolean; onEnd: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
          return;
        }
        onEnd();
      }}
      className={`btn ${armed ? "btn-danger" : "btn-secondary"} h-12 font-bold`}
    >
      {armed ? "Tap again: end the Forecast and see the review" : "End the Forecast"}
    </button>
  );
}

function Review({
  cards,
  scores,
  me,
  people,
  name,
  label,
}: {
  cards: Card[];
  scores: Record<string, number>;
  me: string;
  people: Map<string, Person>;
  name: (id: string) => string;
  label: (c: Card, v: string) => string;
}) {
  let best: { card: Card; id: string; pts: number } | null = null;
  for (const c of cards) for (const [id, pts] of Object.entries(c.points ?? {})) if (!best || pts > best.pts) best = { card: c, id, pts };
  const top = topPlaces(scores);
  const winners = top.filter((r) => r.place === 1);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-4xl font-bold leading-tight">
        {winners.length === 0 ? "What a day" : winners.length > 1 ? `${winners.map((w) => name(w.id)).join(" and ")} share the Forecast` : `${name(winners[0].id)} won the Forecast`}
      </h3>
      {best && (
        <div className="card flex flex-col gap-1 p-4">
          <span className="text-xs font-bold tracking-widest text-muted">BEST CALL OF THE DAY</span>
          <span className="text-lg">{best.card.text}</span>
          <span className="font-display text-2xl font-bold">
            {name(best.id)} called {label(best.card, best.card.outcome!)}
          </span>
        </div>
      )}
      <Board scores={scores} me={me} people={people} name={name} />
    </div>
  );
}
