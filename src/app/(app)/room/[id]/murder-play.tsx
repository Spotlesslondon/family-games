"use client";

// Murder at Ashworth Hall on a phone, rebuilt 22 Nov 2026. Every phone looks
// busy at night so nobody stands out. Each phone shows its own secret (role,
// partners, targets, blackmail) behind a tap so it cannot be read over a
// shoulder. Votes are shown name by name only after everyone has voted.
// Copy is a tech lead draft for the CEO seat to rewrite.

import { useEffect, useState } from "react";
import { message } from "@/lib/client/session";
import { GUARDS_TO_SAVE, MAX_MESSAGES_PER_NIGHT, QUICK_LINES, type Whisper, type MurderMine, type MurderPublic, type MurderSettings, type NightPick, type VoteDay } from "@/games/murder/shape";
import { THEMES, art, cap, themeOf, type ThemeKey, type ThemeWords } from "@/games/murder/themes";
import { Avatar, type Person } from "./mr-white-play";
import { Emblem, useThemeBackdrop } from "./frame-art";

type Act = (type: string, payload?: Record<string, unknown>) => Promise<{ ok?: boolean; reason?: string } | null>;

const primary = "btn btn-primary h-16 w-full font-display text-2xl font-bold text-ink disabled:opacity-60";
const secondary = "btn btn-secondary h-14 w-full font-display text-xl disabled:opacity-60";
const smallBase = "h-11 rounded-2xl border-2 border-ink px-4 font-bold disabled:opacity-60";
const small = `${smallBase} bg-surface`;

export type MurderOptions = MurderSettings;

const actionName = (w: ThemeWords, a: string) => (a === "kill" ? w.kill : a === "silence" ? w.silence : a === "blackmail" ? w.blackmail : "Do nothing");

function useAct(act: Act) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(type: string, payload?: Record<string, unknown>) {
    if (busy) return null;
    setBusy(true);
    setError(null);
    const out = await act(type, payload);
    setBusy(false);
    if (out && out.ok === false) setError(message(out.reason ?? "server_error"));
    return out;
  }
  const errorLine = error && (
    <p role="alert" className="text-center font-bold text-alert">
      {error}
    </p>
  );
  return { go, busy, errorLine };
}

