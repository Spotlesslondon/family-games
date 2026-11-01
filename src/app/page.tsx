// ashergames.com: the public coming-soon page (Option A, approved by Joshua
// 1 Nov 2026, 19:16; content in claude/site-go-live.md).
//
// Content is only what is true today: no sign-up, no prices, no contact, no
// claims. Family phones reach the app at /play (and by the /j/ invite links),
// so nothing here links into the app.
//
// Palette and contrast from the look brief: reading text only on paper,
// white, yellow or green; blue, pink and red are for art panels only.

import type { Metadata, Viewport } from "next";
import { atkinsonNext as reading, bagelFatOne as display } from "@/fonts/paper";
import { Blank, Fibber, HouseTrio, KnowItAll, Slammer, Sneak, Sweaty } from "@/components/cast";


export const metadata: Metadata = {
  title: "Asher Games: coming soon",
  description: "Secret words, fibbing, buzzers and a quiz for every age. Coming soon.",
};

export const viewport: Viewport = {
  themeColor: "#FFF1CF",
};

const INK = "#111111";

interface Game {
  name: string;
  teaser: string;
  Character: (p: { className?: string; decorative?: boolean }) => React.ReactElement;
  panel: string;
}

const GAMES: Game[] = [
  {
    name: "Mr White",
    teaser: "Everyone has a secret word. Except one of you, who has to bluff. Spot the faker before they work it out.",
    Character: Blank,
    panel: "#2F6BFF",
  },
  {
    name: "Fake Answers",
    teaser: "Write a lie so good your own mother believes it. Then try to spot the truth.",
    Character: Fibber,
    panel: "#FFD23F",
  },
  {
    name: "The Hot Seat",
    teaser: "One person takes the hot seat. Everyone else guesses what they would pick. Find out who really knows you.",
    Character: Sweaty,
    panel: "#FFD23F",
  },
  {
    name: "Fingers on the Buzzers",
    teaser: "The quiz master reads. You buzz. Try to be faster than Grandad.",
    Character: Slammer,
    panel: "#2BD67B",
  },
  {
    name: "The quiz",
    teaser: "A quiz that suits every age, from seven to seventy.",
    Character: KnowItAll,
    panel: "#FF5C93",
  },
];

function Tag({ children, dashed }: { children: React.ReactNode; dashed?: boolean }) {
  return (
    <span
      className={`inline-block rounded-md border-[3px] px-2.5 py-0.5 text-sm font-bold uppercase tracking-wider ${dashed ? "border-dashed bg-white" : "bg-[#FFD23F]"}`}
      style={{ borderColor: INK }}
    >
      {children}
    </span>
  );
}

function Wordmark({ size = "text-3xl" }: { size?: string }) {
  return <span className={`${display.className} ${size} leading-none`}>Asher Games</span>;
}

export default function ComingSoon() {
  return (
    <div className={`${reading.className} flex flex-1 flex-col bg-[#FFF1CF] text-[#111111]`}>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 pt-6">
        <Wordmark />
        <Tag>Coming soon</Tag>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-5 pb-16 pt-8">
        <section className="grid items-center gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h1 className={`${display.className} text-[2.6rem] leading-[1.05] sm:text-6xl`}>
              The game where putting your phone down means losing
            </h1>
            <p className="text-xl leading-snug">Secret words, fibbing, buzzers and a quiz for every age. Coming soon.</p>
            <a
              href="#games"
              className="mt-1 inline-flex h-14 w-fit items-center rounded-md border-4 bg-[#FFD23F] px-6 text-lg font-bold shadow-[4px_4px_0_#111111] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
              style={{ borderColor: INK }}
            >
              See what is coming
            </a>
          </div>
          <div className="rounded-xl border-4 bg-[#2F6BFF] p-4 shadow-[6px_6px_0_#111111] sm:p-6" style={{ borderColor: INK }}>
            <HouseTrio className="block h-auto w-full" />
          </div>
        </section>

        <section id="games" className="flex scroll-mt-6 flex-col gap-6">
          <h2 className={`${display.className} text-4xl leading-tight sm:text-5xl`}>Five games to get loud with</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map(({ name, teaser, Character, panel }) => (
              <li
                key={name}
                className="flex flex-col overflow-hidden rounded-xl border-4 bg-white shadow-[4px_4px_0_#111111]"
                style={{ borderColor: INK }}
              >
                <div className="flex h-44 items-center justify-center border-b-4" style={{ background: panel, borderColor: INK }}>
                  <Character className="h-40 w-auto" />
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className={`${display.className} text-2xl leading-tight`}>{name}</h3>
                  <p className="flex-1 text-lg leading-snug">{teaser}</p>
                  <div>
                    <Tag>Coming soon</Tag>
                  </div>
                </div>
              </li>
            ))}
            <li className="flex flex-col overflow-hidden rounded-xl border-4 border-dashed" style={{ borderColor: INK }}>
              <div className="flex h-44 items-center justify-center border-b-4 border-dashed" style={{ borderColor: INK }}>
                <Sneak className="h-40 w-auto" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <h3 className={`${display.className} text-2xl leading-tight`}>Secret missions</h3>
                <p className="flex-1 text-lg leading-snug">Secret tasks to pull off all week without getting caught.</p>
                <div>
                  <Tag dashed>Coming later</Tag>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </main>

      <footer className="mt-auto border-t-4 py-8" style={{ borderColor: INK }}>
        <div className="mx-auto w-full max-w-5xl px-5">
          <Wordmark size="text-2xl" />
        </div>
      </footer>
    </div>
  );
}
