// The paper-and-ink typefaces (coming-soon page now, the restyled app later), kept in this folder and served from our own
// domain. Nothing is fetched from Google, at build time or when a page loads,
// so no third party sees a family's phone and a font outage cannot break a
// deploy. All four are SIL Open Font License 1.1 (licences alongside), from
// the @fontsource packages, Latin subset (covers English, plus symbols like £).

import localFont from "next/font/local";

/** Paper-and-ink headings (look brief v1; recommended in tech-answers-look-brief). */
export const bagelFatOne = localFont({
  src: [{ path: "./bagel-fat-one-latin-400-normal.woff2", weight: "400" }],
  variable: "--font-bagel",
  display: "swap",
});

/** Paper-and-ink reading face: letters built not to be mistaken for each other. */
export const atkinsonNext = localFont({
  src: [
    { path: "./atkinson-hyperlegible-next-latin-400-normal.woff2", weight: "400" },
    { path: "./atkinson-hyperlegible-next-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-atkinson",
  display: "swap",
});
