// Murder at Ashworth Hall, rebuilt 22 Nov 2026 (Joshua: the aim is to frame
// someone; the players do the thinking). Rules: claude/ashworth-hall-rebuild-v0.md.
//
//  1. Some players are secretly murderers. They know each other and are told
//     which guests (their targets) they must get the house to vote out.
//  2. Night: every phone makes a choice so nobody stands out. The murderers
//     must agree on one action: kill (limited), silence, blackmail, or nothing.
//  3. Day: the table talks, then votes someone out. Every vote is revealed,
//     name by name, after all are in. The departed player's role is shown.
//  4. Guest card: on day 2 the house elects a holder in two rounds (top two go
//     to a run-off). Pardon: once, cancel a vote result. Showdown: once, the
//     day's vote is only between the holder and one player they name.
//  5. Murderers win when every target has been framed. Guests win when every
//     murderer is out (or when only two players are left).
//
// Secrecy, on the server: roles, targets, night choices and votes live in each
// phone's private row until the game reveals them. Nothing secret goes into
// public state or events.

import { registerGame } from "@/engine/registry";
import { shuffle } from "@/engine/rng";
import { accept, noop, reject, type GameContext, type GameModule, type PrivateMap, type TurnResult } from "@/engine/types";
import {
  GUARDS_TO_SAVE,
  MAX_MESSAGES_PER_NIGHT,
  NIGHT_SECONDS,
  QUICK_LINES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  POINTS_GUEST_WIN,
  POINTS_MURDERER_WIN,
  checkSettings,
  defaultSettings,
  type CardKey,
  type MurderMine,
  type MurderPublic,
  type MurderSettings,
  type NightPick,
  type VoteDay,
} from "./shape";
import { themeOf } from "./themes";

export const MURDER = "murder";

const st = (ctx: GameContext) => ctx.room.state as unknown as MurderPublic;
const pub = (s: MurderPublic) => s as unknown as Record<string, unknown>;
const mineOf = (priv: PrivateMap, id: string) => (priv[id] ?? { role: "guest" }) as unknown as MurderMine;
const row = (m: MurderMine) => m as unknown as Record<string, unknown>;
const isMurderer = (priv: PrivateMap, id: string) => mineOf(priv, id).role === "murderer";

function readSettings(n: number, options?: Record<string, unknown>): MurderSettings {
  const d = defaultSettings(n);
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) ? v : fallback);
  const cardsIn = (options?.cards ?? {}) as Record<string, unknown>;
  const cards = { ...d.cards };
  for (const k of Object.keys(cards) as CardKey[]) if (typeof cardsIn[k] === "boolean") cards[k] = cardsIn[k] as boolean;
  return {
    theme: themeOf(options?.theme).key,
    murderers: num(options?.murderers, d.murderers),
    targets: num(options?.targets, d.targets),
    killsEach: Math.max(0, Math.min(5, num(options?.killsEach, d.killsEach))),
    cards,
  };
}

const samePick = (a: NightPick | null | undefined, b: NightPick | null | undefined) =>
  !!a && !!b && a.action === b.action && a.player === b.player && (a.voteFor ?? null) === (b.voteFor ?? null);

function aliveMurderers(s: MurderPublic, priv: PrivateMap) {
  return s.alive.filter((id) => isMurderer(priv, id));
}

/** Start a night: clear yesterday's choices, votes and blackmail. */
function startNight(s: MurderPublic, priv: PrivateMap, day: number): TurnResult {
  const next: MurderPublic = { ...s, day, nightReady: 0, morning: null, silenced: null, blackmailToday: false, voted: [] };
  const rows: PrivateMap = {};
  for (const id of s.team) {
    const m = mineOf(priv, id);
    rows[id] = row({ ...m, pick: null, partnerPicks: m.role === "murderer" ? {} : undefined, mustVote: null, vote: null, elect: null });
  }
  // No phaseEndsAt here: the engine starts the night clock from timerSeconds.
  return accept({ phase: "night", state: pub(next), private: rows });
}

