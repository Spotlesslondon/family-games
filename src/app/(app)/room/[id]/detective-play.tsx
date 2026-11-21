"use client";

// The Detective game on a phone. Everyone sees the story and the suspects;
// each player sees only their own evidence, styled like the thing it is (a
// camera feed, a notebook, photo prints, an evidence bag). The talking happens
// at the table. Copy is a tech lead draft for the CEO seat to rewrite.

import { useState } from "react";
import { message } from "@/lib/client/session";
import { HINTS, LEVEL_NAMES, ROLE_LINES, ROLE_NAMES, type DetectiveLength, type DetectiveLevel, type DetectiveMine, type DetectivePublic, type Evidence, type RoleKey } from "@/games/detective/shape";
import type { Person } from "./mr-white-play";
import { ExhibitView } from "./detective-exhibits";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl";

export interface DetectiveOptions {
  level: DetectiveLevel;
  length: DetectiveLength;
}

export function DetectivePlay({
  phase,
  state: s,
  mine,
  me,
  hostId,
  people,
  act,
}: {
  phase: string;
  state: DetectivePublic;
  mine: DetectiveMine | null;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isHost = me === hostId;
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name || "Someone");
  const hostName = people.get(hostId)?.name ?? "the host";

  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false) setError(message(out.reason ?? "server_error"));
  }

  const header = (
    <span className="text-sm font-bold tracking-widest text-muted">
      {s.round > 0 ? `CASE ${s.round} OF ${s.settings.cases}` : `${s.settings.cases} ${s.settings.cases === 1 ? "CASE" : "CASES"}`} · LEVEL {s.settings.level}
    </span>
  );
  const errorLine = error && <p role="alert" className="text-center font-bold text-alert">{error}</p>;

  if (phase === "briefing") {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <h2 className="font-display text-4xl font-bold leading-tight">How to solve it</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-lg">
          <li>Something has gone missing. One of the suspects took it.</li>
          <li>Each of you is a different investigator: CCTV, Witnesses, Records or Forensics.</li>
          <li>Your phone shows only your evidence. Read it out loud. Never show your phone.</li>
          <li>Nobody can solve it alone. Put your clues together.</li>
          <li>When you think you know, name a suspect. Everyone has to agree.</li>
        </ul>
        <p className="text-muted">{LEVEL_NAMES[s.settings.level]}</p>
        {errorLine}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("open")} className={`${primary} mt-auto`}>
            Open the case
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName} to open the case.</p>
        )}
      </section>
    );
  }

  if (phase === "solved" && s.last) {
    const L = s.last;
    const last = s.round >= s.settings.cases;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <span className={`rounded-3xl border-[5px] px-5 py-3 font-display text-5xl font-bold leading-none shadow-[6px_6px_0_#111] ${L.right ? "border-[#1f6b3a] bg-[#3da35d] text-white" : "border-ink bg-alert text-white"}`} style={{ transform: "rotate(-4deg)" }}>
            {L.right ? "Case closed!" : "They got away!"}
          </span>
        </div>
        <p className="text-lg">
          You named <strong>{L.accused}</strong>. {L.right ? "Right!" : `It was ${L.culprit}.`}
        </p>
        <div className="card flex flex-col gap-2 px-5 py-4">
          <span className="text-xs font-bold tracking-widest text-muted">HOW IT HAPPENED</span>
          {L.why.map((w, i) => (
            <p key={i} className={i === 0 ? "font-bold" : ""}>
              {w}
            </p>
          ))}
        </div>
        <p className="text-lg font-bold">
          {L.points} {L.points === 1 ? "point" : "points"} for the team.{L.right && L.points === 3 ? " (A hint was used.)" : ""}
        </p>
        <div className="card flex items-center justify-between px-5 py-4">
          <span className="font-bold">Team score</span>
          <span className="font-display text-3xl font-bold">{s.score}</span>
        </div>
        {errorLine}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("open", { round: s.round })} className={`${primary} mt-auto`}>
            {last ? "See the final score" : "Open the next case"}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName}</p>
        )}
      </section>
    );
  }

  const c = s.case;
  if (!c) return null;
  const roles = s.roles[me] ?? [];
  const p = s.proposal;
  const iAgreed = !!p && p.agreed.includes(me);
  const waitingOn = p ? s.team.filter((id) => !p.agreed.includes(id)) : [];
  const hints = HINTS(c.item);

  return (
    <section className="flex flex-1 flex-col gap-4">
      {header}
      <div className="card flex flex-col gap-2 px-5 py-4">
        <span className="text-xs font-bold tracking-widest text-muted">THE CASE</span>
        <p className="text-lg">{c.story}</p>
      </div>

      {mine && mine.round === s.round ? (
        <div className="flex flex-col gap-3">
          <p className="font-bold">
            You are {roles.map((r) => ROLE_NAMES[r]).join(" and ")}. Only you can see this. Read it out loud.
          </p>
          {mine.evidence.map((e) => (
            <EvidenceCard key={e.role} e={e} />
          ))}
        </div>
      ) : (
        <p className="text-muted">You are watching this case.</p>
      )}

      <div className="card flex flex-col gap-3 px-4 py-4">
        <span className="text-xs font-bold tracking-widest text-muted">WHO DID IT?</span>
        <div className="grid grid-cols-2 gap-2">
          {c.suspects.map((sus) => {
            const named = p?.suspect === sus;
            return (
              <button
                key={sus}
                type="button"
                disabled={busy}
                onClick={() => go("propose", { round: s.round, suspect: sus })}
                aria-pressed={named}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border-[3px] border-ink px-2 py-2 font-display text-lg font-bold ${named ? "bg-go shadow-[4px_4px_0_#111]" : "bg-surface"}`}
              >
                <SuspectFace name={sus} />
                {sus}
              </button>
            );
          })}
        </div>
        {p ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 px-4 py-3">
            <p className="text-lg">
              <strong>{name(p.by)}</strong> {p.by === me ? "say" : "says"} it was <strong>{p.suspect}</strong>.
            </p>
            <p className="text-sm text-muted">
              {waitingOn.length === 0 ? "Everyone agrees." : `Waiting for: ${waitingOn.map(name).join(", ")}.`}
            </p>
            {!iAgreed ? (
              <button type="button" disabled={busy} onClick={() => go("agree", { round: s.round, suspect: p.suspect })} className={`${secondary} h-12 text-lg`}>
                I agree: {p.suspect}
              </button>
            ) : (
              <p className="font-bold">You agree.</p>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => go("withdraw", { round: s.round })} className="h-11 flex-1 rounded-2xl border-2 border-ink bg-surface font-bold">
                Not yet
              </button>
              {isHost && waitingOn.length > 0 && (
                <button type="button" disabled={busy} onClick={() => go("lock_in", { round: s.round })} className="h-11 flex-1 rounded-2xl border-2 border-ink bg-surface font-bold">
                  Lock it in
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Tap a suspect to name them. Everyone has to agree.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hints.slice(0, s.hintsUsed).map((h, i) => (
          <p key={i} className="rounded-2xl border-2 border-ink bg-[#fff3c4] px-4 py-2">
            <strong>Hint {i + 1}:</strong> {h}
          </p>
        ))}
        {s.hintsUsed === 0 && <p className="text-center text-sm text-muted">Solve it with no hint for a bonus point.</p>}
        {s.hintsUsed < hints.length && (
          <button type="button" disabled={busy} onClick={() => go("hint", { round: s.round })} className="h-11 rounded-2xl border-2 border-ink bg-surface font-bold">
            {s.hintsUsed === 0 ? "Stuck? Get a hint" : "Another hint"}
          </button>
        )}
      </div>
      {errorLine}
    </section>
  );
}

/** A suspect's face: a plain shape with their initials. No colours, which would give the thread away. */
function SuspectFace({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ink bg-[#f7f3e8] font-display text-base font-bold" aria-hidden>
      {initials}
    </span>
  );
}

// Each role looks like the thing it is: a camera feed, a notebook, photo
// prints with times, an evidence bag (Joshua, 6 Nov: parts look, feel and move
// like the part they are; applied to evidence as a draft for the CEO seat).
const STYLE: Record<RoleKey, { box: string; head: string; line: string }> = {
  cctv: { box: "bg-[#1d2127] text-[#d7f5d0] border-ink", head: "text-[#8fe388]", line: "font-mono text-[15px]" },
  witness: { box: "bg-[#fffdf3] text-ink border-ink bg-[repeating-linear-gradient(#fffdf3_0_31px,#c9d7ef_31px_32px)]", head: "text-[#8a3b2b]", line: "text-lg" },
  records: { box: "bg-[#eef2f6] text-ink border-ink", head: "text-[#2e4f7a]", line: "text-lg" },
  forensics: { box: "bg-[#f4ecd8] text-ink border-ink border-dashed", head: "text-[#8a5a00]", line: "text-lg" },
};

function EvidenceCard({ e }: { e: Evidence }) {
  const st = STYLE[e.role];
  return (
    <div className={`flex flex-col gap-2 rounded-3xl border-[4px] px-5 py-4 shadow-[6px_6px_0_#111] ${st.box}`}>
      <div className="flex items-center gap-2">
        <RoleIcon role={e.role} />
        <span className={`font-display text-xl font-bold ${st.head}`}>{e.title}</span>
        {e.role === "cctv" && <span className="ml-auto flex items-center gap-1 text-xs font-bold text-[#ff6b6b]"><span className="h-2.5 w-2.5 rounded-full bg-[#ff4d4d]" />REC</span>}
      </div>
      <p className={`text-sm ${e.role === "cctv" ? "text-[#a7c7a2]" : "text-muted"}`}>{ROLE_LINES[e.role]}</p>
      {(e.exhibits ?? []).length > 0
        ? e.exhibits.map(({ exhibit, caption }, i) => (
            <div key={i} className="flex flex-col gap-2 pt-2">
              <ExhibitView x={exhibit} />
              {/* The phone, the lock app and the evidence bag already show their words; camera stills and photos get theirs underneath. */}
              {(exhibit.kind === "cctv" || exhibit.kind === "photo") && <p className={`${st.line} ${exhibit.kind === "photo" ? "mt-3" : ""}`}>{caption}</p>}
            </div>
          ))
        : e.lines.map((l, i) => (
            <p key={i} className={st.line}>
              {e.role === "records" && l.startsWith("Photo") ? <PhotoLine line={l} /> : l}
            </p>
          ))}
    </div>
  );
}

/** A photo record drawn as a small print with its time stamped on it. */
function PhotoLine({ line }: { line: string }) {
  const m = line.match(/^Photo, (\d+:\d\d): (.+)$/);
  if (!m) return <>{line}</>;
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-end rounded-md border-2 border-ink bg-white p-1 shadow-[2px_2px_0_#111]">
        <span className="font-mono text-[11px] font-bold text-[#b3261e]">{m[1]}</span>
      </span>
      <span>
        <strong>Photo, {m[1]}:</strong> {m[2]}
      </span>
    </span>
  );
}

function RoleIcon({ role }: { role: RoleKey }) {
  const c = role === "cctv" ? "#8fe388" : "#1d1a14";
  switch (role) {
    case "cctv":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <rect x="3" y="7" width="13" height="8" rx="2" fill="none" stroke={c} strokeWidth="2" />
          <path d="M16 10l5-3v8l-5-3" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "witness":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke={c} strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill={c} />
        </svg>
      );
    case "records":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke={c} strokeWidth="2" />
          <path d="M8 8h8M8 12h8M8 16h5" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "forensics":
      return (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <circle cx="10" cy="10" r="6" fill="none" stroke={c} strokeWidth="2.2" />
          <path d="M14.5 14.5L21 21" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
  }
}

export function DetectiveResults({ state: s, me, hostId, act }: { state: DetectivePublic; me: string; hostId: string; people: Map<string, Person>; act: Act }) {
  const [busy, setBusy] = useState(false);
  const go = async (type: string, payload?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    await act(type, payload);
    setBusy(false);
  };
  const allSolved = s.tally.solved === s.settings.cases && s.settings.cases > 0;
  return (
    <section className="flex flex-1 flex-col gap-4">
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{allSolved ? "Top detectives!" : "Team score"}</h2>
      <div className="card flex items-center justify-between px-5 py-4">
        <span className="font-bold">Team score</span>
        <span className="font-display text-4xl font-bold">{s.score}</span>
      </div>
      <p className="text-muted">
        {s.tally.solved} solved, {s.tally.escaped} got away. Everyone on the team gets {s.score} {s.score === 1 ? "point" : "points"}.
      </p>
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "detective", options: { level: s.settings.level, length: s.settings.length } })} className={primary}>
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
