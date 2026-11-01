// The app screens' typefaces (current look), kept in this folder and served from our own
// domain. Nothing is fetched from Google, at build time or when a page loads,
// so no third party sees a family's phone and a font outage cannot break a
// deploy. All four are SIL Open Font License 1.1 (licences alongside), from
// the @fontsource packages, Latin subset (covers English, plus symbols like £).

import localFont from "next/font/local";

/** The app screens' display face (current look). */
export const fredoka = localFont({
  src: [
    { path: "./fredoka-latin-500-normal.woff2", weight: "500" },
    { path: "./fredoka-latin-600-normal.woff2", weight: "600" },
    { path: "./fredoka-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-fredoka",
  display: "swap",
});

/** The app screens' reading face (current look). */
export const nunito = localFont({
  src: [
    { path: "./nunito-latin-400-normal.woff2", weight: "400" },
    { path: "./nunito-latin-600-normal.woff2", weight: "600" },
    { path: "./nunito-latin-700-normal.woff2", weight: "700" },
    { path: "./nunito-latin-800-normal.woff2", weight: "800" },
  ],
  variable: "--font-nunito",
  display: "swap",
});