function Grid({
  ids,
  people,
  me,
  pick,
  onPick,
  disabled,
}: {
  ids: string[];
  people: Map<string, Person>;
  me: string;
  pick: string | null;
  onPick: (id: string) => void;
  disabled?: (id: string) => boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ids.map((id) => {
        const p = people.get(id);
        const off = disabled?.(id) ?? false;
        const chosen = pick === id;
        return (
          <button
            key={id}
            type="button"
            disabled={off}
            aria-pressed={chosen}
            onClick={() => onPick(id)}
            className={`flex min-h-16 items-center gap-2 rounded-2xl border-[3px] border-ink px-2 py-2 text-left disabled:opacity-35 ${chosen ? "bg-go shadow-[4px_4px_0_#111]" : "bg-surface"}`}
          >
            <Avatar p={p} size="h-11 w-11 text-xl" />
            <span className="font-display text-lg font-bold leading-tight">{id === me ? "You" : p?.name ?? "Someone"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "Ready for morning" / "Ready to vote". Everyone has it, murderers included, so pressing it
 * gives nothing away. The game moves on when more than half the players still in are ready. */
function ReadyBar({ s, me, label, go, busy, waitingNote }: { s: MurderPublic; me: string; label: string; go: (type: string, payload?: Record<string, unknown>) => Promise<unknown>; busy: boolean; waitingNote?: string }) {
  const ready = (s.ready ?? []).filter((id) => s.alive.includes(id));
  const mine = ready.includes(me);
  const need = Math.floor(s.alive.length / 2) + 1;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={mine}
        disabled={busy}
        onClick={() => go("ready", { day: s.day, ready: !mine })}
        className={`btn h-16 w-full font-display text-2xl font-bold disabled:opacity-60 ${mine ? "btn-secondary" : "btn-primary text-ink"}`}
      >
        {mine ? "Not ready yet" : label}
      </button>
      <p className="text-center text-muted">
        {ready.length} of {s.alive.length} ready. Moves on at {need}.{ready.length >= need && waitingNote ? ` ${waitingNote}` : ""}
      </p>
    </div>
  );
}

const lineText = (w: Whisper, name: (id: string) => string) => QUICK_LINES[w.line]?.text.replace("{about}", w.about ? name(w.about) : "someone") ?? "";

/** Night messages: pick a player, pick a ready-made line, send. Everyone can, all night, so every phone stays busy. */
function Messages({ s, mine, me, people, name, go, busy }: { s: MurderPublic; mine: MurderMine | null; me: string; people: Map<string, Person>; name: (id: string) => string; go: (type: string, payload?: Record<string, unknown>) => Promise<unknown>; busy: boolean }) {
  const [to, setTo] = useState<string | null>(null);
  const [line, setLine] = useState<number | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const sentTonight = (mine?.sent ?? []).filter((w) => w.day === s.day).length;
  const inbox = [...(mine?.inbox ?? [])].reverse();
  const needsAbout = line !== null && QUICK_LINES[line].about;
  const ready = to && line !== null && (!needsAbout || about);
  const others = s.alive.filter((x) => x !== me);
  async function send() {
    if (!ready) return;
    await go("whisper", { day: s.day, to, line, about: needsAbout ? about : null });
    setLine(null);
    setAbout(null);
  }
  return (
    <div className="card flex flex-col gap-3 px-4 py-4">
      <span className="text-xs font-bold tracking-widest text-muted">SEND A MESSAGE · {sentTonight} OF {MAX_MESSAGES_PER_NIGHT} TONIGHT</span>
      <span className="font-bold">To</span>
      <Grid ids={others} people={people} me={me} pick={to} onPick={setTo} />
      {to && (
        <div className="flex flex-wrap gap-2">
          {QUICK_LINES.map((l, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={line === i}
              onClick={() => {
                setLine(i);
                setAbout(null);
              }}
              className={`min-h-11 rounded-2xl border-2 border-ink px-3 text-left text-sm font-bold ${line === i ? "bg-go shadow-[3px_3px_0_#111]" : "bg-surface"}`}
            >
              {l.text.replace("{about}", "...")}
            </button>
          ))}
        </div>
      )}
      {needsAbout && (
        <>
          <span className="font-bold">Who is it about?</span>
          <Grid ids={s.alive} people={people} me={me} pick={about} onPick={setAbout} />
        </>
      )}
      {to && line !== null && (
        <button type="button" disabled={busy || !ready} onClick={send} className={secondary}>
          {ready ? `Send to ${name(to)}: "${lineText({ day: s.day, from: me, to, line, about: needsAbout ? about : null }, name)}"` : "Choose who it is about"}
        </button>
      )}
      {inbox.length > 0 && (
        <div className="flex flex-col gap-1 border-t-2 border-ink/10 pt-2">
          <span className="text-xs font-bold tracking-widest text-muted">MESSAGES TO YOU</span>
          {inbox.map((w, i) => (
            <p key={i}>
              <strong>{name(w.from)}</strong>
              {w.day !== s.day ? ` (night ${w.day})` : ""}: {lineText(w, name)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Last night's messages, readable by day. */
function MessageLog({ mine, name }: { mine: MurderMine | null; name: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const inbox = [...(mine?.inbox ?? [])].reverse();
  const sent = [...(mine?.sent ?? [])].reverse();
  if (inbox.length === 0 && sent.length === 0) return null;
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center justify-between font-bold">
        <span>Your messages ({inbox.length} in, {sent.length} out)</span>
        <span className="text-sm text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <>
          {inbox.map((w, i) => (
            <p key={`i${i}`}>
              Night {w.day}, <strong>{name(w.from)}</strong> to you: {lineText(w, name)}
            </p>
          ))}
          {sent.map((w, i) => (
            <p key={`s${i}`} className="text-muted">
              Night {w.day}, you to <strong>{name(w.to)}</strong>: {lineText(w, name)}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

/** The phone's secret, hidden until tapped so it cannot be read over a shoulder. */
function Secret({ mine, s, name }: { mine: MurderMine | null; s: MurderPublic; name: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  if (!mine) return null;
  const murderer = mine.role === "murderer";
  const w = themeOf(s.settings.theme);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      style={{ background: open && murderer ? w.badColour : w.accent }}
      className={`flex w-full flex-col gap-1 rounded-3xl border-[4px] border-ink px-5 py-3 text-left shadow-[5px_5px_0_#111] ${open && murderer ? "text-white" : ""}`}
    >
      <span className={`text-xs font-bold tracking-widest ${open && murderer ? "text-white/80" : "text-[#6b4a2f]"}`}>YOUR SECRET · TAP TO {open ? "HIDE" : "SHOW"}</span>
      {open &&
        (murderer ? (
          <>
            <span className="font-display text-2xl font-bold">You are {art(w.bad)}.</span>
            {(mine.partners ?? []).length > 0 && <span>Your partner: {(mine.partners ?? []).map(name).join(", ")}</span>}
            <span>
              Frame {(mine.targets ?? []).length === 1 ? `this ${w.good}` : `these ${w.goods}`}: <strong>{(mine.targets ?? []).map(name).join(", ")}</strong>
            </span>
            <span className="text-sm">Get {w.house} to vote {(mine.targets ?? []).length === 1 ? "them" : "every one of them"} out and you win.</span>
          </>
        ) : (
          <>
            <span className="font-display text-2xl font-bold">You are {art(w.good)}.</span>
            <span>
              {s.settings.murderers === 1 ? `One ${w.bad} is` : `${s.settings.murderers} ${w.bads} are`} hiding at this table, trying to frame {s.settings.targets === 1 ? `one ${w.good}` : `${s.settings.targets} ${w.goods}`}. Catch them first.
            </span>
            {mine.mustVote && s.alive.includes(mine.mustVote) && (
              <span className="mt-1 rounded-2xl px-3 py-2 font-bold text-white" style={{ background: w.badColour }}>
                {w.forced} Today you must vote for {name(mine.mustVote)}. Nobody else knows it is you.
              </span>
            )}
          </>
        ))}
    </button>
  );
}

function PastVotes({ votes, name, w }: { votes: VoteDay[]; name: (id: string) => string; w: ThemeWords }) {
  const [open, setOpen] = useState(false);
  const done = votes.filter((v) => v.entries.length > 0);
  if (done.length === 0) return null;
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center justify-between font-bold">
        <span>Past votes</span>
        <span className="text-sm text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open &&
        done.map((v) => (
          <div key={v.day + (v.showdown ? "s" : "")} className="flex flex-col gap-0.5 border-t-2 border-ink/10 pt-2">
            <span className="text-xs font-bold tracking-widest text-muted">
              DAY {v.day}
              {v.showdown ? ` · ${w.showdown.toUpperCase()}` : ""}
              {v.blackmail ? ` · ${w.blackmail.toUpperCase()}` : ""}
            </span>
            {v.entries.map((e) => (
              <span key={e.voter}>
                {name(e.voter)} voted {name(e.vote)}
              </span>
            ))}
            <span className="font-bold">{v.out ? (v.pardoned ? `${name(v.out)} was saved by ${w.pardon}` : `${name(v.out)} was ${w.sendAway}: ${art(v.role === "murderer" ? w.bad : w.good)}`) : "Tied. Nobody left."}</span>
          </div>
        ))}
    </div>
  );
}

function House({ s, people, me }: { s: MurderPublic; people: Map<string, Person>; me: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {s.team.map((id) => {
        const gone = s.departed.find((d) => d.id === id);
        const w = themeOf(s.settings.theme);
        const p = people.get(id);
        return (
          <span key={id} className={`flex items-center gap-1 rounded-full border-2 border-ink px-2 py-1 text-sm ${gone ? "bg-surface-2 opacity-60" : "bg-surface"}`}>
            <Avatar p={p} size="h-7 w-7 text-sm" faded={!!gone} />
            <span className="font-bold">{id === me ? "You" : p?.name}</span>
            {gone && <span>{gone.how === "killed" ? "· out" : gone.role === "murderer" ? `· ${w.bad}` : `· ${w.good}`}</span>}
            {!gone && s.cardHolder === id && <span>· holds the card</span>}
            {!gone && s.silenced === id && <span>· silenced</span>}
          </span>
        );
      })}
    </div>
  );
}

function guestCardName(st: MurderSettings) {
  const w = themeOf(st.theme);
  return st.cards.pardon && st.cards.showdown ? `${w.pardon} and ${w.showdown}` : st.cards.pardon ? w.pardon : w.showdown;
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
  mine: MurderMine | null;
  me: string;
  hostId: string;
  people: Map<string, Person>;
  act: Act;
}) {
  const { go, busy, errorLine } = useAct(act);
  const [pick, setPick] = useState<string | null>(null);
  const [action, setAction] = useState<NightPick["action"]>("kill");
  const [voteFor, setVoteFor] = useState<string | null>(null);
  const isHost = me === hostId;
  const w = themeOf(s.settings.theme);
  useThemeBackdrop(w.key, phase === "night");
  const alive = s.alive.includes(me);
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name ?? "Someone");
  const hostName = people.get(hostId)?.name ?? "the host";
  const murderer = mine?.role === "murderer";
  const stage = `${phase}:${s.day}:${s.election?.round ?? 0}:${s.votes.length}`;
  const [lastStage, setLastStage] = useState(stage);
  if (stage !== lastStage) {
    setLastStage(stage);
    setPick(null);
    setVoteFor(null);
  }

  const header = <span className="text-sm font-bold tracking-widest text-muted">{s.day === 0 ? w.title.toUpperCase() : `DAY ${s.day}`}</span>;
  const passing =
    s.passing === me ? (
      <div className="card flex flex-col gap-3 px-4 py-4">
        <span className="font-display text-xl font-bold">Hand on the {guestCardName(s.settings)} card</span>
        <p>You have left the game. Choose who holds the card now.</p>
        <Grid ids={s.alive} people={people} me={me} pick={pick} onPick={setPick} />
        <button type="button" disabled={busy || !pick} onClick={() => go("pass_card", { player: pick })} className={secondary}>
          {pick ? `Give it to ${name(pick)}` : "Tap a player"}
        </button>
      </div>
    ) : s.passing ? (
      <p className="text-center text-muted">Waiting for {name(s.passing)} to hand on the card.</p>
    ) : null;

  if (phase === "roles") {
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <Emblem theme={w.key} size={72} />
        <h2 className="font-display text-4xl font-bold leading-tight">{w.title}</h2>
        <p className="text-lg font-bold">{w.tagline}</p>
        <Secret mine={mine} s={s} name={name} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-lg">
          <li>The {w.bads} know each other, and who they must frame.</li>
          <li>At night every phone makes a choice. The {w.bads} can use: {[s.settings.cards.kill && w.kill, s.settings.cards.silence && w.silence, s.settings.cards.blackmail && w.blackmail].filter(Boolean).join(", ") || "nothing"}.</li>
          <li>By day, talk, then vote someone out. Every vote is shown.</li>
          {(s.settings.cards.pardon || s.settings.cards.showdown) && <li>On day 2 {w.house} elects one player to hold {guestCardName(s.settings)}.</li>}
          <li>{cap(w.bads)} win if every target is voted out. {cap(w.goods)} win if every {w.bad} is.</li>
        </ul>
        {errorLine}
        {isHost ? (
          <button type="button" disabled={busy} onClick={() => go("next", { day: 0 })} className={`${primary} mt-auto`}>
            {w.nightTitle}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName}</p>
        )}
      </section>
    );
  }

  if (phase === "night") {
    const myPick = mine?.pick ?? null;
    const partnerPicks = Object.entries(mine?.partnerPicks ?? {}).filter(([id]) => s.alive.includes(id));
    const describe = (p: NightPick | null) =>
      !p ? "not chosen yet" : p.action === "nothing" ? "do nothing" : p.action === "blackmail" ? `${w.blackmail}: ${name(p.player ?? "")} must vote ${name(p.voteFor ?? "")}` : `${actionName(w, p.action)}: ${name(p.player ?? "")}`;
    const actions = (["kill", "silence", "blackmail"] as const).filter((a) => s.settings.cards[a]);
    const targets = mine?.targets ?? [];
    const canSend =
      action === "nothing" || (pick && (action !== "blackmail" || (voteFor && voteFor !== pick)));
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <div className="flex items-center gap-3">
          <Emblem theme={w.key} size={44} />
          <h2 className="font-display text-3xl font-bold leading-tight">{w.nightTitle}</h2>
        </div>
        <p className="text-lg">Everyone makes a choice and can send messages. Keep your screen to yourself. Morning comes when more than half of you are ready.</p>
        {!alive ? (
          <p className="card px-4 py-4 text-lg">You are out of the game. Stay at the table and watch {w.house}.</p>
        ) : murderer ? (
          <div className="card flex flex-col gap-3 px-4 py-4">
            <span className="text-xs font-bold tracking-widest text-muted">THE {w.bads.toUpperCase()} CHOOSE ONE THING</span>
            <div className="flex flex-wrap gap-2">
              {[...actions, "nothing" as const].map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={action === a}
                  disabled={a === "kill" && s.killsLeft <= 0}
                  onClick={() => setAction(a)}
                  className={`${smallBase} ${action === a ? "bg-go shadow-[3px_3px_0_#111]" : "bg-surface"}`}
                >
                  {actionName(w, a)}
                  {a === "kill" ? ` (${s.killsLeft} left)` : ""}
                </button>
              ))}
            </div>
            {action !== "nothing" && (
              <>
                <span className="font-bold">{action === "kill" ? `${w.kill}: who, tonight?` : action === "silence" ? `${w.silence}: who cannot speak tomorrow? You can choose yourself.` : `${w.blackmail}: whose vote do you control?`}</span>
                <Grid
                  ids={s.alive}
                  people={people}
                  me={me}
                  pick={pick}
                  onPick={setPick}
                  disabled={(id) => (action !== "silence" && (id === me || (mine?.partners ?? []).includes(id))) || (action === "kill" && targets.includes(id))}
                />
              </>
            )}
            {action === "blackmail" && pick && (
              <>
                <span className="font-bold">{name(pick)} must vote for:</span>
                <Grid ids={s.alive.filter((x) => x !== pick)} people={people} me={me} pick={voteFor} onPick={setVoteFor} />
              </>
            )}
            <button
              type="button"
              disabled={busy || !canSend}
              onClick={() => go("night_pick", { day: s.day, action, player: action === "nothing" ? null : pick, voteFor: action === "blackmail" ? voteFor : null })}
              className={secondary}
            >
              {myPick ? "Change my choice" : "Choose"}
            </button>
            <p>Your choice: {describe(myPick)}</p>
            {partnerPicks.map(([id, p]) => (
              <p key={id}>
                {name(id)}: {describe(p)}
              </p>
            ))}
            {partnerPicks.length > 0 && <p className="text-sm text-muted">You must all choose the same thing before morning comes.</p>}
          </div>
        ) : (
          <div className="card flex flex-col gap-3 px-4 py-4">
            <span className="text-xs font-bold tracking-widest text-muted">{(s.settings.cards.guard ? w.guard : "Who do you suspect?").toUpperCase()}</span>
            {s.settings.cards.guard && (
              <p>
                {w.guardQuestion} If {GUARDS_TO_SAVE} of you choose the same player, the {w.bads} cannot get to them tonight.
              </p>
            )}
            <Grid ids={s.alive.filter((x) => x !== me)} people={people} me={me} pick={pick ?? myPick?.player ?? null} onPick={setPick} />
            <button
              type="button"
              disabled={busy || !pick}
              onClick={() => go("night_pick", { day: s.day, action: s.settings.cards.guard ? "guard" : "suspect", player: pick })}
              className={secondary}
            >
              {myPick ? "Change my choice" : "Choose"}
            </button>
            {myPick && (
              <p>
                {s.settings.cards.guard ? `You are guarding ${name(myPick.player ?? "")}.` : `You suspect ${name(myPick.player ?? "")}.`} Only you can see this.
              </p>
            )}
          </div>
        )}
        {alive && <Messages s={s} mine={mine} me={me} people={people} name={name} go={go} busy={busy} />}
        {alive && <ReadyBar s={s} me={me} label="Ready for morning" go={go} busy={busy} waitingNote="Waiting for the last choices." />}
        {isHost && (
          <p className="text-center text-muted">
            {s.nightReady} of {s.alive.length} ready
          </p>
        )}
        {errorLine}
        {isHost && (
          <button type="button" disabled={busy} onClick={() => go("end_night", { day: s.day })} className={`${small} mt-auto`}>
            A phone has gone quiet: end the night
          </button>
        )}
      </section>
    );
  }

  if (phase === "day" || phase === "election") {
    const m = s.morning;
    const e = s.election;
    const voted = e?.voted.includes(me);
    const holder = s.cardHolder === me && alive;
    const needsElection = (s.settings.cards.pardon || s.settings.cards.showdown) && !s.electionDone && s.day >= 2;
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <div className="flex items-center gap-3">
          <Emblem theme={w.key} size={44} />
          <h2 className="font-display text-3xl font-bold leading-tight">{phase === "election" ? "Elect someone you trust" : w.morningTitle}</h2>
        </div>
        {m && phase === "day" && (
          <div className="card flex flex-col gap-2 px-5 py-4 text-lg">
            {m.killed && <p className="font-bold">{w.killed(name(m.killed), m.killed === me)}</p>}
            {m.guarded && <p className="font-bold">{w.saved(name(m.guarded), m.guarded === me)}</p>}
            {m.silenced && (
              <p className="font-bold">
                {w.silenced(name(m.silenced), m.silenced === me)} {m.silenced === me ? "You" : "They"} can still vote.
              </p>
            )}
            {m.blackmail && <p className="font-bold">{w.blackmailed}</p>}
            {!m.killed && !m.guarded && !m.silenced && !m.blackmail && <p className="font-bold">{w.quietNight}</p>}
          </div>
        )}
        <Secret mine={mine} s={s} name={name} />
        <MessageLog mine={mine} name={name} />
        {passing}
        {phase === "election" && e ? (
          <div className="card flex flex-col gap-3 px-4 py-4">
            <p>
              {e.round === 1
                ? `Whoever you elect holds ${guestCardName(s.settings)}. If nobody has more than half the votes, the top two go to a second round.`
                : `Second round. Choose between the top ${e.candidates?.length ?? 2}.`}
            </p>
            {!alive ? (
              <p>You are out. Watch {w.house} decide.</p>
            ) : voted ? (
              <p className="font-bold">Your vote is in. Waiting for: {s.alive.filter((id) => !e.voted.includes(id)).map(name).join(", ")}</p>
            ) : (
              <>
                <Grid ids={(e.candidates ?? s.alive).filter((x) => x !== me)} people={people} me={me} pick={pick} onPick={setPick} />
                <button type="button" disabled={busy || !pick} onClick={() => go("elect", { round: e.round, player: pick })} className={secondary}>
                  {pick ? `Elect ${name(pick)}` : "Tap a player"}
                </button>
              </>
            )}
            {isHost && e.voted.length > 0 && e.voted.length < s.alive.length && (
              <button type="button" disabled={busy} onClick={() => go("count_election", { round: e.round })} className={small}>
                Count the votes now
              </button>
            )}
          </div>
        ) : (
          <>
            {holder && s.settings.cards.showdown && !s.showdownUsed && (
              <div className="card flex flex-col gap-3 px-4 py-4">
                <span className="font-display text-xl font-bold">You hold {w.showdown}</span>
                <p>Name one player. Today {w.house} votes only between you and them. The loser leaves.</p>
                <Grid ids={s.alive.filter((x) => x !== me)} people={people} me={me} pick={pick} onPick={setPick} />
                <button type="button" disabled={busy || !pick} onClick={() => go("showdown", { day: s.day, player: pick })} className={secondary}>
                  {pick ? `${w.showdown} with ${name(pick)}` : "Tap a player"}
                </button>
              </div>
            )}
            <p className="text-lg">Talk it out. Who is pushing the blame, and why?</p>
          </>
        )}
        <House s={s} people={people} me={me} />
        <PastVotes votes={s.votes} name={name} w={w} />
        {errorLine}
        {phase === "day" && alive && (
          <div className="mt-auto">
            <ReadyBar s={s} me={me} label={needsElection ? "Ready to elect" : "Ready to vote"} go={go} busy={busy} waitingNote={s.passing ? "Waiting for the card to be handed on." : undefined} />
          </div>
        )}
        {phase === "day" && isHost && (
          <button type="button" disabled={busy || !!s.passing} onClick={() => go("next", { day: s.day })} className={small}>
            Host: {needsElection ? "start the election" : "start the vote"} now
          </button>
        )}
      </section>
    );
  }

  if (phase === "vote") {
    const today = s.votes[s.votes.length - 1];
    const sd = today?.showdown;
    const forced = mine?.mustVote && s.alive.includes(mine.mustVote) && (!sd || mine.mustVote === sd.caller || mine.mustVote === sd.opponent) ? mine.mustVote : null;
    const choices = (sd ? [sd.caller, sd.opponent] : s.alive).filter((x) => x !== me);
    const voted = s.voted.includes(me);
    return (
      <section className="flex flex-1 flex-col gap-4">
        {header}
        <h2 className="font-display text-3xl font-bold leading-tight">{sd ? w.showdown : w.voteQuestion}</h2>
        {sd && (
          <p className="text-lg">
            {name(sd.caller)} called a {w.showdown} with {name(sd.opponent)}. Vote for the one who should leave.
          </p>
        )}
        {today?.blackmail && <p className="font-bold">{w.blackmailed}</p>}
        {!alive ? (
          <p className="card px-4 py-4">You are out. Watch {w.house} vote.</p>
        ) : voted ? (
          <p className="card px-4 py-4 text-lg font-bold">Your vote is in. Waiting for: {s.alive.filter((id) => !s.voted.includes(id)).map(name).join(", ")}</p>
        ) : (
          <div className="card flex flex-col gap-3 px-4 py-4">
            {forced && (
              <p className="rounded-2xl px-4 py-3 font-bold text-white" style={{ background: w.badColour }}>
                {w.forced} You must vote for {name(forced)}.
              </p>
            )}
            <Grid ids={choices} people={people} me={me} pick={forced ?? pick} onPick={setPick} disabled={(id) => !!forced && id !== forced} />
            <button type="button" disabled={busy || !(forced ?? pick)} onClick={() => go("vote", { day: s.day, player: forced ?? pick })} className={secondary}>
              {(forced ?? pick) ? `Vote for ${name((forced ?? pick)!)}` : "Tap a player"}
            </button>
            <p className="text-sm text-muted">Votes stay hidden until everyone has voted. Then every vote is shown.</p>
          </div>
        )}
        {errorLine}
        {isHost && s.voted.length > 0 && s.voted.length < s.alive.length && (
          <button type="button" disabled={busy} onClick={() => go("count_votes", { day: s.day })} className={`${small} mt-auto`}>
            Count the votes now
          </button>
        )}
      </section>
    );
  }

  if (phase === "pardon" || phase === "reveal") {
    return <Reveal w={w} phase={phase} s={s} me={me} isHost={isHost} hostName={hostName} people={people} name={name} go={go} busy={busy} errorLine={errorLine} passing={passing} />;
  }

  return null;
}

function Reveal({
  w,
  phase,
  s,
  me,
  isHost,
  hostName,
  people,
  name,
  go,
  busy,
  errorLine,
  passing,
}: {
  w: ThemeWords;
  phase: string;
  s: MurderPublic;
  me: string;
  isHost: boolean;
  hostName: string;
  people: Map<string, Person>;
  name: (id: string) => string;
  go: (type: string, payload?: Record<string, unknown>) => Promise<unknown>;
  busy: boolean;
  errorLine: React.ReactNode;
  passing: React.ReactNode;
}) {
  const v = s.votes[s.votes.length - 1];
  const fromVote = !!v && v.day === s.day && (phase === "pardon" || v.entries.length > 0 || !!v.out);
  const total = fromVote ? v.entries.length : 0;
  const key = `${s.day}:${s.votes.length}`;
  const [shown, setShown] = useState({ key, n: 0 });
  const n = shown.key === key ? shown.n : 0;
  useEffect(() => {
    if (n >= total) return;
    const t = setTimeout(() => setShown({ key, n: n + 1 }), 900);
    return () => clearTimeout(t);
  }, [n, total, key]);
  const allShown = n >= total;
  const holder = s.cardHolder === me && s.alive.includes(me);

  return (
    <section className="flex flex-1 flex-col gap-4">
      <span className="text-sm font-bold tracking-widest text-muted">DAY {s.day}</span>
      {fromVote && (
        <div className="card flex flex-col gap-1 px-5 py-4 text-lg">
          <span className="text-xs font-bold tracking-widest text-muted">THE VOTES{v.showdown ? ` · ${w.showdown.toUpperCase()}` : ""}</span>
          {v.entries.slice(0, n).map((e) => (
            <p key={e.voter}>
              <strong>{name(e.voter)}</strong> {e.voter === me ? "vote" : "votes"} <strong>{name(e.vote)}</strong>
            </p>
          ))}
          {!allShown && <p className="text-muted">...</p>}
        </div>
      )}
      {allShown && phase === "pardon" && v.out && (
        <div className="card flex flex-col gap-3 px-5 py-4">
          <p className="font-display text-2xl font-bold">{cap(w.house)} has voted out {name(v.out)}.</p>
          {holder ? (
            <>
              <p>You hold {w.pardon}. You can use it once: {name(v.out)} stays, and nobody learns what they are.</p>
              <button type="button" disabled={busy} onClick={() => go("pardon", { day: s.day, use: true })} className={secondary}>
                Use {w.pardon} on {name(v.out)}
              </button>
              <button type="button" disabled={busy} onClick={() => go("pardon", { day: s.day, use: false })} className={small}>
                Let the vote stand
              </button>
            </>
          ) : (
            <p className="text-lg">Everyone looks at {name(s.cardHolder ?? "")}. Will they use {w.pardon}?</p>
          )}
        </div>
      )}
      {allShown && phase === "reveal" && (
        <>
          {fromVote && (
            <div className="card flex flex-col gap-2 px-5 py-4 text-lg">
              {!v.out ? (
                <p className="font-bold">The vote was tied. Nobody leaves.</p>
              ) : v.pardoned ? (
                <p className="font-bold">{name(s.cardHolder ?? "")} used {w.pardon} on {name(v.out)}. They stay, and their secret stays with them.</p>
              ) : (
                <>
                  <p className="font-display text-2xl font-bold">
                    {name(v.out)} {v.out === me ? "were" : "was"} {art(v.role === "murderer" ? w.bad : w.good)}.
                  </p>
                  {v.target && <p className="font-bold">And a target. The frame worked.</p>}
                </>
              )}
            </div>
          )}
          {s.winner && s.endReveal && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Emblem theme={w.key} size={64} />
              <span
                className={`rounded-3xl border-[5px] px-5 py-3 text-center font-display text-4xl font-bold leading-none text-white shadow-[6px_6px_0_#111] ${s.winner === "guests" ? "border-[#1f6b3a] bg-[#3da35d]" : "border-ink"}`}
                style={{ transform: "rotate(-3deg)", ...(s.winner === "guests" ? {} : { background: w.badColour }) }}
              >
                {s.winner === "guests" ? `The ${w.goods} win` : `The ${w.bads} win`}
              </span>
              <p className="text-center text-lg">
                The {w.bads} were <strong>{s.endReveal.murderers.map(name).join(" and ")}</strong>. They had to frame <strong>{s.endReveal.targets.map(name).join(" and ")}</strong>.
              </p>
            </div>
          )}
          {passing}
          <House s={s} people={people} me={me} />
        </>
      )}
      <PastVotes votes={s.votes.slice(0, -1)} name={name} w={w} />
      {errorLine}
      {phase === "reveal" &&
        allShown &&
        (isHost ? (
          <button type="button" disabled={busy || (!!s.passing && !s.winner)} onClick={() => go("next", { day: s.day })} className={`${primary} mt-auto`}>
            {s.winner ? "See the final scores" : w.nightTitle}
          </button>
        ) : (
          <p className="mt-auto text-center text-muted">Waiting for {hostName}</p>
        ))}
    </section>
  );
}

export function MurderResults({ state: s, me, hostId, people, act }: { state: MurderPublic; me: string; hostId: string; people: Map<string, Person>; act: Act }) {
  const { go, busy } = useAct(act);
  const ranked = [...s.team].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  const name = (id: string) => (id === me ? "You" : people.get(id)?.name ?? "Someone");
  const w = themeOf(s.settings?.theme);
  useThemeBackdrop(w.key, false);
  return (
    <section className="flex flex-1 flex-col gap-4">
      <Emblem theme={w.key} size={64} />
      <h2 className="font-display text-4xl font-bold leading-tight text-ink">{s.winner === "guests" ? `The ${w.goods} win` : `The ${w.bads} win`}</h2>
      {s.endReveal && (
        <p className="text-lg">
          The {w.bads} were <strong>{s.endReveal.murderers.map(name).join(" and ")}</strong>.
        </p>
      )}
      <div className="card flex flex-col gap-2 px-5 py-4">
        {ranked.map((id, i) => (
          <p key={id} className={`flex justify-between text-lg ${i === 0 ? "font-bold" : ""}`}>
            <span>{name(id)}</span>
            <span>{s.scores[id] ?? 0}</span>
          </p>
        ))}
      </div>
      <PastVotes votes={s.votes} name={name} w={w} />
      {(s.timings ?? []).length > 0 && (
        <p className="text-sm text-muted">
          {(["night", "day"] as const)
            .map((ph) => {
              const t = (s.timings ?? []).filter((x) => x.phase === ph);
              if (!t.length) return null;
              const avg = Math.round(t.reduce((n, x) => n + x.seconds, 0) / t.length);
              return `Average ${ph}: ${Math.floor(avg / 60)}m ${avg % 60}s`;
            })
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {me === hostId ? (
        <div className="mt-auto flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => go("start_game", { gameId: "murder", options: { ...s.settings } })} className={primary}>
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

/** The host's settings in the lobby: how many murderers and targets, kills, and which cards are in. */
export function MurderSettingsPanel({ value, onChange, players, check }: { value: MurderOptions; onChange: (v: MurderOptions) => void; players: number; check: { ok: boolean; reason?: string; warning?: string } }) {
  const step = (label: string, key: "murderers" | "targets" | "killsEach", min: number, max: number) => (
    <div className="flex min-h-12 items-center justify-between px-3">
      <span className="font-bold">{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value[key] <= min} onClick={() => onChange({ ...value, [key]: value[key] - 1 })} className="h-10 w-10 rounded-full border-2 border-ink bg-surface text-xl font-bold disabled:opacity-35">
          -
        </button>
        <span className="w-6 text-center font-display text-xl font-bold">{value[key]}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value[key] >= max} onClick={() => onChange({ ...value, [key]: value[key] + 1 })} className="h-10 w-10 rounded-full border-2 border-ink bg-surface text-xl font-bold disabled:opacity-35">
          +
        </button>
      </span>
    </div>
  );
  const toggle = (k: keyof MurderOptions["cards"], label: string, line: string) => (
    <button
      type="button"
      aria-pressed={value.cards[k]}
      onClick={() => onChange({ ...value, cards: { ...value.cards, [k]: !value.cards[k] } })}
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 text-left"
    >
      <span className="flex flex-col">
        <span className="font-bold">{label}</span>
        <span className="text-sm text-muted">{line}</span>
      </span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${value.cards[k] ? "bg-go" : "bg-surface-2"}`}>{value.cards[k] ? "In" : "Out"}</span>
    </button>
  );
  const w = themeOf(value.theme);
  return (
    <div className="card flex flex-col gap-1 p-3" role="group" aria-label="Frame game settings">
      <div className="flex flex-wrap gap-2 px-3 pb-2" role="group" aria-label="Theme">
        {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.theme === k}
            onClick={() => onChange({ ...value, theme: k })}
            className={`h-10 rounded-full border-2 border-ink px-3 text-sm font-bold ${value.theme === k ? "bg-go shadow-[3px_3px_0_#111]" : "bg-surface"}`}
          >
            {THEMES[k].label}
          </button>
        ))}
      </div>
      <p className="px-3 font-display text-xl font-bold">{w.title}</p>
      <p className="px-3 text-sm text-muted">
        The {w.bads} know each other and who they must frame. Get {w.house} to vote the wrong person out. 5 to 12 players.
      </p>
      {step(cap(w.bads), "murderers", 1, 4)}
      {step("Targets", "targets", 1, 6)}
      {value.cards.kill && step(`${w.kill} each`, "killsEach", 1, 3)}
      <span className="px-3 pt-2 text-xs font-bold tracking-widest text-muted">{w.bad.toUpperCase()} CARDS</span>
      {toggle("kill", w.kill, `Remove ${art(w.good)} at night. Limited.`)}
      {toggle("silence", w.silence, "One player cannot talk for a day.")}
      {toggle("blackmail", w.blackmail, `Force one ${w.good}'s vote. Everyone knows a vote was forced, not whose.`)}
      <span className="px-3 pt-2 text-xs font-bold tracking-widest text-muted">{w.good.toUpperCase()} CARDS</span>
      {toggle("guard", w.guard, `Every night each ${w.good} protects someone. ${GUARDS_TO_SAVE} on the same player keep them safe that night.`)}
      {toggle("pardon", w.pardon, `Held by a player elected on day 2. Once, cancel the vote of ${w.house}.`)}
      {toggle("showdown", w.showdown, "Held by a player elected on day 2. Once, the vote is only between the holder and one player.")}
      {players >= 5 && !check.ok && <p className="px-3 font-bold text-alert">{check.reason}</p>}
      {check.ok && check.warning && <p className="px-3 font-bold">{check.warning}</p>}
    </div>
  );
}