function winCheck(s: MurderPublic, priv: PrivateMap): MurderPublic {
  if (s.winner) return s;
  let winner: MurderPublic["winner"] = null;
  if (s.framed >= s.settings.targets) winner = "murderers";
  else if (aliveMurderers(s, priv).length === 0) winner = "guests";
  else if (s.alive.length <= 2) winner = "guests";
  if (!winner) return s;
  const murderers = s.team.filter((id) => isMurderer(priv, id));
  const targets = mineOf(priv, murderers[0]).targets ?? [];
  const scores = { ...s.scores };
  for (const id of s.team) {
    const m = murderers.includes(id);
    if (winner === "murderers" && m) scores[id] = (scores[id] ?? 0) + POINTS_MURDERER_WIN;
    if (winner === "guests" && !m) scores[id] = (scores[id] ?? 0) + POINTS_GUEST_WIN;
  }
  return { ...s, winner, scores, endReveal: { murderers, targets } };
}

function resolveNight(ctx: GameContext, s: MurderPublic, priv: PrivateMap): TurnResult {
  const ms = aliveMurderers(s, priv);
  const picks = ms.map((id) => mineOf(priv, id).pick);
  const agreed = picks.length > 0 && picks.every((p) => samePick(p, picks[0])) ? picks[0]! : null;
  let next: MurderPublic = { ...s };
  const morning: NonNullable<MurderPublic["morning"]> = { killed: null, silenced: null, blackmail: false, guarded: null };
  const rows: PrivateMap = {};
  for (const id of s.team) {
    const m = mineOf(priv, id);
    rows[id] = row({ ...m, pick: null, partnerPicks: m.role === "murderer" ? {} : undefined, mustVote: null });
  }
  const guards =
    agreed?.action === "kill" && s.settings.cards.guard
      ? s.alive.filter((id) => !isMurderer(priv, id) && samePick(mineOf(priv, id).pick, { action: "guard", player: agreed.player })).length
      : 0;
  if (agreed && agreed.player && agreed.action === "kill" && guards >= GUARDS_TO_SAVE) {
    // The guards stood firm: nobody dies, and the kill is not used up.
    morning.guarded = agreed.player;
  } else if (agreed && agreed.player) {
    if (agreed.action === "kill") {
      next.alive = next.alive.filter((x) => x !== agreed.player);
      next.departed = [...next.departed, { id: agreed.player, how: "killed", day: s.day, role: "guest" }];
      next.killsLeft = Math.max(0, next.killsLeft - 1);
      morning.killed = agreed.player;
      if (next.cardHolder === agreed.player) next = { ...next, cardHolder: null, passing: agreed.player };
    } else if (agreed.action === "silence") {
      morning.silenced = agreed.player;
      next.silenced = agreed.player;
    } else if (agreed.action === "blackmail" && agreed.voteFor) {
      morning.blackmail = true;
      next.blackmailToday = true;
      rows[agreed.player] = row({ ...(rows[agreed.player] as unknown as MurderMine), mustVote: agreed.voteFor });
    }
  }
  next = winCheck({ ...next, morning, nightReady: 0 }, priv);
  return accept({ phase: next.winner ? "reveal" : "day", phaseEndsAt: null, state: pub(next), private: rows });
}

