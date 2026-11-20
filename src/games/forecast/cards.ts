// Family Forecast cards. Batch 1 approved by Joshua on 4 Nov 2026 (19:05),
// from claude/forecast-cards-v0.md; batch 2 (C19 to C68) approved 14 Nov
// (15:48), from claude/forecast-cards-batch-2.md. Nothing else reaches a phone. Cards are
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
  // Batch 2, approved by Joshua on 14 Nov 2026 (15:48), from claude/forecast-cards-batch-2.md.
  { key: "C19", pack: "christmas", text: "Who will be first to ask for batteries?", kind: "person", min: 4, place: "home" },
  { key: "C20", pack: "christmas", text: "Who will be first to ask what time dinner is?", kind: "person", min: 4, place: "home" },
  { key: "C21", pack: "christmas", text: 'Who will be first to say "that smells lovely"?', kind: "person", min: 4, place: "home" },
  { key: "C22", pack: "christmas", text: "Who will be first to put on some Christmas music?", kind: "person", min: 4, place: "home" },
  { key: "C23", pack: "christmas", text: "Who will be first to read a new game's rules out loud?", kind: "person", min: 4, place: "home" },
  { key: "C24", pack: "christmas", text: "Who will be first to ask what's for pudding?", kind: "person", min: 4, place: "home" },
  { key: "C25", pack: "christmas", text: "Who will be first to help clear the table?", kind: "person", min: 4, place: "home" },
  { key: "C26", pack: "christmas", text: "Who will be first to go outside after lunch?", kind: "person", min: 4, place: "home" },
  { key: "C27", pack: "christmas", text: "Will anyone ask for more sprouts?", kind: "yesno", min: 3, place: "home" },
  { key: "C28", pack: "christmas", text: "Will anyone dance in the kitchen?", kind: "yesno", min: 3, place: "home" },
  { key: "C29", pack: "christmas", text: "Will we hear the doorbell today?", kind: "yesno", min: 3, place: "home" },
  { key: "C30", pack: "christmas", text: "Will a present need building before anyone can play with it?", kind: "yesno", min: 3, place: "home" },
  { key: "C31", pack: "christmas", text: "Will we play a board game or a card game today?", kind: "yesno", min: 3, place: "home" },
  { key: "C32", pack: "christmas", text: "Will someone try a food they have never had before?", kind: "yesno", min: 3, place: "home" },
  { key: "C33", pack: "christmas", text: "Will anyone stand up and make a speech at dinner?", kind: "yesno", min: 3, place: "home" },
  { key: "C34", pack: "christmas", text: "Who will be first to spot a Christmas tree in a window?", kind: "person", min: 4, place: "out" },
  { key: "C35", pack: "christmas", text: "Who will be first to spot a dog?", kind: "person", min: 4, place: "out" },
  { key: "C36", pack: "christmas", text: "Who will be first to jump in a puddle?", kind: "person", min: 4, place: "out" },
  { key: "C37", pack: "christmas", text: "Who will be first to say \"I'm cold\"?", kind: "person", min: 4, place: "out" },
  { key: "C38", pack: "christmas", text: "Who will be first back through the front door?", kind: "person", min: 4, place: "out" },
  { key: "C39", pack: "christmas", text: "Will we see a dog wearing a Christmas jumper?", kind: "yesno", min: 3, place: "out" },
  { key: "C40", pack: "christmas", text: "Will we meet someone we know?", kind: "yesno", min: 3, place: "out" },
  { key: "C41", pack: "christmas", text: "Will we see a squirrel?", kind: "yesno", min: 3, place: "out" },
  { key: "C42", pack: "christmas", text: "Will we pass a house with flashing lights?", kind: "yesno", min: 3, place: "out" },
  { key: "C43", pack: "christmas", text: "Will the street lights come on before we get home?", kind: "yesno", min: 3, place: "out" },
  { key: "C44", pack: "christmas", text: "Will anyone come home with muddy shoes?", kind: "yesno", min: 3, place: "out" },
  { key: "C45", pack: "christmas", text: "Who will be first to join the call?", kind: "person", min: 4, place: "apart" },
  { key: "C46", pack: "christmas", text: "Who will be first to wave at the camera?", kind: "person", min: 4, place: "apart" },
  { key: "C47", pack: "christmas", text: "Who will be first to hold something up to the camera?", kind: "person", min: 4, place: "apart" },
  { key: "C48", pack: "christmas", text: "Who will be first to mention the weather?", kind: "person", min: 4, place: "any" },
  { key: "C49", pack: "christmas", text: "Who will tell the first story about a Christmas long ago?", kind: "person", min: 4, place: "any" },
  { key: "C50", pack: "christmas", text: "Who will be first to suggest a game?", kind: "person", min: 4, place: "any" },
  { key: "C51", pack: "christmas", text: "Who will be first to win a game after lunch?", kind: "person", min: 4, place: "any" },
  { key: "C52", pack: "christmas", text: "Will someone start talking while they are on mute?", kind: "yesno", min: 3, place: "apart" },
  { key: "C53", pack: "christmas", text: "Will a pet appear on the call?", kind: "yesno", min: 3, place: "apart" },
  { key: "C54", pack: "christmas", text: "Will two people start talking at once, then both stop?", kind: "yesno", min: 3, place: "apart" },
  { key: "C55", pack: "christmas", text: "Will everyone wave goodbye at the same time?", kind: "yesno", min: 3, place: "apart" },
  { key: "C56", pack: "christmas", text: "Will anyone join the call from the kitchen?", kind: "yesno", min: 3, place: "apart" },
  { key: "C57", pack: "christmas", text: "Will we call each other more than once today?", kind: "yesno", min: 3, place: "apart" },
  { key: "C58", pack: "christmas", text: 'Will anyone say "best Christmas ever"?', kind: "yesno", min: 3, place: "any" },
  { key: "C59", pack: "christmas", text: "Who will be first to nod off?", kind: "person", min: 4, place: "home" },
  { key: "C60", pack: "christmas", text: "Who will be first to spill something at dinner?", kind: "person", min: 4, place: "home" },
  { key: "C61", pack: "christmas", text: "Who will be first to be accused of cheating?", kind: "person", min: 4, place: "any" },
  { key: "C62", pack: "christmas", text: "Who will be first to get caught on their phone at the table?", kind: "person", min: 4, place: "home" },
  { key: "C63", pack: "christmas", text: 'Who will be first to say "I told you so"?', kind: "person", min: 4, place: "any" },
  { key: "C64", pack: "christmas", text: "Who will be first to sneak a chocolate before dinner?", kind: "person", min: 4, place: "home" },
  { key: "C65", pack: "christmas", text: "Who will be first to ask for a rematch after losing?", kind: "person", min: 4, place: "any" },
  { key: "C66", pack: "christmas", text: "Will anyone sit on the TV remote?", kind: "yesno", min: 3, place: "home" },
  { key: "C67", pack: "christmas", text: "Will someone get the words wrong in a Christmas song?", kind: "yesno", min: 3, place: "any" },
  { key: "C68", pack: "christmas", text: "Will anyone be caught peeking at someone else's phone?", kind: "yesno", min: 3, place: "home" },
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
