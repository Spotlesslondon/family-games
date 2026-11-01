"use client";

// Mr White on a player's phone. Each phase is one screen with one obvious
// thing to do, in big type: a six year old who reads slowly must be able to
// play it without help. Clues are said out loud, never typed.

import { useState } from "react";
import { initial, message } from "@/lib/client/session";

export interface Person {
  id: string;
  name: string;
  colour: string;
}

interface Reveal {
  mrWhite: string;
  word: string;
  votes: Record<string, string>;
  outcome: { winner: "mr_white" | "players"; how: string; guess?: string };
}

export interface MrWhitePublic {
  seen?: string[];
  order?: string[];
  turn?: number;
  rounds?: number;
  candidates?: string[];
  runoff?: boolean;
  voted?: string[];
  picked?: string;
  reveal?: Reveal;
}

export interface MrWhiteMine {
  role?: "player" | "mr_white";
  word?: string;
  vote?: string | null;
}

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const big = "font-display text-3xl font-semibold leading-tight";
const primary = "h-16 w-full rounded-full bg-go font-display text-2xl font-bold text-ground disabled:opacity-60";
const secondary = "h-14 w-full rounded-full border-2 border-line font-display text-xl font-bold disabled:opacity-60";

function Avatar({ p, size = "h-14 w-14 text-2xl" }: { p?: Person; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-ground ${size}`} style={{ background: p?.colour ?? "#A9B0CC" }}>
      {initial(p?.name ?? "?")}
    </span>
  );
}

/** The player's own secret, always one tap away, hidden by default so a neighbour cannot glance at it. */
function MySecret({ mine }: { mine: MrWhiteMine }) {
  const [shown, setShown] = useState(false);
  if (!mine.role) return null;
  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      className="flex min-h-12 items-center justify-between rounded-2xl bg-surface px-4 text-left"
      aria-label={shown ? "Hide my secret" : "Show my secret"}
    >
      <span className="text-sm font-bold tracking-widest text-muted">{mine.role === "mr_white" ? "YOU ARE" : "YOUR WORD"}</span>
      <span className="font-display text-xl font-bold text-go">{shown ? (mine.role === "mr_white" ? "Mr White" : mine.word) : "Tap to see"}</span>
    </button>
  );
}

export function MrWhitePlay({
  phase,
  state,
  mine,
  me,
  hostId,
  people,
  act,
}: {
  phase: string;
  state: MrWhitePublic;
  mine: MrWhiteMine;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);
  const [guess, setGuess] = useState("");
  const isHost = me === hostId;
  const name = (id?: string) => (id === me ? "You" : (id && people.get(id)?.name) || "Someone");
  const players = state.order ?? [];

  async function send(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false && out.reason) setError(message(out.reason));
  }

  const err = <p role="alert" aria-live="polite" className="min-h-7 text-center font-bold text-alert">{error ?? ""}</p>;

  // ---- 1. Everyone looks at their secret ------------------------------------
  if (phase === "reveal") {
    const seen = state.seen ?? [];
    const done = seen.includes(me);
    return (
      <section className="flex flex-1 flex-col gap-5">
        <h2 className={big}>{done ? "Waiting for everyone to look" : "Look at your secret"}</h2>
        {!done && (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface px-5 py-8 text-center">
            {!peek ? (
              <>
                <p className="text-lg text-muted">Keep your screen hidden from everyone else.</p>
                <button type="button" onClick={() => setPeek(true)} className={primary}>Show my secret</button>
              </>
            ) : mine.role === "mr_white" ? (
              <>
                <span className="text-sm font-bold tracking-widest text-muted">YOU ARE</span>
                <span className="font-display text-5xl font-bold text-go">Mr White</span>
                <p className="text-lg">You do not know the word. Listen to the others and pretend you do.</p>
              </>
            ) : (
              <>
                <span className="text-sm font-bold tracking-widest text-muted">YOUR SECRET WORD</span>
                <span className="font-display text-5xl font-bold text-go">{mine.word}</span>
                <p className="text-lg">One of you is Mr White and does not know it. Do not say it out loud.</p>
              </>
            )}
          </div>
        )}
        <p className="text-center text-muted">{seen.length} of {players.length} have looked</p>
        {err}
        <div className="mt-auto flex flex-col gap-3">
          {!done && peek && (
            <button type="button" disabled={busy} onClick={() => send("seen")} className={primary}>Got it</button>
          )}
          {isHost && (
            <button type="button" disabled={busy} onClick={() => send("start_clues")} className={secondary}>Start the clues now</button>
          )}
        </div>
      </section>
    );
  }

  // ---- 2. Clues, out loud, in turn ------------------------------------------
  if (phase === "clues") {
    const turn = state.turn ?? 0;
    const speaker = players[turn];
    const mine_turn = speaker === me;
    return (
      <section className="flex flex-1 flex-col gap-5">
        <MySecret mine={mine} />
        <h2 className={big}>{mine_turn ? "Your turn" : `${name(speaker)}'s turn`}</h2>
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-surface px-5 py-7 text-center">
          <Avatar p={people.get(speaker)} size="h-24 w-24 text-5xl" />
          <p className="text-xl font-bold">
            {mine_turn
              ? mine.role === "mr_white"
                ? "Say one word out loud. Bluff!"
                : "Say one word out loud that fits your secret word."
              : `Listen to ${name(speaker)}'s word.`}
          </p>
        </div>
        <ol className="flex flex-wrap gap-2" aria-label="Order">
          {players.map((id, i) => (
            <li key={id} className={`rounded-full px-3 py-1.5 text-sm font-bold ${i === turn ? "bg-go text-ground" : i < turn ? "bg-surface-2 text-muted line-through" : "bg-surface"}`}>
              {name(id)}
            </li>
          ))}
        </ol>
        {err}
        <div className="mt-auto flex flex-col gap-3">
          {mine_turn && (
            <button type="button" disabled={busy} onClick={() => send("clue_done", { turn })} className={primary}>I have said it</button>
          )}
          {isHost && !mine_turn && (
            <button type="button" disabled={busy} onClick={() => send("clue_done", { turn })} className={secondary}>
              {name(speaker)} has said it
            </button>
          )}
        </div>
      </section>
    );
  }

  // ---- 3. Another round, or vote ---------------------------------------------
  if (phase === "between") {
    return (
      <section className="flex flex-1 flex-col gap-5">
        <MySecret mine={mine} />
        <h2 className={big}>Round {state.rounds ?? 1} done</h2>
        <p className="text-lg text-muted">{isHost ? "Does everyone have a hunch? Go round again, or vote." : "The host is deciding: another round, or the vote."}</p>
        {err}
        {isHost && (
          <div className="mt-auto flex flex-col gap-3">
            <button type="button" disabled={busy} onClick={() => send("start_vote")} className={primary}>Vote now</button>
            <button type="button" disabled={busy} onClick={() => send("another_round")} className={secondary}>Another round of clues</button>
          </div>
        )}
      </section>
    );
  }

  // ---- 4. Who is Mr White? ---------------------------------------------------
  if (phase === "vote") {
    const voted = state.voted ?? [];
    const choices = (state.candidates ?? players).filter((id) => id !== me);
    const my = mine.vote ?? null;
    return (
      <section className="flex flex-1 flex-col gap-5">
        <MySecret mine={mine} />
        <h2 className={big}>{state.runoff ? "It's a tie. Vote again" : "Who is Mr White?"}</h2>
        <p className="text-muted">{my ? `You voted for ${name(my)}. You can change it until everyone has voted.` : "Tap who you think it is. Nobody sees your vote until the end."}</p>
        <ul className="grid grid-cols-2 gap-3">
          {choices.map((id) => (
            <li key={id}>
              <button
                type="button"
                disabled={busy}
                aria-pressed={my === id}
                onClick={() => send("vote", { memberId: id })}
                className={`flex w-full flex-col items-center gap-2 rounded-3xl border-4 px-3 py-4 ${my === id ? "border-go bg-surface-2" : "border-transparent bg-surface"}`}
              >
                <Avatar p={people.get(id)} />
                <span className="text-lg font-bold">{name(id)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-center text-muted">{voted.length} of {players.length} have voted</p>
        {err}
        {isHost && voted.length > 0 && voted.length < players.length && (
          <button type="button" disabled={busy} onClick={() => send("count_votes")} className={`${secondary} mt-auto`}>Count the votes now</button>
        )}
      </section>
    );
  }

  // ---- 5. Caught: Mr White's one guess ----------------------------------------
  if (phase === "guess") {
    const amMrWhite = mine.role === "mr_white";
    return (
      <section className="flex flex-1 flex-col gap-5">
        <h2 className={big}>{amMrWhite ? "You were caught!" : `${name(state.picked)} is Mr White!`}</h2>
        {amMrWhite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send("guess", { word: guess });
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-lg">Guess the secret word to steal the win. One go.</p>
            <input
              className="h-16 rounded-2xl border-2 border-surface-2 bg-surface px-4 font-display text-2xl font-bold outline-none focus:border-go"
              value={guess}
              onChange={(e) => setGuess(e.target.value.slice(0, 40))}
              autoCapitalize="none"
              autoComplete="off"
              aria-label="Your guess"
              required
            />
            {err}
            <button type="submit" disabled={busy || !guess.trim()} className={primary}>Guess</button>
          </form>
        ) : (
          <p className="text-xl">They get one guess at the word. If they get it, they still win.</p>
        )}
      </section>
    );
  }

  return null;
}

/** The end of a game: who won, who Mr White was, the word, and who voted for whom. */
export function MrWhiteResults({
  state,
  me,
  hostId,
  people,
  act,
}: {
  state: MrWhitePublic;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const [busy, setBusy] = useState(false);
  const r = state.reveal;
  if (!r) return null;
  const name = (id?: string) => (id === me ? "You" : (id && people.get(id)?.name) || "Someone");
  const mrWhiteWon = r.outcome.winner === "mr_white";
  const iWasMrWhite = r.mrWhite === me;
  const iWon = mrWhiteWon === iWasMrWhite;
  const why =
    r.outcome.how === "guessed"
      ? `Caught, but guessed the word: "${r.outcome.guess}".`
      : r.outcome.how === "caught"
        ? `Caught! Their guess was "${r.outcome.guess}".`
        : r.outcome.how === "tie"
          ? "The vote was a tie, twice. Mr White slipped away."
          : `Everyone picked ${name(state.picked)}, who was innocent.`;

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <h2 className="font-display text-4xl font-bold leading-tight text-go">{iWon ? "You win!" : mrWhiteWon ? "Mr White wins" : "The players win"}</h2>
      <div className="flex items-center gap-4 rounded-3xl bg-surface px-5 py-5">
        <Avatar p={people.get(r.mrWhite)} size="h-16 w-16 text-3xl" />
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-widest text-muted">MR WHITE WAS</span>
          <span className="font-display text-2xl font-bold">{name(r.mrWhite)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-3xl bg-surface px-5 py-5">
        <span className="text-sm font-bold tracking-widest text-muted">THE WORD WAS</span>
        <span className="font-display text-3xl font-bold text-go">{r.word}</span>
      </div>
      <p className="text-lg">{why}</p>
      <ul className="flex flex-col gap-1 text-muted" aria-label="Votes">
        {Object.entries(r.votes).map(([from, to]) => (
          <li key={from}>
            {name(from)} voted for {name(to)}
          </li>
        ))}
      </ul>
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "mr-white" })} className={primary}>Play again</button>
          <button type="button" disabled={busy} onClick={() => go("back_to_lobby")} className={secondary}>Back to the room</button>
        </div>
      ) : (
        <p className="mt-auto text-center text-muted">Waiting for the host</p>
      )}
    </section>
  );
}