function validPick(s: MurderPublic, priv: PrivateMap, actor: string, payload: Record<string, unknown>): NightPick | string {
  const action = payload.action;
  const player = typeof payload.player === "string" ? payload.player : null;
  const voteFor = typeof payload.voteFor === "string" ? payload.voteFor : null;
  const alive = (id: string | null) => !!id && s.alive.includes(id);
  if (!isMurderer(priv, actor)) {
    if (!alive(player) || player === actor) return "bad_choice";
    if (action === "guard" && s.settings.cards.guard) return { action: "guard", player };
    if (action === "suspect" && !s.settings.cards.guard) return { action: "suspect", player };
    return "bad_choice";
  }
  const me = mineOf(priv, actor);
  if (action === "nothing") return { action: "nothing", player: null };
  if (action === "kill") {
    if (!s.settings.cards.kill) return "card_off";
    if (s.killsLeft <= 0) return "no_kills_left";
    if (!alive(player) || isMurderer(priv, player!)) return "bad_choice";
    if ((me.targets ?? []).includes(player!)) return "cannot_kill_target";
    return { action, player };
  }
  if (action === "silence") {
    if (!s.settings.cards.silence) return "card_off";
    if (!alive(player)) return "bad_choice";
    return { action, player };
  }
  if (action === "blackmail") {
    if (!s.settings.cards.blackmail) return "card_off";
    if (!alive(player) || isMurderer(priv, player!)) return "bad_choice";
    if (!alive(voteFor) || voteFor === player) return "bad_choice";
    return { action, player, voteFor };
  }
  return "bad_choice";
}

/** Count the day's votes and either ask for a pardon or settle the result. */
function tally(ctx: GameContext, s: MurderPublic, priv: PrivateMap): TurnResult {
  const day = s.votes[s.votes.length - 1];
  const entries = s.alive.map((id) => ({ voter: id, vote: mineOf(priv, id).vote ?? "" })).filter((e) => e.vote);
  const count: Record<string, number> = {};
  for (const e of entries) count[e.vote] = (count[e.vote] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(count));
  const leaders = Object.keys(count).filter((k) => count[k] === top);
  const out = top > 0 && leaders.length === 1 ? leaders[0] : null;
  const settled: VoteDay = { ...day, entries, out, pardoned: false, role: null, target: false };
  const rows: PrivateMap = {};
  for (const id of s.team) rows[id] = row({ ...mineOf(priv, id), vote: null });
  const next: MurderPublic = { ...s, votes: [...s.votes.slice(0, -1), settled] };
  const canPardon = out && s.settings.cards.pardon && !s.pardonUsed && s.cardHolder && s.alive.includes(s.cardHolder) && s.cardHolder !== out;
  if (canPardon) return accept({ phase: "pardon", phaseEndsAt: null, state: pub(next), private: rows });
  return settle(next, priv, rows, false);
}

function settle(s: MurderPublic, priv: PrivateMap, rows: PrivateMap | undefined, pardoned: boolean): TurnResult {
  const day = s.votes[s.votes.length - 1];
  let next: MurderPublic = { ...s };
  let settled: VoteDay = { ...day, pardoned };
  if (day.out && !pardoned) {
    const role = isMurderer(priv, day.out) ? "murderer" : "guest";
    const targets = mineOf(priv, s.team.find((id) => isMurderer(priv, id))!).targets ?? [];
    const target = targets.includes(day.out);
    settled = { ...settled, role, target };
    next.alive = next.alive.filter((x) => x !== day.out);
    next.departed = [...next.departed, { id: day.out, how: "sent_away", day: s.day, role }];
    if (target) next.framed += 1;
    if (next.cardHolder === day.out) next = { ...next, cardHolder: null, passing: day.out };
  }
  next = winCheck({ ...next, votes: [...s.votes.slice(0, -1), settled] }, priv);
  return accept({ phase: "reveal", phaseEndsAt: null, state: pub(next), ...(rows ? { private: rows } : {}) });
}

function openVote(s: MurderPublic, showdown: VoteDay["showdown"]): TurnResult {
  const day: VoteDay = { day: s.day, showdown, entries: [], out: null, pardoned: false, role: null, target: false, blackmail: s.blackmailToday };
  return accept({ phase: "vote", phaseEndsAt: null, state: pub({ ...s, voted: [], votes: [...s.votes, day] }) });
}

