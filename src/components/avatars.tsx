// The six starter player characters (approved by Joshua, 2 Nov 2026, 00:33),
// drawn by the CEO seat in claude/avatars-v1.html and kept here as one shared
// component. Layers, back to front: limbs, body shadow, body, details, face,
// then an empty accessory slot at each character's head-top anchor, so a hat
// or glasses can be added later without redrawing anyone (mods, not built).
//
// A character is only ever one of these six keys: no photos, no uploads, no
// free text. The name is always shown with it on every screen.

import type { ReactNode } from "react";

import { AVATAR_KEYS, isAvatarKey, type AvatarKey } from "@/lib/avatars";

export { AVATAR_KEYS, isAvatarKey, type AvatarKey };

const INK = "#111";
const line = { fill: "none", stroke: INK, strokeWidth: 4.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Eye({ cx, cy, r, py }: { cx: number; cy: number; r: number; py: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth={4} />
      <circle cx={cx} cy={py} r={r * 0.45} fill={INK} />
    </>
  );
}

/** A body shape with its hard shadow: a black copy 4 down and 4 right, then the fill. */
function Body({ d, points, fill }: { d?: string; points?: string; fill: string }) {
  const common = { stroke: INK, strokeWidth: 4.5, strokeLinejoin: "round" as const };
  return d ? (
    <>
      <path d={d} fill={INK} transform="translate(4 4)" {...common} />
      <path d={d} fill={fill} {...common} />
    </>
  ) : (
    <>
      <polygon points={points} fill={INK} transform="translate(4 4)" {...common} />
      <polygon points={points} fill={fill} {...common} />
    </>
  );
}

interface Spec {
  name: string;
  colour: string;
  /** Head-top anchor for a future accessory. */
  anchor: [number, number];
  draw: () => ReactNode;
}

export const AVATARS: Record<AvatarKey, Spec> = {
  dome: {
    name: "Dome",
    colour: "#2F6BFF",
    anchor: [60, 26],
    draw: () => (
      <>
        <path d="M44 106 L42 120 L34 122 M76 106 L78 120 L86 122" {...line} />
        <path d="M24 80 L9 68 M96 80 L111 92" {...line} />
        <Body d="M24 106 C24 50 40 26 60 26 C80 26 96 50 96 106 Z" fill="#2F6BFF" />
        <path d="M55 27 L52 13 M63 27 L66 12" {...line} />
        <Eye cx={46} cy={62} r={8} py={64} />
        <Eye cx={74} cy={64} r={8} py={66} />
        <path d="M42 84 Q60 108 78 84 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      </>
    ),
  },
  brick: {
    name: "Brick",
    colour: "#FF3B3B",
    anchor: [60, 34],
    draw: () => (
      <>
        <path d="M44 102 L44 120 L36 122 M76 102 L76 120 L84 122" {...line} />
        <path d="M26 68 L11 80 M94 68 L109 56" {...line} />
        <Body d="M26 36 H94 V104 H26 Z" fill="#FF3B3B" />
        <path d="M38 50 L56 44 M64 44 L82 50" {...line} strokeWidth={5} />
        <Eye cx={48} cy={62} r={9} py={64} />
        <Eye cx={74} cy={62} r={7} py={64} />
        <path d="M40 84 H80 V92 Q60 104 40 92 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
        <path d="M60 86 V94" stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
      </>
    ),
  },
  pip: {
    name: "Pip",
    colour: "#2BD67B",
    anchor: [60, 18],
    draw: () => (
      <>
        <Body points="60.0,16.0 75.3,45.0 107.6,50.5 84.7,74.0 89.4,106.5 60.0,92.0 30.6,106.5 35.3,74.0 12.4,50.5 44.7,45.0" fill="#2BD67B" />
        <Eye cx={50} cy={64} r={7} py={66} />
        <Eye cx={70} cy={64} r={7} py={66} />
        <path d="M49 80 Q60 92 71 80" {...line} strokeWidth={4} />
      </>
    ),
  },
  puff: {
    name: "Puff",
    colour: "#FF5C93",
    anchor: [58, 40],
    draw: () => (
      <>
        <path d="M44 100 L44 118 L36 120 M76 100 L76 118 L84 120" {...line} />
        <Body d="M30 100 C10 100 10 68 34 68 C32 42 64 34 74 54 C92 40 114 62 98 80 C114 90 106 102 90 100 Z" fill="#FF5C93" />
        <Eye cx={46} cy={76} r={7} py={77} />
        <Eye cx={72} cy={76} r={7} py={77} />
        <ellipse cx={60} cy={91} rx={6} ry={5} fill="#fff" stroke={INK} strokeWidth={3.5} />
      </>
    ),
  },
  beam: {
    name: "Beam",
    colour: "#FFD23F",
    anchor: [60, 12],
    draw: () => (
      <>
        <path d="M50 108 L48 122 L40 124 M70 108 L72 122 L80 124" {...line} />
        <Body
          points="60.0,10.0 69.8,25.3 86.0,17.0 86.9,35.1 105.0,36.0 96.7,52.2 112.0,62.0 96.7,71.8 105.0,88.0 86.9,88.9 86.0,107.0 69.8,98.7 60.0,114.0 50.2,98.7 34.0,107.0 33.1,88.9 15.0,88.0 23.3,71.8 8.0,62.0 23.3,52.2 15.0,36.0 33.1,35.1 34.0,17.0 50.2,25.3"
          fill="#FFD23F"
        />
        <Eye cx={47} cy={58} r={7} py={59} />
        <Eye cx={73} cy={58} r={7} py={59} />
        <path d="M44 74 Q60 96 76 74 Z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      </>
    ),
  },
  egg: {
    name: "Egg",
    colour: "#FFFFFF",
    anchor: [60, 14],
    draw: () => (
      <>
        <path d="M46 118 L46 126 L38 127 M74 118 L74 126 L82 127" {...line} />
        <path d="M22 84 L8 72 M98 84 L112 96" {...line} />
        <Body d="M60 14 C84 14 98 58 98 84 C98 108 80 118 60 118 C40 118 22 108 22 84 C22 58 36 14 60 14 Z" fill="#FFFFFF" />
        <path d="M30 50 L40 42 L48 52 L58 40 L66 52 L76 42 L84 50" {...line} strokeWidth={4} />
        <Eye cx={46} cy={72} r={8} py={70} />
        <Eye cx={74} cy={72} r={8} py={70} />
        <path d="M48 96 Q54 90 60 96 T72 96" {...line} strokeWidth={4} />
      </>
    ),
  },
};

/**
 * One player's character. The accessible name says whose it is; the visible
 * name always sits beside it on screen (rule 4 of the gameplay look brief).
 */
export function PlayerAvatar({ avatar, className = "h-16 w-auto", label, wobble = false }: { avatar: AvatarKey; className?: string; label?: string; wobble?: boolean }) {
  const spec = AVATARS[avatar];
  return (
    <svg
      viewBox="0 0 120 130"
      className={`${className} ${wobble ? "avatar-wobble" : ""}`}
      role="img"
      aria-label={label ?? spec.name}
      xmlns="http://www.w3.org/2000/svg"
    >
      {spec.draw()}
      {/* Accessory slot for later mods, at the head-top anchor. Empty in version one. */}
      <g data-slot="accessory" transform={`translate(${spec.anchor[0]} ${spec.anchor[1]})`} />
    </svg>
  );
}
