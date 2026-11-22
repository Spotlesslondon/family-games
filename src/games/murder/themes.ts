// Themes for Ashworth Hall (Joshua, 22 Nov 08:17: "Make the setting changeable
// just for fun"). Same rules, different words and colour. Copy is a tech lead
// draft for the CEO seat to rewrite. Original settings only: no borrowed
// characters, schools or franchises.

export type ThemeKey = "manor" | "wizards" | "fbi" | "warriors";

export interface ThemeWords {
  key: ThemeKey;
  /** Shown in the settings picker. */
  label: string;
  title: string;
  tagline: string;
  bad: string;
  bads: string;
  good: string;
  goods: string;
  /** "the house", "the tower": who votes. */
  house: string;
  nightTitle: string;
  morningTitle: string;
  /** Card names. */
  kill: string;
  silence: string;
  blackmail: string;
  pardon: string;
  showdown: string;
  /** "X was found dead in the library." */
  killed: (who: string, you: boolean) => string;
  silenced: (who: string, you: boolean) => string;
  blackmailed: string;
  /** Said to the forced voter, before "Today you must vote for X." */
  forced: string;
  /** "sent away", "banished". */
  sendAway: string;
  voteQuestion: string;
  quietNight: string;
  /** Colours: the secret card for a bad player, and the page accent. */
  badColour: string;
  accent: string;
}

export const THEMES: Record<ThemeKey, ThemeWords> = {
  manor: {
    key: "manor",
    label: "Murder mystery",
    title: "Murder at Ashworth Hall",
    tagline: "Commit the murder. Frame a friend.",
    bad: "murderer",
    bads: "murderers",
    good: "guest",
    goods: "guests",
    house: "the house",
    nightTitle: "Night falls",
    morningTitle: "Morning",
    kill: "Kill",
    silence: "Silence",
    blackmail: "Blackmail",
    pardon: "Pardon",
    showdown: "Showdown",
    killed: (w, you) => `${w} ${you ? "were" : "was"} found dead in the library.`,
    silenced: (w, you) => `${w} ${you ? "have" : "has"} been silenced. No talking today.`,
    blackmailed: "One vote today is blackmailed.",
    forced: "You are blackmailed.",
    sendAway: "sent away",
    voteQuestion: "Who should be sent away?",
    quietNight: "A quiet night. Nothing happened. Why?",
    badColour: "#7a1010",
    accent: "#f6efe0",
  },
  wizards: {
    key: "wizards",
    label: "Wizards",
    title: "Dark Magic at Hollow Spire",
    tagline: "Cast the curse. Frame an apprentice.",
    bad: "dark wizard",
    bads: "dark wizards",
    good: "apprentice",
    goods: "apprentices",
    house: "the tower",
    nightTitle: "The moon rises",
    morningTitle: "Dawn at the Spire",
    kill: "Curse",
    silence: "Hex of Silence",
    blackmail: "Enchant",
    pardon: "Counter-spell",
    showdown: "Duel",
    killed: (w, you) => `${w} ${you ? "were" : "was"} turned to stone in the night.`,
    silenced: (w, you) => `${w} ${you ? "are" : "is"} under a Hex of Silence. Not a word today.`,
    blackmailed: "One vote today is enchanted.",
    forced: "You are enchanted.",
    sendAway: "banished from the tower",
    voteQuestion: "Who should be banished?",
    quietNight: "The night passed without a spell. What are they saving it for?",
    badColour: "#3b1c6e",
    accent: "#ece6fb",
  },
  fbi: {
    key: "fbi",
    label: "FBI",
    title: "Mole Hunt",
    tagline: "Leak the files. Frame an agent.",
    bad: "double agent",
    bads: "double agents",
    good: "agent",
    goods: "agents",
    house: "the bureau",
    nightTitle: "Lights out at headquarters",
    morningTitle: "Morning briefing",
    kill: "Take out",
    silence: "Gag order",
    blackmail: "Leverage",
    pardon: "Clearance",
    showdown: "Interrogation",
    killed: (w, you) => `${w} ${you ? "were" : "was"} taken off the case overnight.`,
    silenced: (w, you) => `${w} ${you ? "are" : "is"} under a gag order. No talking today.`,
    blackmailed: "One vote today is under leverage.",
    forced: "They have leverage on you.",
    sendAway: "suspended",
    voteQuestion: "Who should be suspended?",
    quietNight: "A quiet night at the bureau. Too quiet.",
    badColour: "#12324f",
    accent: "#e4edf5",
  },
  warriors: {
    key: "warriors",
    label: "Warriors",
    title: "Traitors of the Clan",
    tagline: "Strike in the dark. Frame a warrior.",
    bad: "traitor",
    bads: "traitors",
    good: "warrior",
    goods: "warriors",
    house: "the clan",
    nightTitle: "The fires burn low",
    morningTitle: "Sunrise over the camp",
    kill: "Ambush",
    silence: "Vow of Silence",
    blackmail: "Threaten",
    pardon: "Mercy",
    showdown: "Trial by Combat",
    killed: (w, you) => `${w} ${you ? "were" : "was"} ambushed in the night and is out of the fight.`,
    silenced: (w, you) => `${w} ${you ? "are" : "is"} under a Vow of Silence. Not a word today.`,
    blackmailed: "One vote today is threatened.",
    forced: "You have been threatened.",
    sendAway: "exiled",
    voteQuestion: "Who should be exiled?",
    quietNight: "The camp slept in peace. Why did the traitors hold back?",
    badColour: "#6b2a0a",
    accent: "#f7eadb",
  },
};

export const themeOf = (key: unknown): ThemeWords => THEMES[(typeof key === "string" && key in THEMES ? key : "manor") as ThemeKey];
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "a guest", "an apprentice". */
export const art = (noun: string) => (/^[aeiou]/i.test(noun) ? "an " : "a ") + noun;