function settleElection(ctx: GameContext, s: MurderPublic, priv: PrivateMap): TurnResult {
  const e = s.election!;
  const count: Record<string, number> = {};
  for (const id of s.alive) {
    const v = mineOf(priv, id).elect;
    if (v) count[v] = (count[v] ?? 0) + 1;
  }
  const rows: PrivateMap = {};
  for (const id of s.team) rows[id] = row({ ...mineOf(priv, id), elect: null });
  const ranked = Object.keys(count).sort((a, b) => count[b] - count[a]);
  const voters = s.alive.length;
  if (e.round === 1 && ranked.length > 0 && count[ranked[0]] * 2 <= voters) {
    // No outright majority: the top two (and anyone tied with them) go to a run-off.
    const second = ranked.length > 1 ? count[ranked[1]] : count[ranked[0]];
    const candidates = ranked.filter((k) => count[k] >= second);
    return accept({ state: pub({ ...s, election: { round: 2, candidates, voted: [], firstRound: count } }), private: rows });
  }
  const top = ranked.length ? count[ranked[0]] : 0;
  const tied = ranked.filter((k) => count[k] === top);
  const holder = tied.length ? tied[Math.floor(ctx.rng() * tied.length)] : null;
  return accept({ phase: "day", phaseEndsAt: null, state: pub({ ...s, election: null, electionDone: true, cardHolder: holder }), private: rows });
}

