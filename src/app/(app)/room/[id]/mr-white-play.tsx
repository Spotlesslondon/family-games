"use client";

// Mr White on a player's phone. Each phase is one screen with one obvious
// thing to do, in big type: a six year old who reads slowly must be able to
// play it without help. Clues are typed by default and appear on every phone
// and the TV; the host can choose spoken clues for children who cannot type.

import { useState } from "react";
import { initial, message } from "@/lib/client/session";
import { PlayerAvatar } from "@/components/avatars";
import type { AvatarKey } from "@/lib/avatars";

export interface Person {
  id: string;
  name: string;
  colour: string;
  avatar?: AvatarKey | null;
}

type Side = "villager" | "wolf" | "mr_white";

interface Outcome {
  winner: "villagers" | "hidden" | "mr_white";
  how: string;
  guess?: string;
}

export interface MrWhitePublic {
  settings?: { wolves: number; mrWhite: boolean; spoken: boolean; mrWhiteChosen: boolean };
  seen?: string[];
  order?: string[];
  out?: { id: string; side: Side; round: number; guess?: string }[];
  round?: number;
  turn?: number;
  clues?: { id: string; round: number; text: string | null }[];
  candidates?: string[];
  runoff?: boolean;
  voted?: string[];
  lastVote?: { round: number; votes: Record<string, string>; outId?: string; tie?: boolean };
  reveal?: { villagerWord: string; wolfWord: string; sides: Record<string, Side>; outcome: Outcome };
}

export interface MrWhiteMine {
  word?: string;
  mrWhite?: boolean;
  vote?: string | null;
}

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const big = "font-display text-3xl font-semibold leading-tight";
const primary = "btn btn-primary h-16 w-full font-display text-2xl disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl disabled:opacity-60";

export const SIDE_NAME: Record<Side, string> = { villager: "a Villager", wolf: "a Wolf", mr_white: "Mr White" };

/** Who is hidden this game, in words: "1 Wolf and Mr White". */
export function hiddenLine(settings?: MrWhitePublic["settings"]): string {
  if (!settings) return "";
  const w = settings.wolves;
  const wolves = w > 0 ? `${w} ${w === 1 ? "Wolf" : "Wolves"}` : "";
  if (wolves && settings.mrWhite) return `${wolves} and Mr White`;
  return wolves || (settings.mrWhite ? "Mr White" : "nobody");
}

/** Who is still hidden, from what everyone has seen: "1 Wolf and Mr White". */
export function stillHiddenLine(state: MrWhitePublic): string {
  const out = state.out ?? [];
  const settings = state.settings;
  if (!settings) return "";
  const wolves = settings.wolves - out.filter((o) => o.side === "wolf").length;
  const mr = settings.mrWhite && !out.some((o) => o.side === "mr_white");
  return hiddenLine({ ...settings, wolves, mrWhite: mr });
}

/** The one-line explanation before the first clue (CEO seat wording, 2 Nov). */
export function findThemLine(settings?: MrWhitePublic["settings"]): string {
  const wolves = settings && settings.wolves === 1 ? "The Wolf has a different word." : "The Wolves have a different word.";
  return settings?.mrWhite
    ? `Most of you have the same word. ${wolves} Mr White has no word at all. Find them all.`
    : `Most of you have the same word. ${wolves} Find them all.`;
}

/** What everyone sees after a vote: the side only, never the word (CEO seat wording, 2 Nov). */
export function wasLine(side: Side, who: string, isMe: boolean): string {
  const subject = isMe ? "You were" : `${who} was`;
  if (side === "wolf") return `${subject} a Wolf.`;
  if (side === "mr_white") return `${subject} Mr White.`;
  return `${subject} a Villager. Keep looking.`;
}

/** Everyone still in the game, in speaking order. */
export function stillIn(state: MrWhitePublic): string[] {
  const out = new Set((state.out ?? []).map((o) => o.id));
  return (state.order ?? []).filter((id) => !out.has(id));
}

