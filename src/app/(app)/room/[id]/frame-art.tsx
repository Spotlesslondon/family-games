"use client";

// Theme art for the frame game (Joshua, 22 Nov 09:12: "let the imagery and
// background also change slightly with the theme"). Original drawings in the
// paper-and-ink style: a light pattern behind the whole screen, a dusk tint at
// night, and an emblem by the titles. Background colours were contrast checked:
// ink 12.3:1 or better, muted text 6.4:1 or better, by day and at night.

import { useEffect } from "react";
import type { ThemeKey } from "@/games/murder/themes";

interface Look {
  day: string;
  night: string;
  ink: string;
  /** One tile of the pattern, drawn in `ink`. */
  tile: (ink: string) => string;
}

const svg = (w: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${w}' viewBox='0 0 ${w} ${w}'>${body}</svg>`)}")`;

const LOOKS: Record<ThemeKey, Look> = {
  // Old-house wallpaper: a diamond trellis with small four-petal flowers.
  manor: {
    day: "#f4e6cf",
    night: "#e3cdb6",
    ink: "#7a1010",
    tile: (c) =>
      svg(
        96,
        `<g fill='none' stroke='${c}' stroke-opacity='0.16' stroke-width='2'><path d='M48 0 L96 48 L48 96 L0 48 Z'/></g>` +
          `<g fill='${c}' fill-opacity='0.14'><circle cx='48' cy='40' r='5'/><circle cx='48' cy='56' r='5'/><circle cx='40' cy='48' r='5'/><circle cx='56' cy='48' r='5'/><circle cx='0' cy='0' r='4'/><circle cx='96' cy='0' r='4'/><circle cx='0' cy='96' r='4'/><circle cx='96' cy='96' r='4'/></g>`,
      ),
  },
  // A night sky: stars, crescent moons and specks.
  wizards: {
    day: "#ece6fb",
    night: "#d6cbf2",
    ink: "#3b1c6e",
    tile: (c) =>
      svg(
        120,
        `<g fill='${c}' fill-opacity='0.16'>` +
          `<path d='M24 10 l4 10 l10 1 l-8 7 l3 10 l-9 -6 l-9 6 l3 -10 l-8 -7 l10 -1 z'/>` +
          `<path d='M86 70 l3 7 l7 1 l-5 5 l2 7 l-7 -4 l-6 4 l2 -7 l-5 -5 l7 -1 z'/>` +
          `<path d='M92 18 a14 14 0 1 0 10 24 a11 11 0 1 1 -10 -24 z'/>` +
          `<path d='M30 78 a11 11 0 1 0 8 19 a9 9 0 1 1 -8 -19 z'/>` +
          `<circle cx='60' cy='40' r='2'/><circle cx='12' cy='60' r='2'/><circle cx='108' cy='104' r='2'/><circle cx='64' cy='108' r='2'/></g>`,
      ),
  },
  // Case-file graph paper with the odd fingerprint.
  fbi: {
    day: "#e4edf5",
    night: "#cfdbe7",
    ink: "#12324f",
    tile: (c) =>
      svg(
        120,
        `<g fill='none' stroke='${c}' stroke-opacity='0.10' stroke-width='1'><path d='M0 0 H120 M0 30 H120 M0 60 H120 M0 90 H120 M0 0 V120 M30 0 V120 M60 0 V120 M90 0 V120'/></g>` +
          `<g fill='none' stroke='${c}' stroke-opacity='0.18' stroke-width='2' stroke-linecap='round'>` +
          `<path d='M78 92 a12 15 0 0 1 24 0'/><path d='M82 94 a8 11 0 0 1 16 0'/><path d='M86 96 a4 7 0 0 1 8 0'/><path d='M74 92 a16 19 0 0 1 32 0'/></g>`,
      ),
  },
  // Camp banners: mountain ridges and small flames.
  warriors: {
    day: "#f5e4cb",
    night: "#e6cfae",
    ink: "#6b2a0a",
    tile: (c) =>
      svg(
        120,
        `<g fill='none' stroke='${c}' stroke-opacity='0.16' stroke-width='3' stroke-linejoin='round'><path d='M0 100 L20 80 L34 92 L56 66 L78 92 L94 78 L120 100'/></g>` +
          `<g fill='${c}' fill-opacity='0.14'><path d='M30 20 c8 8 8 16 0 22 c-8 -6 -8 -14 0 -22 z'/><path d='M92 30 c6 6 6 12 0 17 c-6 -5 -6 -11 0 -17 z'/></g>`,
      ),
  },
};

/** While the game is on screen, the whole page takes the theme's colour and pattern. */
export function useThemeBackdrop(theme: ThemeKey, night: boolean) {
  useEffect(() => {
    const look = LOOKS[theme] ?? LOOKS.manor;
    const root = document.documentElement;
    root.dataset.frameTheme = theme;
    root.style.setProperty("--frame-ground", night ? look.night : look.day);
    root.style.setProperty("--frame-pattern", look.tile(look.ink));
    return () => {
      delete root.dataset.frameTheme;
      root.style.removeProperty("--frame-ground");
      root.style.removeProperty("--frame-pattern");
    };
  }, [theme, night]);
}

/** A small badge for each theme, drawn in the paper-and-ink style. */
export function Emblem({ theme, size = 56 }: { theme: ThemeKey; size?: number }) {
  const look = LOOKS[theme] ?? LOOKS.manor;
  const ink = "#111111";
  const common = { width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": true, className: "shrink-0" } as const;
  if (theme === "wizards") {
    return (
      <svg {...common}>
        <circle cx="32" cy="32" r="29" fill={look.ink} stroke={ink} strokeWidth="4" />
        <path d="M38 14 a17 17 0 1 0 12 30 a13 13 0 1 1 -12 -30 z" fill="#ffd23f" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
        <path d="M22 16 l2.5 6 l6.5 0.5 l-5 4 l1.8 6.3 l-5.8 -3.6 l-5.8 3.6 l1.8 -6.3 l-5 -4 l6.5 -0.5 z" fill="#ffffff" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (theme === "fbi") {
    return (
      <svg {...common}>
        <circle cx="32" cy="32" r="29" fill={look.ink} stroke={ink} strokeWidth="4" />
        <circle cx="28" cy="28" r="12" fill="#ffffff" stroke={ink} strokeWidth="4" />
        <path d="M22 30 a6 7 0 0 1 12 0 M25 31 a3 4 0 0 1 6 0" fill="none" stroke={look.ink} strokeWidth="2" strokeLinecap="round" />
        <path d="M37 37 L48 48" stroke="#ffd23f" strokeWidth="7" strokeLinecap="round" />
        <path d="M37 37 L48 48" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === "warriors") {
    return (
      <svg {...common}>
        <circle cx="32" cy="32" r="29" fill={look.ink} stroke={ink} strokeWidth="4" />
        <path d="M16 46 L44 14 M48 46 L20 14" stroke="#e8e8e8" strokeWidth="5" strokeLinecap="round" />
        <path d="M16 46 L44 14 M48 46 L20 14" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="32" cy="38" r="11" fill="#ffd23f" stroke={ink} strokeWidth="3" />
        <circle cx="32" cy="38" r="3" fill={ink} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="32" cy="32" r="29" fill={look.ink} stroke={ink} strokeWidth="4" />
      <path d="M32 12 c6 6 6 12 0 16 c-6 -4 -6 -10 0 -16 z" fill="#ffd23f" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="27" y="28" width="10" height="16" rx="2" fill="#ffffff" stroke={ink} strokeWidth="3" />
      <path d="M20 48 h24 l-4 -4 h-16 z" fill="#ffd23f" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}
