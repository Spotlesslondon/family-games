"use client";

// Murder at Ashworth Hall on a phone. Everyone sees the story and who is
// playing which guest (and what they wear). Each phone shows its own booklet:
// the character, a secret, and as the host moves the rounds on, where you were
// and then one clue. The murderer's phone says so, quietly. Copy is a tech
// lead draft for the CEO seat to rewrite.

import { useState } from "react";
import { message } from "@/lib/client/session";
import type { Booklet, Guest, MurderPublic } from "@/games/murder/shape";
import { ExhibitView, Person } from "./detective-exhibits";
import type { Person as PlayerPerson } from "./mr-white-play";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

const ROUND_NAMES: Record<string, string> = {
  introductions: "Round 1 of 3: who are you?",
  alibis: "Round 2 of 3: where were you?",
  evidence: "Round 3 of 3: the evidence",
  vote: "The vote",
};
const NEXT_LABEL: Record<string, string> = {
  introductions: "Everyone has introduced themselves",
  alibis: "Everyone has said where they were",
  evidence: "Time to vote",
};

export interface MurderOptions {
  length: "short" | "normal";
}

function Portrait({ g, size = 72 }: { g: Guest; size?: number }) {
  return (
    <svg viewBox="-40 -150 80 152" width={size * 0.6} height={size} aria-hidden className="shrink-0">
      <Person name={g.name} colour={g.colour} clothes={g.clothes} x={0} y={0} scale={0.95} />
    </svg>
  );
}