/** A player's character, or their initial in a circle if they have not picked one. */
export function Avatar({ p, size = "h-14 w-14 text-2xl", faded = false }: { p?: Person; size?: string; faded?: boolean }) {
  if (p?.avatar) {
    // The character is a little taller than wide: keep the size's height, let the width follow.
    const height = size.split(" ").find((c) => c.startsWith("h-")) ?? "h-14";
    return <PlayerAvatar avatar={p.avatar} className={`${height} w-auto shrink-0 ${faded ? "opacity-40" : ""}`} label={p.name} />;
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-[3px] border-ink font-display text-ink ${size} ${faded ? "opacity-40" : ""}`}
      style={{ background: p?.colour ?? "#F6E3B4" }}
    >
      {initial(p?.name ?? "?")}
    </span>
  );
}

/** The selected mark: a tick in a blue badge, so a choice never relies on colour alone. */
export function Tick() {
  return (
    <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-pick" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 L10 17.5 L19 7" />
      </svg>
    </span>
  );
}

/** The player's own secret, always one tap away, hidden by default so a neighbour cannot glance at it. */
function MySecret({ mine }: { mine: MrWhiteMine }) {
  const [shown, setShown] = useState(false);
  if (!mine.word && !mine.mrWhite) return null;
  return (
    <button
      type="button"
      onClick={() => setShown((v) => !v)}
      className="card flex min-h-12 items-center justify-between px-4 text-left"
      aria-label={shown ? "Hide my secret" : "Show my secret"}
    >
      <span className="text-sm font-bold tracking-widest text-muted">{mine.mrWhite ? "YOU ARE" : "YOUR WORD"}</span>
      <span className="font-display text-xl font-bold text-ink">{shown ? (mine.mrWhite ? "Mr White" : mine.word) : "Tap to see"}</span>
    </button>
  );
}

/** Every clue so far, one row per person, so anyone can look back before voting. */
function ClueBoard({ state, people, me, current }: { state: MrWhitePublic; people: Map<string, Person>; me: string; current?: string }) {
  const clues = state.clues ?? [];
  if (state.settings?.spoken) return null;
  const outSide = new Map((state.out ?? []).map((o) => [o.id, o.side]));
  return (
    <ul className="flex flex-col gap-2" aria-label="Clues so far">
      {(state.order ?? []).map((id) => {
        const p = people.get(id);
        const theirs = clues.filter((c) => c.id === id);
        const side = outSide.get(id);
        return (
          <li key={id} className={`flex items-center gap-3 rounded-md border-[3px] border-ink px-3 py-2 ${id === current ? "bg-go" : "bg-surface"}`}>
            <Avatar p={p} size="h-10 w-10 text-lg" faded={!!side} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={`text-sm font-bold ${side ? "text-muted" : ""}`}>
                {id === me ? "You" : (p?.name ?? "Someone")}
                {side ? ` · out, was ${SIDE_NAME[side]}` : ""}
              </span>
              <span className="flex flex-wrap gap-x-3 font-display text-xl font-bold">
                {theirs.length === 0 && <span className="text-base font-normal text-muted">{id === current ? "thinking..." : "no clue yet"}</span>}
                {theirs.map((c, i) => (
                  <span key={i} className={c.text ? "" : "text-base font-normal text-muted"}>{c.text ?? "skipped"}</span>
                ))}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
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
  const [clue, setClue] = useState("");
  // The vote tapped on this phone, for this round of voting only, shown at once
  // while the server catches up. A new round or a run-off has a new key.
  const [tapped, setTapped] = useState<{ key: string; id: string } | null>(null);
  const voteKey = `${state.round ?? 0}:${state.runoff ? "runoff" : "vote"}`;
  const pendingVote = tapped && tapped.key === voteKey ? tapped.id : null;
  const setPendingVote = (id: string | null) => setTapped(id ? { key: voteKey, id } : null);
  const isHost = me === hostId;
  const name = (id?: string) => (id === me ? "You" : (id && people.get(id)?.name) || "Someone");
  const everyone = state.order ?? [];
  const left = stillIn(state);
  const amOut = !left.includes(me);
  const spoken = !!state.settings?.spoken;

  async function send(type: string, payload?: Record<string, unknown>, evenIfBusy = false): Promise<boolean> {
    if (busy && !evenIfBusy) return false;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false && out.reason) {
      setError(message(out.reason));
      return false;
    }
    return true;
  }

  const err = <p role="alert" aria-live="polite" className="min-h-7 text-center font-bold text-alert">{error ?? ""}</p>;
  const outBanner = amOut && (
    <p className="card px-4 py-3 text-center font-bold text-muted">You are out. Watch, and see who wins.</p>
  );

  // ---- 0. Not in this game: watch, with a plain explanation -----------------
  if (everyone.length > 0 && !everyone.includes(me)) {
    return (
      <section className="flex flex-1 flex-col gap-5">
        <h2 className={big}>You are watching this game</h2>
        <p className="card px-5 py-5 text-lg">
          This game started while your phone was away, so you have no word this time. Keep this screen open: you will be in the next game.
        </p>
        <ClueBoard state={state} people={people} me={me} />
      </section>
    );
  }

  // ---- 1. Everyone looks at their secret ------------------------------------
  if (phase === "reveal") {
    const seen = state.seen ?? [];
    const done = seen.includes(me);
    return (
      <section className="flex flex-1 flex-col gap-5">
        <h2 className={big}>{done ? "Waiting for everyone to look" : "Look at your secret"}</h2>
        {!done && (
          <div className="card flex flex-col items-center gap-4 px-5 py-8 text-center">
            {!peek ? (
              <>
                <p className="text-lg text-muted">Keep your screen hidden from everyone else.</p>
                <button type="button" onClick={() => setPeek(true)} className={primary}>Show my secret</button>
              </>
            ) : mine.mrWhite ? (
              <>
                <span className="text-sm font-bold tracking-widest text-muted">YOU ARE</span>
                <span className="font-display text-5xl font-bold text-ink">Mr White</span>
                <p className="text-lg">You have no word. Read the others&apos; clues and pretend you do.</p>
              </>
            ) : (
              <>
                <span className="text-sm font-bold tracking-widest text-muted">YOUR SECRET WORD</span>
                <span className="font-display text-5xl font-bold text-ink">{mine.word}</span>
                <p className="text-lg">A few players have a different word, and nobody knows if it is them. Never say your word.</p>
              </>
            )}
          </div>
        )}
        <p className="card px-4 py-3 text-center text-lg font-bold">{findThemLine(state.settings)}</p>
        <p className="text-center text-muted">Hidden this game: {hiddenLine(state.settings)}</p>
        <p className="text-center text-muted">{seen.length} of {everyone.length} have looked</p>
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

  // ---- 2. Clues, in turn: typed, or said out loud ---------------------------
  if (phase === "clues") {
    const turn = state.turn ?? 0;
    const speaker = left[turn];
    const myTurn = speaker === me;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {outBanner || <MySecret mine={mine} />}
        <h2 className={big}>{myTurn ? "Your turn" : `${name(speaker)}'s turn`}</h2>
        {myTurn && !spoken ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await send("clue", { turn, text: clue })) setClue("");
            }}
            className="flex flex-col gap-3"
          >
            <p className="text-lg">{mine.mrWhite ? "Type one word that fits the others' clues. Bluff!" : "Type one word that fits your secret word. Not the word itself."}</p>
            <input
              className="card h-16 px-4 font-display text-2xl font-bold outline-none focus:border-pick"
              value={clue}
              onChange={(e) => setClue(e.target.value.slice(0, 20))}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-label="Your clue"
              required
            />
            {err}
            <button type="submit" disabled={busy || !clue.trim()} className={primary}>Send</button>
          </form>
        ) : spoken ? (
          <div className="card flex flex-col items-center gap-4 px-5 py-7 text-center">
            <Avatar p={people.get(speaker)} size="h-24 w-24 text-5xl" />
            <p className="text-xl font-bold">
              {myTurn
                ? mine.mrWhite
                  ? "Say one word out loud. Bluff!"
                  : "Say one word out loud that fits your secret word."
                : `Listen to ${name(speaker)}'s word.`}
            </p>
          </div>
        ) : null}
        <ClueBoard state={state} people={people} me={me} current={speaker} />
        {spoken && (
          <ol className="flex flex-wrap gap-2" aria-label="Order">
            {left.map((id, i) => (
              <li key={id} className={`rounded-full px-3 py-1.5 text-sm font-bold ${i === turn ? "bg-go text-ink" : i < turn ? "bg-surface-2 text-muted line-through" : "bg-surface"}`}>
                {name(id)}
              </li>
            ))}
          </ol>
        )}
        {!(myTurn && !spoken) && err}
        <div className="mt-auto flex flex-col gap-3">
          {myTurn && spoken && (
            <button type="button" disabled={busy} onClick={() => send("clue_done", { turn })} className={primary}>I have said it</button>
          )}
          {isHost && !myTurn && (
            <button type="button" disabled={busy} onClick={() => send("clue_done", { turn })} className={secondary}>
              {spoken ? `${name(speaker)} has said it` : `Skip ${name(speaker)}'s turn`}
            </button>
          )}
        </div>
      </section>
    );
  }

  // ---- 3. Another round, or vote ---------------------------------------------
  if (phase === "between") {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {outBanner || <MySecret mine={mine} />}
        <h2 className={big}>Clues done</h2>
        <p className="text-lg text-muted">{isHost ? "Does everyone have a hunch? Go round again, or vote." : "The host is deciding: another round, or the vote."}</p>
        <ClueBoard state={state} people={people} me={me} />
        {err}
        {isHost && (
          <div className="mt-auto flex flex-col gap-3">
            <button type="button" disabled={busy} onClick={() => send("start_vote")} className={primary}>{busy ? "Starting the vote" : "Vote now"}</button>
            <button type="button" disabled={busy} onClick={() => send("another_round")} className={secondary}>Another round of clues</button>
          </div>
        )}
      </section>
    );
  }

  // ---- 4. The vote ----------------------------------------------------------
  if (phase === "vote") {
    const voted = state.voted ?? [];
    const choices = (state.candidates ?? left).filter((id) => id !== me);
    // The tapped name lights up at once; the server confirms it a moment later.
    const my = pendingVote ?? mine.vote ?? null;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {outBanner || <MySecret mine={mine} />}
        <h2 className={big}>{state.runoff ? "It's a tie. Vote again" : "Who is hiding?"}</h2>
        {!amOut && (
          <>
            <p className="text-lg">Vote for who you think has a different word, or no word at all.</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold">Wolf: a different word.</span>
              {state.settings?.mrWhite && <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold">Mr White: no word.</span>}
            </div>
            <p className="text-muted">{my ? `You voted for ${name(my)}. You can change it until everyone has voted.` : "Nobody sees your vote until the count."}</p>
            <ul className="grid grid-cols-2 gap-3">
              {choices.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={my === id}
                    onClick={async () => {
                      if (my === id) return;
                      setPendingVote(id);
                      const ok = await send("vote", { memberId: id }, true);
                      if (!ok) setPendingVote(null);
                    }}
                    className={`relative flex w-full flex-col items-center gap-2 rounded-md border-4 bg-surface px-3 py-4 shadow-[4px_4px_0_#111] active:translate-x-1 active:translate-y-1 active:shadow-none ${my === id ? "border-[6px] border-pick" : "border-ink"}`}
                  >
                    {my === id && <Tick />}
                    <Avatar p={people.get(id)} />
                    <span className="text-lg font-bold">{name(id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-center text-muted">{voted.length} of {left.length} have voted</p>
        {err}
        <ClueBoard state={state} people={people} me={me} />
        {isHost && voted.length > 0 && voted.length < left.length && (
          <button type="button" disabled={busy} onClick={() => send("count_votes")} className={`${secondary} mt-auto`}>Count the votes now</button>
        )}
      </section>
    );
  }

  // ---- 5. Mr White voted out: his one guess ----------------------------------
  if (phase === "guess") {
    const caught = (state.out ?? [])[(state.out ?? []).length - 1];
    const amMrWhite = caught?.id === me;
    return (
      <section className="flex flex-1 flex-col gap-5">
        <h2 className={big}>{amMrWhite ? "You were caught!" : "Mr White is out. One guess to win it all."}</h2>
        {amMrWhite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send("guess", { word: guess });
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-lg">Guess the word most players have, to win on your own. One go.</p>
            <input
              className="card h-16 px-4 font-display text-2xl font-bold outline-none focus:border-pick"
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
          <p className="text-xl">Mr White gets one guess at the word most of you have. If it is right, Mr White wins.</p>
        )}
        <ClueBoard state={state} people={people} me={me} />
      </section>
    );
  }

  // ---- 6. Who went out ------------------------------------------------------
  if (phase === "out") {
    const v = state.lastVote;
    const gone = v?.outId ? (state.out ?? []).find((o) => o.id === v.outId) : undefined;
    return (
      <section className="flex flex-1 flex-col gap-5">
        {gone ? (
          <div className="card flex flex-col items-center gap-3 px-5 py-7 text-center">
            <Avatar p={people.get(gone.id)} size="h-20 w-20 text-4xl" />
            <h2 className={big}>{wasLine(gone.side, name(gone.id), gone.id === me)}</h2>
            {gone.guess !== undefined && <p className="text-lg">Mr White guessed &ldquo;{gone.guess}&rdquo;. Wrong!</p>}
          </div>
        ) : (
          <h2 className={big}>A tie again. Nobody is out this round.</h2>
        )}
        <p className="text-center text-lg font-bold">Still hidden: {stillHiddenLine(state)}</p>
        {v && (
          <ul className="flex flex-col gap-1 text-muted" aria-label="Votes">
            {Object.entries(v.votes).map(([from, to]) => (
              <li key={from}>{name(from)} voted for {name(to)}</li>
            ))}
          </ul>
        )}
        {err}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => send("next_round")} className={`${primary} mt-auto`}>Next round of clues</button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for the host to start the next round</p>
        )}
      </section>
    );
  }

  return null;
}