export const murder: GameModule = {
  id: MURDER,
  name: "Murder at Ashworth Hall",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  phases: {
    roles: { waitsFor: "host" },
    night: { waitsFor: "all", timerSeconds: NIGHT_SECONDS },
    day: { waitsFor: "host" },
    election: { waitsFor: "all" },
    vote: { waitsFor: "all" },
    pardon: { waitsFor: "one" },
    reveal: { waitsFor: "host" },
  },

  setup(ctx, options) {
    const n = ctx.players.length;
    const settings = readSettings(n, options);
    const check = checkSettings(n, settings);
    if (!check.ok) return reject(n < MIN_PLAYERS ? "too_few_players" : n > MAX_PLAYERS ? "too_many_players" : "bad_settings");
    const team = ctx.players.map((p) => p.id);
    const order = shuffle([...team], ctx.rng);
    const murderers = order.slice(0, settings.murderers);
    const guests = order.slice(settings.murderers);
    const targets = shuffle([...guests], ctx.rng).slice(0, settings.targets);
    const rows: PrivateMap = {};
    for (const id of team) {
      rows[id] = murderers.includes(id)
        ? row({ role: "murderer", partners: murderers.filter((x) => x !== id), targets, pick: null, partnerPicks: {} })
        : row({ role: "guest", pick: null });
    }
    const s: MurderPublic = {
      settings,
      team,
      alive: [...team],
      departed: [],
      day: 0,
      nightReady: 0,
      killsLeft: settings.cards.kill ? settings.killsEach * settings.murderers : 0,
      morning: null,
      silenced: null,
      blackmailToday: false,
      election: null,
      cardHolder: null,
      electionDone: false,
      pardonUsed: false,
      showdownUsed: false,
      passing: null,
      voted: [],
      votes: [],
      framed: 0,
      winner: null,
      endReveal: null,
      scores: Object.fromEntries(team.map((id) => [id, 0])),
      finished: false,
    };
    return accept({ phase: "roles", phaseEndsAt: null, state: pub(s), private: rows });
  },

  reduce(ctx, action) {
    const s = st(ctx);
    const phase = ctx.room.phase;
    const actor = action.actorId;
    const payload = action.payload ?? {};
    const isHost = actor === ctx.room.hostId;
    const priv = ctx.private;
    if (!s.team.includes(actor)) return reject("not_in_game");
    const guestCards = s.settings.cards.pardon || s.settings.cards.showdown;

    switch (action.type) {
      case "next": {
        if (!isHost) return reject("host_only");
        if (payload.day !== s.day) return noop();
        if (phase === "roles") return startNight(s, priv, 1);
        if (phase === "day") {
          if (s.passing) return reject("waiting_for_pass");
          if (guestCards && !s.electionDone && s.day >= 2) {
            return accept({ phase: "election", phaseEndsAt: null, state: pub({ ...s, election: { round: 1, candidates: null, voted: [], firstRound: null } }) });
          }
          return openVote(s, null);
        }
        if (phase === "reveal") {
          if (s.winner) return accept({ state: pub({ ...s, finished: true }) });
          if (s.passing) return reject("waiting_for_pass");
          return startNight(s, priv, s.day + 1);
        }
        return noop();
      }

      case "night_pick": {
        if (phase !== "night" || payload.day !== s.day) return noop();
        if (!s.alive.includes(actor)) return reject("not_playing");
        const pick = validPick(s, priv, actor, payload);
        if (typeof pick === "string") return reject(pick);
        const rows: PrivateMap = { [actor]: row({ ...mineOf(priv, actor), pick }) };
        if (isMurderer(priv, actor)) {
          for (const partner of aliveMurderers(s, priv).filter((x) => x !== actor)) {
            const pm = mineOf(priv, partner);
            rows[partner] = row({ ...pm, partnerPicks: { ...(pm.partnerPicks ?? {}), [actor]: pick } });
          }
        }
        const after: PrivateMap = { ...priv, ...rows };
        const ready = s.alive.filter((id) => mineOf(after, id).pick).length;
        const ms = aliveMurderers(s, after);
        const agree = ms.every((id) => samePick(mineOf(after, id).pick, mineOf(after, ms[0]).pick));
        const clockDone = !ctx.room.phaseEndsAt || Date.parse(ctx.now) >= Date.parse(ctx.room.phaseEndsAt);
        if (ready === s.alive.length && agree && clockDone) return resolveNight(ctx, { ...s, nightReady: ready }, after);
        return accept({ state: pub({ ...s, nightReady: ready }), private: rows });
      }

      case "whisper": {
        // A ready-made line to one named player, during the night only.
        if (phase !== "night" || payload.day !== s.day) return reject("night_only");
        if (!s.alive.includes(actor)) return reject("not_playing");
        const to = payload.to;
        if (typeof to !== "string" || !s.alive.includes(to) || to === actor) return reject("unknown_player");
        const line = payload.line;
        if (typeof line !== "number" || !Number.isInteger(line) || line < 0 || line >= QUICK_LINES.length) return reject("bad_choice");
        const about = typeof payload.about === "string" ? payload.about : null;
        if (QUICK_LINES[line].about) {
          if (!about || !s.alive.includes(about)) return reject("unknown_player");
        } else if (about) return reject("bad_choice");
        const me = mineOf(priv, actor);
        const tonight = (me.sent ?? []).filter((w) => w.day === s.day).length;
        if (tonight >= MAX_MESSAGES_PER_NIGHT) return reject("too_many_messages");
        const w = { day: s.day, from: actor, to, line, about: QUICK_LINES[line].about ? about : null };
        const them = mineOf(priv, to);
        return accept({
          private: {
            [actor]: row({ ...me, sent: [...(me.sent ?? []), w] }),
            [to]: row({ ...them, inbox: [...(them.inbox ?? []), w] }),
          },
        });
      }

      case "end_night": {
        // The host moves on if a phone has gone quiet. Murderers who have not agreed do nothing.
        if (!isHost) return reject("host_only");
        if (phase !== "night" || payload.day !== s.day) return noop();
        return resolveNight(ctx, s, priv);
      }

      case "elect": {
        if (phase !== "election" || !s.election || payload.round !== s.election.round) return noop();
        if (!s.alive.includes(actor)) return reject("not_playing");
        const player = payload.player;
        if (typeof player !== "string" || !s.alive.includes(player)) return reject("unknown_player");
        if (player === actor) return reject("self_vote");
        if (s.election.candidates && !s.election.candidates.includes(player)) return reject("not_a_candidate");
        const rows: PrivateMap = { [actor]: row({ ...mineOf(priv, actor), elect: player }) };
        const voted = s.election.voted.includes(actor) ? s.election.voted : [...s.election.voted, actor];
        const next = { ...s, election: { ...s.election, voted } };
        if (s.alive.every((id) => voted.includes(id))) return settleElection(ctx, next, { ...priv, ...rows });
        return accept({ state: pub(next), private: rows });
      }

      case "count_election": {
        if (!isHost) return reject("host_only");
        if (phase !== "election" || !s.election || payload.round !== s.election.round) return noop();
        if (s.election.voted.length === 0) return reject("no_votes");
        return settleElection(ctx, s, priv);
      }

      case "showdown": {
        if (phase !== "day" || payload.day !== s.day) return noop();
        if (!s.settings.cards.showdown || s.showdownUsed) return reject("card_off");
        if (actor !== s.cardHolder) return reject("not_card_holder");
        if (s.passing) return reject("waiting_for_pass");
        const player = payload.player;
        if (typeof player !== "string" || !s.alive.includes(player) || player === actor) return reject("unknown_player");
        return openVote({ ...s, showdownUsed: true }, { caller: actor, opponent: player });
      }

      case "vote": {
        if (phase !== "vote" || payload.day !== s.day) return noop();
        if (!s.alive.includes(actor)) return reject("not_playing");
        const player = payload.player;
        if (typeof player !== "string" || !s.alive.includes(player)) return reject("unknown_player");
        if (player === actor) return reject("self_vote");
        const sd = s.votes[s.votes.length - 1]?.showdown;
        if (sd && player !== sd.caller && player !== sd.opponent) return reject("not_a_candidate");
        const must = mineOf(priv, actor).mustVote;
        const mustCount = must && s.alive.includes(must) && must !== actor && (!sd || must === sd.caller || must === sd.opponent);
        if (mustCount && player !== must) return reject("blackmailed");
        const rows: PrivateMap = { [actor]: row({ ...mineOf(priv, actor), vote: player }) };
        const voted = s.voted.includes(actor) ? s.voted : [...s.voted, actor];
        const next = { ...s, voted };
        if (s.alive.every((id) => voted.includes(id))) return tally(ctx, next, { ...priv, ...rows });
        return accept({ state: pub(next), private: rows });
      }

      case "count_votes": {
        if (!isHost) return reject("host_only");
        if (phase !== "vote" || payload.day !== s.day) return noop();
        if (s.voted.length === 0) return reject("no_votes");
        return tally(ctx, s, priv);
      }

      case "pardon": {
        if (phase !== "pardon" || payload.day !== s.day) return noop();
        if (actor !== s.cardHolder) return reject("not_card_holder");
        const use = payload.use === true;
        return settle({ ...s, pardonUsed: s.pardonUsed || use }, priv, undefined, use);
      }

      case "pass_card": {
        if (actor !== s.passing) return reject("not_card_holder");
        const player = payload.player;
        if (typeof player !== "string" || !s.alive.includes(player)) return reject("unknown_player");
        return accept({ state: pub({ ...s, passing: null, cardHolder: player }) });
      }

      default:
        return reject("unknown_action");
    }
  },

  onPhaseExpired(ctx) {
    // The night clock has run out. Morning comes if everyone has chosen and the
    // murderers agree; otherwise the last choice brings it.
    if (ctx.room.phase !== "night") return noop();
    const s = st(ctx);
    const ms = aliveMurderers(s, ctx.private);
    const ready = s.alive.every((id) => mineOf(ctx.private, id).pick);
    const agree = ms.every((id) => samePick(mineOf(ctx.private, id).pick, mineOf(ctx.private, ms[0]).pick));
    return ready && agree ? resolveNight(ctx, s, ctx.private) : noop();
  },

  isComplete(state) {
    return (state as unknown as MurderPublic).finished === true;
  },

  results(state) {
    const s = state as unknown as MurderPublic;
    return (s.team ?? []).map((memberId) => ({ memberId, rawPoints: s.scores?.[memberId] ?? 0 }));
  },
};

registerGame(murder);