export function MurderPlay({
  phase,
  state: s,
  mine,
  me,
  hostId,
  people,
  act,
}: {
  phase: string;
  state: MurderPublic;
  mine: (Booklet & { vote?: string }) | null;
  me: string;
  hostId: string;
  people: Map<string, PlayerPerson>;
  act: Act;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const isHost = me === hostId;
  const pname = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const hostName = people.get(hostId)?.name ?? "the host";

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false) setError(message(out.reason ?? "server_error"));
  }
  const errorLine = error && <p role="alert" className="text-center font-bold text-alert">{error}</p>;
  const header = (
    <span className="text-sm font-bold tracking-widest text-muted">
      {s.round > 0 ? `CASE ${s.round} OF ${s.settings.cases}` : `${s.settings.cases} ${s.settings.cases === 1 ? "CASE" : "CASES"}`}
    </span>
  );

  if (phase === "briefing") {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <h2 className="font-display text-4xl font-bold leading-tight">Murder at Ashworth Hall</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-lg">
          <li>You are all guests at a dinner party. Each of you plays a character.</li>
          <li>Lord Ashworth has been found dead. One of you did it, and only they know.</li>
          <li>Three rounds: say who you are, say where you were, then share one clue each.</li>
          <li>Everyone tells the truth, except the murderer, who has a story to stick to.</li>
          <li>Then everyone votes in secret. Catch the murderer, or they get away.</li>
          <li>Never show anyone your phone.</li>
        </ul>
        {errorLine}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("next")} className={`${primary} mt-auto`}>
            Open the case
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName} to open the case.</p>
        )}
      </section>
    );
  }

  const castList = (choose: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      {s.team.map((id) => {
        const g = s.cast[id];
        if (!g) return null;
        const chosen = pick === id;
        const content = (
          <>
            <Portrait g={g} size={64} />
            <span className="flex flex-col text-left leading-tight">
              <span className="font-display text-base font-bold">{g.name}</span>
              <span className="text-xs text-muted">{pname(id)}</span>
              <span className="text-xs">
                {g.colour} {g.clothes}
              </span>
            </span>
          </>
        );
        return choose && id !== me ? (
          <button
            key={id}
            type="button"
            aria-pressed={chosen}
            onClick={() => setPick(id)}
            className={`flex items-center gap-2 rounded-2xl border-[3px] border-ink px-2 py-2 ${chosen ? "bg-go shadow-[4px_4px_0_#111]" : "bg-surface"}`}
          >
            {content}
          </button>
        ) : (
          <div key={id} className={`flex items-center gap-2 rounded-2xl border-2 border-ink/30 px-2 py-2 ${choose ? "opacity-50" : "bg-surface"}`}>
            {content}
          </div>
        );
      })}
    </div>
  );

  if (phase === "reveal" && s.last) {
    const L = s.last;
    const last = s.round >= s.settings.cases;
    const iWasIt = L.murdererId === me;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <div className="flex justify-center py-2">
          <span className={`rounded-3xl border-[5px] px-5 py-3 font-display text-5xl font-bold leading-none text-white shadow-[6px_6px_0_#111] ${L.caught ? "border-[#1f6b3a] bg-[#3da35d]" : "border-ink bg-alert"}`} style={{ transform: "rotate(-4deg)" }}>
            {L.caught ? "Caught!" : "Got away!"}
          </span>
        </div>
        <p className="text-lg">
          It was <strong>{L.murderer}</strong>, played by <strong>{pname(L.murdererId)}</strong>.{iWasIt ? (L.caught ? " They got you." : " You fooled them all.") : ""}
        </p>
        <div className="card flex flex-col gap-1 px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">THE VOTES</span>
          {s.team
            .filter((id) => L.tally[id])
            .sort((a, b) => (L.tally[b] ?? 0) - (L.tally[a] ?? 0))
            .map((id) => (
              <p key={id}>
                {s.cast[id]?.name} ({pname(id)}): {L.tally[id]} {L.tally[id] === 1 ? "vote" : "votes"}
              </p>
            ))}
          {L.accusedId === null && <p className="text-muted">No one had the most votes on their own.</p>}
        </div>
        <div className="card flex flex-col gap-2 px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">HOW IT HAPPENED</span>
          {L.why.map((w, i) => (
            <p key={i} className={i === 0 ? "font-bold" : ""}>
              {w}
            </p>
          ))}
        </div>
        <div className="card flex flex-col gap-1 px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">SCORES</span>
          {s.team.map((id) => (
            <p key={id} className="flex justify-between">
              <span>{pname(id)}</span>
              <span className="font-bold">{s.scores[id] ?? 0}</span>
            </p>
          ))}
        </div>
        {errorLine}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("next", { round: s.round })} className={`${primary} mt-auto`}>
            {last ? "See the final scores" : "Open the next case"}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName}</p>
        )}
      </section>
    );
  }

  const b = mine && mine.round === s.round ? mine : null;
  const voted = s.voted.includes(me);

  return (
    <section className="flex flex-1 flex-col gap-4">
      {header}
      <h2 className="font-display text-3xl font-bold leading-tight">{ROUND_NAMES[phase] ?? ""}</h2>
      {s.story && (
        <div className="card flex flex-col gap-2 px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">THE CASE</span>
          <p className="text-lg">{s.story}</p>
        </div>
      )}

      {b && (
        <div className="flex flex-col gap-3 rounded-3xl border-[4px] border-ink bg-[#f6efe0] px-5 py-4 shadow-[6px_6px_0_#111]">
          <span className="text-xs font-bold tracking-widest text-[#6b4a2f]">YOUR BOOKLET · ONLY YOU CAN SEE THIS</span>
          {b.murderer && (
            <p className="rounded-2xl bg-[#7a1010] px-4 py-3 font-display text-xl font-bold text-white">
              You did it. Nobody else knows. Keep it that way.
            </p>
          )}
          <div className="flex items-center gap-3">
            <Portrait g={b.guest} size={96} />
            <div className="flex flex-col">
              <span className="font-display text-2xl font-bold">{b.guest.name}</span>
              <span className="text-sm">
                Wearing {/^[aeiou]/.test(b.guest.colour) ? "an" : "a"} {b.guest.colour} {b.guest.clothes}
              </span>
            </div>
          </div>
          <p className="text-lg">{b.guest.intro}</p>
          {phase === "introductions" && <p className="font-bold">Read this out loud to introduce yourself.</p>}
          <p className="rounded-2xl border-2 border-dashed border-ink bg-white/60 px-3 py-2">
            <strong>Your secret:</strong> {b.secret}
          </p>
          {b.story && (
            <div className="flex flex-col gap-1 rounded-2xl bg-white px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-muted">{b.murderer ? "YOUR STORY. STICK TO IT." : "WHERE YOU WERE"}</span>
              <p className="text-lg">{b.story}</p>
              {phase === "alibis" && <p className="text-sm font-bold">Say this out loud.</p>}
            </div>
          )}
          {b.clue && (
            <div className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3">
              <span className="text-xs font-bold tracking-widest text-muted">YOUR CLUE</span>
              {b.clue.exhibit && <ExhibitView x={b.clue.exhibit} />}
              <p className={`text-lg ${b.clue.exhibit?.kind === "photo" ? "mt-3" : ""}`}>{b.clue.line}</p>
              {phase === "evidence" && <p className="text-sm font-bold">Share it with the table. You can say it in your own words.</p>}
            </div>
          )}
        </div>
      )}

      {phase === "vote" ? (
        <div className="card flex flex-col gap-3 px-4 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">WHO DID IT? VOTE IN SECRET</span>
          {voted ? (
            <p className="text-lg font-bold">Your vote is in. Waiting for: {s.team.filter((id) => !s.voted.includes(id)).map(pname).join(", ") || "nobody"}.</p>
          ) : (
            <>
              {castList(true)}
              <button type="button" disabled={busy || !pick} onClick={() => go("vote", { round: s.round, player: pick })} className={secondary}>
                {pick ? `Vote for ${s.cast[pick]?.name}` : "Tap a guest to vote"}
              </button>
            </>
          )}
          {isHost && s.voted.length > 0 && s.voted.length < s.team.length && (
            <button type="button" disabled={busy} onClick={() => go("count_votes", { round: s.round })} className="h-11 rounded-2xl border-2 border-ink bg-surface font-bold">
              Count the votes now
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-widest text-muted">THE GUESTS</span>
          {castList(false)}
        </div>
      )}

      {errorLine}
      {phase !== "vote" &&
        (isHost ? (
          <button type="button" disabled={busy} onClick={() => go("next", { round: s.round })} className={primary}>
            {NEXT_LABEL[phase] ?? "Next"}
          </button>
        ) : (
          <p className="text-center text-muted">{hostName} moves the game on.</p>
        ))}
    </section>
  );
}

export function MurderResults({ state: s, me, hostId, people, act }: { state: MurderPublic; me: string; hostId: string; people: Map<string, PlayerPerson>; act: Act }) {
  const [busy, setBusy] = useState(false);
  const go = async (type: string, payload?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  };
  const ranked = [...s.team].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">Final scores</h2>
      <div className="card flex flex-col gap-2 px-5 py-4">
        {ranked.map((id, i) => (
          <p key={id} className={`flex justify-between text-lg ${i === 0 ? "font-bold" : ""}`}>
            <span>{id === me ? "You" : people.get(id)?.name ?? "Someone"}</span>
            <span>{s.scores[id] ?? 0}</span>
          </p>
        ))}
      </div>
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "murder", options: { length: s.settings.length } })} className={primary}>
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
