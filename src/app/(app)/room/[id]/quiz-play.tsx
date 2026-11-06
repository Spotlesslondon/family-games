"use client";

// The quiz on a player's phone. One question at a time at the player's own
// level, four big answers, one tap to answer. Nobody is rushed: the answers
// show when everyone has answered, or when the host chooses.
// This file must never import the question bank: the phone never holds the
// right answer before the round is shown.

import { useEffect, useState } from "react";
import { useServerOffset } from "@/lib/client/clock";
import { message } from "@/lib/client/session";
import type { QuizMine, QuizPublic } from "@/games/quiz/shape";
import { Avatar, Tick, type Person } from "./mr-white-play";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

/** Everyone in the top three places, ties sharing a place. Never a last place. */
export function topPlaces(scores: Record<string, number>): { place: number; id: string; points: number }[] {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const out: { place: number; id: string; points: number }[] = [];
  sorted.forEach(([id, points], i) => {
    const place = i > 0 && sorted[i - 1][1] === points ? out[i - 1].place : i + 1;
    out.push({ place, id, points });
  });
  return out.filter((r) => r.place <= 3 && r.points > 0);
}

const PLACE = ["", "1st", "2nd", "3rd"];

export function QuizPlay({
  phase,
  phaseEndsAt,
  state,
  mine,
  me,
  hostId,
  people,
  act,
}: {
  phase: string;
  /** When the answers give way to the next question; the same on every phone. */
  phaseEndsAt: string | null;
  state: QuizPublic;
  mine: QuizMine;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer tapped on this phone, for this round only, shown at once.
  const [tapped, setTapped] = useState<{ round: number; choice: number } | null>(null);
  const isHost = me === hostId;
  const playing = !!state.bandOf && me in state.bandOf;
  const total = state.settings?.rounds ?? 0;
  const players = Object.keys(state.bandOf ?? {});
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");

  async function send(type: string, payload?: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    // Offline or timed out: not sent, so the answer must stay tappable (2 Nov review).
    if (!out) return false;
    if (out.ok === false) {
      setError(message(out.reason));
      return false;
    }
    return true;
  }

  const counter = (
    <p className="text-sm font-bold tracking-widest text-muted">
      QUESTION {state.round} OF {total}
    </p>
  );

  if (phase === "question") {
    const myRound = mine?.round === state.round;
    const chosen = myRound && mine.choice != null ? mine.choice : tapped && tapped.round === state.round ? tapped.choice : null;
    const waiting = players.filter((id) => !(state.answered ?? []).includes(id));

    if (!playing || !myRound) {
      return (
        <section className="flex flex-1 flex-col gap-4">
          {counter}
          <h2 className="font-display text-3xl font-semibold leading-tight">You are watching this quiz</h2>
          <p className="text-lg text-muted">You joined after it started. You can play the next one.</p>
          <WhoIsAnswering ids={waiting} people={people} name={name} />
        </section>
      );
    }

    return (
      <section className="flex flex-1 flex-col gap-4">
        {counter}
        <h2 className="font-display text-3xl font-semibold leading-tight text-ink">{mine.text}</h2>
        <div className="flex flex-col gap-3" role="group" aria-label="Answers">
          {mine.options.map((option, i) => {
            const isMine = chosen === i;
            return (
              <button
                key={`${state.round}-${i}`}
                type="button"
                disabled={chosen != null}
                aria-pressed={isMine}
                onClick={async () => {
                  setTapped({ round: state.round, choice: i });
                  const ok = await send("answer", { round: state.round, choice: i });
                  if (!ok) setTapped(null);
                }}
                className={`card relative min-h-16 px-5 py-3 text-left font-display text-2xl font-semibold ${
                  isMine ? "border-pick bg-surface ring-4 ring-pick" : chosen != null ? "opacity-50" : ""
                }`}
              >
                {option}
                {isMine && <Tick />}
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
        {chosen != null && (
          <p className="text-center text-lg font-bold">
            {waiting.length === 0 ? "Locked in." : `Locked in. Waiting for ${waiting.length === 1 ? "1 more" : `${waiting.length} more`}.`}
          </p>
        )}
        {chosen != null && <WhoIsAnswering ids={waiting} people={people} name={name} />}
        {isHost && waiting.length > 0 && (
          <button type="button" disabled={busy} onClick={() => send("show_answers")} className={`${secondary} mt-auto`}>
            Show the answers now
          </button>
        )}
      </section>
    );
  }

  // phase === "reveal"
  const last = state.last;
  const myBand = state.bandOf?.[me];
  const myQ = myBand ? last?.questions?.[myBand] : undefined;
  const right = !!last?.right?.includes(me);
  const myPick = mine?.round === state.round && mine.choice != null ? mine.options[mine.choice] : null;
  const lastRound = state.round >= total;
  const otherBands = Object.entries(last?.questions ?? {}).filter(([band]) => band !== myBand);

  return (
    <section className="flex flex-1 flex-col gap-4">
      {counter}
      {playing && myQ ? (
        <>
          <h2 className="font-display text-4xl font-bold leading-tight text-ink">{right ? "Right!" : myPick ? "Not this time" : "No answer this time"}</h2>
          <div className="card flex flex-col gap-2 px-5 py-4">
            <span className="text-lg">{myQ.text}</span>
            <span className="text-xs font-bold tracking-widest text-muted">THE ANSWER</span>
            <span className="font-display text-3xl font-bold text-ink">{myQ.correct}</span>
            {!right && myPick && <span className="text-muted">You chose {myPick}</span>}
          </div>
        </>
      ) : (
        <h2 className="font-display text-3xl font-semibold leading-tight">Here are the answers</h2>
      )}

      <Standings scores={state.scores ?? {}} me={me} people={people} name={name} />

      {otherBands.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-widest text-muted">THE OTHER QUESTIONS</span>
          {otherBands.map(([band, q]) => (
            <div key={band} className="card px-4 py-3">
              <p>{q!.text}</p>
              <p className="font-bold">{q!.correct}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-center font-bold text-alert">{error}</p>}
      <Countdown endsAt={phaseEndsAt} label={lastRound ? "Final scores in" : "Next question in"} fire={() => act("advance_if_expired")} />
    </section>
  );
}

/**
 * The shared countdown between questions. Every phone counts from the same
 * server time, and when it reaches zero each phone asks the server to move
 * on; the server moves the table once, whichever phone asks first. There is
 * no button: the host cannot bring the next question forward.
 */
function Countdown({ endsAt, label, fire }: { endsAt: string | null; label: string; fire: () => unknown }) {
  const offset = useServerOffset();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = endsAt ? Math.max(0, Math.ceil((Date.parse(endsAt) - (now + offset)) / 1000)) : null;
  const due = left === 0;
  useEffect(() => {
    if (!due) return;
    fire();
    const id = setInterval(fire, 1000); // again each second until the server has moved on
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, endsAt]);
  if (left === null) return null;
  return (
    <div className="mt-auto flex items-center justify-center gap-3 rounded-2xl bg-surface-2 px-4 py-3" role="timer" aria-live="off">
      <span className="font-bold">{label}</span>
      <span className="font-display text-3xl font-bold tabular-nums">{left}</span>
    </div>
  );
}

function WhoIsAnswering({ ids, people, name }: { ids: string[]; people: Map<string, Person>; name: (id: string) => string }) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-widest text-muted">STILL ANSWERING</span>
      <ul className="flex flex-wrap gap-3">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-4">
            <Avatar p={people.get(id)} size="h-9 w-9 text-base" />
            <span className="font-bold">{name(id)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Standings({ scores, me, people, name }: { scores: Record<string, number>; me: string; people: Map<string, Person>; name: (id: string) => string }) {
  const top = topPlaces(scores);
  const mineShown = top.some((r) => r.id === me);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold tracking-widest text-muted">TOP SCORES</span>
      {top.length === 0 ? (
        <p className="text-muted">Nobody has scored yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {top.map((r) => (
            <li key={r.id} className="card flex items-center gap-3 px-3 py-2">
              <span className="w-10 font-display text-xl font-bold">{PLACE[r.place]}</span>
              <Avatar p={people.get(r.id)} size="h-10 w-10 text-base" />
              <span className="flex-1 font-bold">{name(r.id)}</span>
              <span className="font-display text-2xl font-bold">{r.points}</span>
            </li>
          ))}
        </ul>
      )}
      {!mineShown && me in scores && (
        <p className="text-lg">
          You have <span className="font-bold">{scores[me]}</span> {scores[me] === 1 ? "point" : "points"}.
        </p>
      )}
    </div>
  );
}

export function QuizResults({ state, me, hostId, people, act }: { state: QuizPublic; me: string; hostId: string; people: Map<string, Person>; act: Act }) {
  const [busy, setBusy] = useState(false);
  const scores = state.scores ?? {};
  const top = topPlaces(scores);
  const best = top.length ? top[0].points : 0;
  const winners = top.filter((r) => r.points === best);
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const total = state.settings?.rounds ?? 0;

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  }

  const headline =
    winners.length === 0
      ? "That was tough"
      : winners.some((w) => w.id === me)
        ? winners.length > 1
          ? "You share the win!"
          : "You win!"
        : winners.length > 1
          ? `${winners.map((w) => name(w.id)).join(" and ")} share the win`
          : `${name(winners[0].id)} wins`;

  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{headline}</h2>
      {me in scores && (
        <p className="text-lg">
          You got <span className="font-bold">{scores[me]}</span> out of {total} right.
        </p>
      )}
      <Standings scores={scores} me={me} people={people} name={name} />
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => go("start_game", { gameId: "quiz", options: { length: state.settings?.length ?? "normal", topic: state.settings?.topic ?? "mixed", avoid: state.asked ?? [] } })}
            className={primary}
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
