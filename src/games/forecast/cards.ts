// Family Forecast cards, batch 1, approved by Joshua on 4 Nov 2026 (19:05),
// from claude/forecast-cards-v0.md. Nothing else reaches a phone. Cards are
// not secret (everyone in a Forecast sees the same cards), so this file is
// safe for both the server and the phones.

export type ForecastKind = "person" | "yesno";
export type ForecastPack = "everyday" | "christmas";

export interface ForecastCard {
  key: string;
  pack: ForecastPack;
  text: string;
  kind: ForecastKind;
  /** Fewest players the card makes sense with. */
  min: number;
  /** "home", "out", "any", or "apart" (players in different homes). */
  place: "home" | "out" | "any" | "apart";
}

export const FORECAST_PACKS: { key: ForecastPack; label: string }[] = [
  { key: "everyday", label: "An ordinary family day" },
  { key: "christmas", label: "Christmas Day" },
];

export const FORECAST_CARDS: ForecastCard[] = [
  { key: "G1", pack: "everyday", text: 'Who will be first to say "I\'m hungry"?', kind: "person", min: 4, place: "any" },
  { key: "G2", pack: "everyday", text: "Who will be first to laugh out loud?", kind: "person", min: 4, place: "any" },
  { key: "G3", pack: "everyday", text: "Who will tell the first joke?", kind: "person", min: 4, place: "any" },
  { key: "G4", pack: "everyday", text: "Who will be first to find the TV remote?", kind: "person", min: 4, place: "home" },
  { key: "G5", pack: "everyday", text: 'Who will be first to say "are we nearly there?"', kind: "person", min: 4, place: "out" },
  { key: "G6", pack: "everyday", text: "Who will be last to sit down?", kind: "person", min: 4, place: "home" },
  { key: "G7", pack: "everyday", text: 'Will someone say "one more go"?', kind: "yesno", min: 3, place: "any" },
  { key: "G8", pack: "everyday", text: "Will everyone be sitting at the same table at the same time?", kind: "yesno", min: 3, place: "home" },
  { key: "G9", pack: "everyday", text: "Will we see rain before the day is over?", kind: "yesno", min: 3, place: "any" },
  { key: "G10", pack: "everyday", text: "Will someone sing out loud?", kind: "yesno", min: 3, place: "any" },
  { key: "G11", pack: "everyday", text: "Will we finish the day with a game everyone agrees on?", kind: "yesno", min: 3, place: "any" },
  { key: "G12", pack: "everyday", text: 'Will anyone say "that was brilliant" before bedtime?', kind: "yesno", min: 3, place: "any" },
  { key: "C1", pack: "christmas", text: 'Who will be first to say "I\'m stuffed"?', kind: "person", min: 4, place: "home" },
  { key: "C2", pack: "christmas", text: "Who will pull the first cracker?", kind: "person", min: 4, place: "home" },
  { key: "C3", pack: "christmas", text: "Who will be first to put on their paper hat?", kind: "person", min: 4, place: "home" },
  { key: "C4", pack: "christmas", text: "Who will read the first cracker joke out loud?", kind: "person", min: 4, place: "home" },
  { key: "C5", pack: "christmas", text: "Who will be last to finish opening their presents?", kind: "person", min: 4, place: "home" },
  { key: "C6", pack: "christmas", text: "Who will be first to play with something new?", kind: "person", min: 4, place: "home" },
  { key: "C7", pack: "christmas", text: "Who will be first to hum a Christmas tune?", kind: "person", min: 4, place: "any" },
  { key: "C8", pack: "christmas", text: "Will anyone wear their paper hat all through dinner?", kind: "yesno", min: 3, place: "home" },
  { key: "C9", pack: "christmas", text: "Will anyone ask for seconds of pudding?", kind: "yesno", min: 3, place: "home" },
  { key: "C10", pack: "christmas", text: "Will a cracker joke get a groan from everyone?", kind: "yesno", min: 3, place: "home" },
  { key: "C11", pack: "christmas", text: "Will anyone nod off after lunch?", kind: "yesno", min: 3, place: "home" },
  { key: "C12", pack: "christmas", text: "Will everyone watch the same film?", kind: "yesno", min: 3, place: "home" },
  { key: "C13", pack: "christmas", text: "Will we go for a walk after lunch?", kind: "yesno", min: 3, place: "home" },
  { key: "C14", pack: "christmas", text: "Will we see a robin today?", kind: "yesno", min: 3, place: "out" },
  { key: "C15", pack: "christmas", text: "Will it snow where we are?", kind: "yesno", min: 3, place: "any" },
  { key: "C16", pack: "christmas", text: 'Will anyone say "Happy Christmas" to the camera in the first five minutes of the call?', kind: "yesno", min: 3, place: "apart" },
  { key: "C17", pack: "christmas", text: "Will someone's video freeze at a funny moment?", kind: "yesno", min: 3, place: "apart" },
  { key: "C18", pack: "christmas", text: "Will everyone be on the call together before dinner?", kind: "yesno", min: 3, place: "apart" },
];

export const CARDS_PER_FORECAST = 6;

const BY_KEY = new Map(FORECAST_CARDS.map((c) => [c.key, c]));
export function forecastCard(key: string): ForecastCard | undefined {
  return BY_KEY.get(key);
}

/** Cards in a pack that suit this many players at home together (version 0). */
export function suitable(pack: ForecastPack, players: number): ForecastCard[] {
  return FORECAST_CARDS.filter((c) => c.pack === pack && c.min <= players && c.place !== "out" && c.place !== "apart");
}

/** Points for each right call, by how rare it was: a lone right call scores most. */
export function scoreCard(calls: Record<string, string>, outcome: string): Record<string, number> {
  const callers = Object.keys(calls);
  const right = callers.filter((id) => calls[id] === outcome);
  const points: Record<string, number> = {};
  for (const id of right) {
    if (right.length === 1 && callers.length >= 3) points[id] = 3;
    else if (right.length * 3 <= callers.length) points[id] = 2;
    else points[id] = 1;
  }
  return points;
}