/** The end of a game: who won, both words, and everyone's side. */
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
  const mySide = r.sides[me];
  const outIds = new Set((state.out ?? []).map((o) => o.id));
  const iWon =
    r.outcome.winner === "villagers" ? mySide === "villager" : r.outcome.winner === "mr_white" ? mySide === "mr_white" : mySide === "wolf" || (mySide === "mr_white" && !outIds.has(me));
  const headline = r.outcome.winner === "villagers" ? "The Villagers win" : r.outcome.winner === "mr_white" ? "Mr White wins" : "The hidden players win";
  const why =
    r.outcome.winner === "villagers"
      ? "Every Wolf and Mr White was found."
      : r.outcome.winner === "mr_white"
        ? `Caught, but guessed the word: "${r.outcome.guess}".`
        : "Only one Villager was left.";

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  }

  const bySide = (side: Side) => (state.order ?? []).filter((id) => r.sides[id] === side);
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{iWon ? "You win!" : headline}</h2>
      <p className="text-lg">{why}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="card flex flex-col gap-1 px-4 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">VILLAGERS HAD</span>
          <span className="font-display text-2xl font-bold text-ink">{r.villagerWord}</span>
        </div>
        <div className="card flex flex-col gap-1 px-4 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">WOLVES HAD</span>
          <span className="font-display text-2xl font-bold">{r.wolfWord}</span>
        </div>
      </div>
      {(["wolf", "mr_white", "villager"] as const).map((side) =>
        bySide(side).length ? (
          <div key={side} className="flex flex-col gap-2">
            <span className="text-xs font-bold tracking-widest text-muted">{side === "wolf" ? "WOLVES" : side === "mr_white" ? "MR WHITE" : "VILLAGERS"}</span>
            <ul className="flex flex-wrap gap-3">
              {bySide(side).map((id) => (
                <li key={id} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-4">
                  <Avatar p={people.get(id)} size="h-9 w-9 text-base" faded={outIds.has(id)} />
                  <span className="font-bold">{name(id)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => go("start_game", { gameId: "mr-white", options: { mrWhite: state.settings?.mrWhiteChosen !== false, spoken: !!state.settings?.spoken } })}
            className="btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60"
          >
            Play again
          </button>
          <button type="button" disabled={busy} onClick={() => go("back_to_lobby")} className={secondary}>Back to the room</button>
        </div>
      ) : (
        <p className="mt-auto text-center text-muted">Waiting for the host</p>
      )}
    </section>
  );
}
