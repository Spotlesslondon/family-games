"use client";

// Detective evidence drawn as the thing it is (Joshua, 21 Nov 18:41: "Photos
// need to be real photos. CCTV the same... If it is a phone message, show it on
// a phone with all the required details like time"). Drawn here from the
// case's facts, so every picture matches its clue exactly; nothing is loaded
// from anywhere. Characters and places are invented.

import type { CctvSpot, Exhibit, ItemKey } from "@/games/detective/shape";

const CLOTH: Record<string, string> = { red: "#c8382f", green: "#3f9a4a", blue: "#3462c4", yellow: "#e8c13a", purple: "#7b4bb8", orange: "#e57a2a" };

/** "5:18" on a clock that reads like the device: 5:18 PM, or seconds for a camera. */
const pm = (t: string, seconds?: number) => `${t}${seconds !== undefined ? `:${String(seconds).padStart(2, "0")}` : ""} PM`;
const secs = (t: string) => (t.split(":").reduce((a, b) => a * 7 + Number(b), 3) % 50) + 4;

export function ExhibitView({ x }: { x: Exhibit }) {
  switch (x.kind) {
    case "cctv":
      return <CctvStill x={x} />;
    case "photo":
      return <PhotoPrint x={x} />;
    case "chat":
      return <PhoneChat x={x} />;
    case "lock":
      return <LockApp x={x} />;
    case "bag":
      return <EvidenceBag x={x} />;
  }
}

// ---- people ------------------------------------------------------------------
// Each invented family member has a fixed look, so a camera still can be read
// by the table. Names are tagged on the footage as well.

interface Look {
  skin: string;
  hair: string;
  style: "short" | "long" | "bun" | "bald" | "pony" | "curly";
  beard?: boolean;
  glasses?: boolean;
  child?: boolean;
}
const LOOKS: Record<string, Look> = {
  "Uncle Bob": { skin: "#e8b48f", hair: "#5a3a22", style: "short", beard: true },
  "Auntie May": { skin: "#f1c6a5", hair: "#8a4b2a", style: "long" },
  "Cousin Pip": { skin: "#c98d63", hair: "#2b1d14", style: "curly", child: true },
  "Grandpa Joe": { skin: "#efc3a2", hair: "#d8d8d8", style: "bald", glasses: true },
  "Nana Rose": { skin: "#e6b08e", hair: "#cfcfd6", style: "bun", glasses: true },
  "Cousin Kit": { skin: "#f2cfb0", hair: "#d9a441", style: "short", child: true },
  "Auntie Jen": { skin: "#8d5a3b", hair: "#1e1410", style: "pony" },
  "Uncle Raj": { skin: "#a8714f", hair: "#1b1512", style: "short", glasses: true },
  // Murder at Ashworth Hall's guests.
  "Major Ashby": { skin: "#eab493", hair: "#bdbdbd", style: "short", beard: true },
  "Dr Penrose": { skin: "#f0c7a6", hair: "#3b2a1e", style: "bun", glasses: true },
  "Lady Vane": { skin: "#f3cdb2", hair: "#c9a050", style: "long" },
  "Chef Rossi": { skin: "#d6a07a", hair: "#2a1c14", style: "curly" },
  "Miss Lark": { skin: "#9a6646", hair: "#140e0a", style: "pony", glasses: true },
  "Mr Finch": { skin: "#e2ae8a", hair: "#6b4a2a", style: "short" },
  "Professor Quill": { skin: "#f1c9ab", hair: "#e4e4e4", style: "bald", glasses: true, beard: true },
  "Madame Orla": { skin: "#b57a55", hair: "#5a1e2e", style: "long" },
};

/** A person standing, about 120 units tall (children 92). Facing the camera, or back turned. */
export function Person({ name, colour, clothes, x, y, scale = 1, back = false }: { name: string; colour: string; clothes: string; x: number; y: number; scale?: number; back?: boolean }) {
  const look = LOOKS[name] ?? { skin: "#e0b08a", hair: "#3a2a1a", style: "short" as const };
  const k = scale * (look.child ? 0.78 : 1);
  const c = CLOTH[colour] ?? colour;
  const top = clothes === "jumper" ? c : clothes === "cardigan" ? "#e9e6df" : "#5d6470";
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {/* legs and shoes */}
      <rect x={-13} y={-48} width={11} height={46} rx={4} fill="#2f3a4f" />
      <rect x={2} y={-48} width={11} height={46} rx={4} fill="#2f3a4f" />
      <ellipse cx={-8} cy={-2} rx={9} ry={4} fill="#1d1d1d" />
      <ellipse cx={8} cy={-2} rx={9} ry={4} fill="#1d1d1d" />
      {/* body */}
      <path d="M-22 -50 Q-24 -88 -14 -94 L14 -94 Q24 -88 22 -50 Z" fill={top} />
      {clothes === "cardigan" && (
        <>
          <path d="M-22 -50 Q-24 -88 -14 -94 L-3 -94 L-5 -50 Z" fill={c} />
          <path d="M22 -50 Q24 -88 14 -94 L3 -94 L5 -50 Z" fill={c} />
        </>
      )}
      {/* shade on the side away from the light, and a fold at the waist */}
      <path d="M2 -94 L14 -94 Q24 -88 22 -50 L4 -50 Z" fill="#000" opacity={0.16} />
      <path d="M-20 -60 Q0 -55 20 -60" stroke="#000" strokeOpacity={0.18} strokeWidth={2} fill="none" />
      <rect x={2} y={-48} width={11} height={46} rx={4} fill="#000" opacity={0.18} />
      {/* arms */}
      <rect x={-30} y={-92} width={9} height={40} rx={4.5} fill={clothes === "jumper" || clothes === "cardigan" ? c : top} />
      <rect x={21} y={-92} width={9} height={40} rx={4.5} fill={clothes === "jumper" || clothes === "cardigan" ? c : top} />
      <circle cx={-25.5} cy={-50} r={5} fill={look.skin} />
      <circle cx={25.5} cy={-50} r={5} fill={look.skin} />
      {/* head */}
      <rect x={-5} y={-102} width={10} height={9} fill={look.skin} />
      <circle cx={0} cy={-114} r={15} fill={look.skin} />
      <path d="M3 -128 A15 15 0 0 1 3 -100 A13 15 0 0 0 3 -128Z" fill="#000" opacity={0.12} />
      {/* from behind, the back of the head is hair */}
      {back && look.style !== "bald" && <circle cx={0} cy={-115} r={15.5} fill={look.hair} />}
      <Hair look={look} back={back} />
      {!back && (
        <>
          <circle cx={-5} cy={-115} r={1.8} fill="#1d1d1d" />
          <circle cx={5} cy={-115} r={1.8} fill="#1d1d1d" />
          <path d="M-5 -107 Q0 -104 5 -107" stroke="#7a3d2a" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          {look.glasses && (
            <g stroke="#222" strokeWidth={1.4} fill="none">
              <circle cx={-5.5} cy={-115} r={4.2} />
              <circle cx={5.5} cy={-115} r={4.2} />
              <path d="M-1.3 -115 H1.3" />
            </g>
          )}
          {look.beard && <path d="M-12 -112 Q-12 -96 0 -95 Q12 -96 12 -112 Q8 -104 0 -104 Q-8 -104 -12 -112Z" fill={look.hair} />}
        </>
      )}
      {clothes === "scarf" && (
        <>
          <rect x={-15} y={-98} width={30} height={9} rx={4} fill={c} />
          <rect x={4} y={-92} width={8} height={24} rx={3} fill={c} />
        </>
      )}
      {clothes === "hat" && (
        <>
          <path d="M-16 -118 Q-16 -136 0 -137 Q16 -136 16 -118 Z" fill={c} />
          <rect x={-17} y={-121} width={34} height={6} rx={3} fill={c} filter="brightness(0.9)" />
          <circle cx={0} cy={-139} r={5} fill={c} />
        </>
      )}
    </g>
  );
}

function Hair({ look, back }: { look: Look; back: boolean }) {
  const h = look.hair;
  switch (look.style) {
    case "bald":
      return <path d="M-15 -114 Q-16 -104 -12 -100 M15 -114 Q16 -104 12 -100" stroke={h} strokeWidth={4} fill="none" />;
    case "long":
      return <path d={back ? "M-16 -116 Q-17 -132 0 -131 Q17 -132 16 -116 L17 -84 L-17 -84 Z" : "M-16 -112 Q-17 -132 0 -131 Q17 -132 16 -112 L17 -86 L11 -86 L11 -116 Q0 -124 -11 -116 L-11 -86 L-17 -86 Z"} fill={h} />;
    case "bun":
      return (
        <>
          <path d="M-15 -114 Q-15 -131 0 -130 Q15 -131 15 -114 Q8 -124 0 -123 Q-8 -124 -15 -114Z" fill={h} />
          <circle cx={0} cy={-133} r={7} fill={h} />
        </>
      );
    case "pony":
      return (
        <>
          <path d="M-15 -113 Q-15 -131 0 -130 Q15 -131 15 -113 Q8 -123 0 -122 Q-8 -123 -15 -113Z" fill={h} />
          <path d="M12 -124 Q26 -118 20 -98" stroke={h} strokeWidth={7} fill="none" strokeLinecap="round" />
        </>
      );
    case "curly":
      return (
        <g fill={h}>
          {[-12, -6, 0, 6, 12].map((dx) => (
            <circle key={dx} cx={dx} cy={-127 + Math.abs(dx) / 3} r={6} />
          ))}
          <circle cx={-14} cy={-118} r={5} />
          <circle cx={14} cy={-118} r={5} />
        </g>
      );
    default:
      return <path d={back ? "M-15 -110 Q-15 -131 0 -130 Q15 -131 15 -110 Z" : "M-15 -113 Q-15 -131 0 -130 Q15 -131 15 -113 Q8 -122 0 -121 Q-8 -122 -15 -113Z"} fill={h} />;
  }
}

// ---- CCTV ------------------------------------------------------------------

/** Camera softness, grain, scan lines, a dark edge and lens glare, shared by every still. */
function CameraFilters({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`grain-${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={2} seed={11} result="n" />
        <feColorMatrix in="n" type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.2" />
        </feComponentTransfer>
      </filter>
      <filter id={`soft-${id}`}>
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
      <filter id={`shadow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id={`wall-${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves={3} seed={3} result="t" />
        <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 0.09 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={`wood-${id}`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.45" numOctaves={3} seed={5} result="t" />
        <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0.35 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={`wash-${id}`}>
        <feColorMatrix type="matrix" values="0.92 0.06 0.02 0 0.02  0.04 0.94 0.02 0 0.03  0.03 0.06 0.86 0 0.04  0 0 0 1 0" />
      </filter>
      <radialGradient id={`vig-${id}`} cx="50%" cy="48%" r="72%">
        <stop offset="55%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.6" />
      </radialGradient>
      <radialGradient id={`pool-${id}`} cx="50%" cy="10%" r="90%">
        <stop offset="0%" stopColor="#fff7dc" stopOpacity="0.55" />
        <stop offset="60%" stopColor="#fff7dc" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
      </radialGradient>
      <radialGradient id={`glare-${id}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fffbea" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#fffbea" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`lwall-${id}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#b9b09d" />
        <stop offset="1" stopColor="#d6cfbf" />
      </linearGradient>
      <linearGradient id={`rwall-${id}`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0" stopColor="#b3aa96" />
        <stop offset="1" stopColor="#d2cab9" />
      </linearGradient>
      <linearGradient id={`floor-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8c6d4f" />
        <stop offset="1" stopColor="#5e4632" />
      </linearGradient>
      <linearGradient id={`door-${id}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#6e4f33" />
        <stop offset="1" stopColor="#8a6644" />
      </linearGradient>
      <pattern id={`scan-${id}`} width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="1" fill="#000" opacity="0.1" />
      </pattern>
    </defs>
  );
}

/** Where a person stands in the hall for each spot, and which door is open. */
const SPOT: Record<CctvSpot, { x: number; y: number; s: number }> = {
  hall: { x: 0, y: 330, s: 1.05 },
  room: { x: 120, y: 262, s: 0.95 },
  "back door": { x: 320, y: 214, s: 0.68 },
  garage: { x: 505, y: 262, s: 0.95 },
  stairs: { x: 405, y: 236, s: 0.72 },
};

/** The hall, furnished and lit, as the camera in the corner sees it. */
function Hall({ id, room, open }: { id: string; room: string; open: CctvSpot }) {
  return (
    <g>
      <rect width="640" height="360" fill="#2b2620" />
      {/* ceiling */}
      <polygon points="0,0 230,95 410,95 640,0" fill="#e2dccd" />
      <polygon points="0,0 230,95 410,95 640,0" fill="#000" opacity="0.08" />
      {/* side walls with texture, back wall */}
      <polygon points="0,0 230,95 230,240 0,360" fill={`url(#lwall-${id})`} />
      <polygon points="640,0 410,95 410,240 640,360" fill={`url(#rwall-${id})`} />
      <polygon points="230,95 410,95 410,240 230,240" fill="#ddd5c4" />
      <rect width="640" height="360" filter={`url(#wall-${id})`} opacity="0.9" />
      {/* floorboards with grain, darker towards the camera */}
      <polygon points="0,360 230,240 410,240 640,360" fill={`url(#floor-${id})`} />
      <g clipPath={`url(#fl-${id})`}>
        <clipPath id={`fl-${id}`}>
          <polygon points="0,360 230,240 410,240 640,360" />
        </clipPath>
        {Array.from({ length: 13 }, (_, i) => (
          <line key={i} x1={230 + i * 15} y1={240} x2={-160 + i * 80} y2={360} stroke="#4a3626" strokeWidth={1.2} opacity={0.7} />
        ))}
        <rect width="640" height="360" filter={`url(#wood-${id})`} />
        {/* a runner rug down the middle */}
        <polygon points="285,240 355,240 420,360 220,360" fill="#7a2f2f" opacity="0.85" />
        <polygon points="291,244 349,244 408,356 232,356" fill="none" stroke="#c9a45a" strokeWidth={2} opacity="0.7" />
      </g>
      {/* skirting boards */}
      <polygon points="0,352 230,236 230,240 0,360" fill="#efe9dc" />
      <polygon points="640,352 410,236 410,240 640,360" fill="#e8e1d2" />
      <rect x="230" y="236" width="180" height="4" fill="#efe9dc" />
      {/* back door: frame, panels, window, handle; open shows daylight */}
      <rect x="279" y="114" width="82" height="126" fill="#f1ece0" />
      {open === "back door" ? (
        <>
          <rect x="285" y="120" width="70" height="120" fill="#bcd6ec" />
          <rect x="285" y="200" width="70" height="40" fill="#7fae6a" />
          <polygon points="285,120 258,110 258,250 285,240" fill={`url(#door-${id})`} />
        </>
      ) : (
        <>
          <rect x="285" y="120" width="70" height="120" fill={`url(#door-${id})`} />
          <rect x="297" y="130" width="46" height="36" fill="#bcd6ec" stroke="#4d3826" strokeWidth={2} />
          <line x1="320" y1="130" x2="320" y2="166" stroke="#4d3826" strokeWidth={1.5} />
          <rect x="295" y="176" width="22" height="54" rx="2" fill="none" stroke="#5a3f28" strokeWidth={1.5} />
          <rect x="323" y="176" width="22" height="54" rx="2" fill="none" stroke="#5a3f28" strokeWidth={1.5} />
          <circle cx="346" cy="182" r="2.6" fill="#d4b14a" />
        </>
      )}
      <text x="320" y="110" textAnchor="middle" fontSize="9" fill="#6a5a48" fontFamily="Arial, sans-serif">BACK DOOR</text>
      {/* the room door on the left wall */}
      <polygon points="64,112 176,137 176,272 64,306" fill="#f1ece0" />
      {open === "room" ? (
        <>
          <polygon points="70,118 170,140 170,268 70,300" fill="#f3e2b4" />
          <polygon points="70,118 170,140 170,268 70,300" fill="#000" opacity="0.15" />
          <polygon points="70,118 40,126 40,312 70,300" fill={`url(#door-${id})`} />
        </>
      ) : (
        <>
          <polygon points="70,118 170,140 170,268 70,300" fill={`url(#door-${id})`} />
          <polygon points="82,138 120,147 120,196 82,190" fill="none" stroke="#5a3f28" strokeWidth={1.5} />
          <polygon points="128,149 160,156 160,201 128,197" fill="none" stroke="#5a3f28" strokeWidth={1.5} />
          <circle cx="160" cy="214" r="3" fill="#d4b14a" />
        </>
      )}
      <rect x="70" y="92" width="104" height="18" rx="3" fill="#f6f1e4" stroke="#6b5a48" strokeWidth={1.5} />
      <text x="122" y="105" textAnchor="middle" fontSize="11" fill="#3b3128" fontFamily="Arial, sans-serif" fontWeight="bold">{room.toUpperCase()}</text>
      {/* the garage door on the right wall: plain metal */}
      <polygon points="576,112 464,137 464,272 576,306" fill="#e8e1d2" />
      <polygon points="570,118 470,140 470,268 570,300" fill={open === "garage" ? "#4a4d50" : "#7b8086"} />
      {open !== "garage" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={570} y1={150 + i * 38} x2={470} y2={166 + i * 27} stroke="#5f6469" strokeWidth={1.5} />
          ))}
          <rect x="478" y="200" width="8" height="18" rx="2" fill="#2b2d30" />
        </>
      )}
      <rect x="474" y="92" width="96" height="18" rx="3" fill="#f6f1e4" stroke="#6b5a48" strokeWidth={1.5} />
      <text x="522" y="105" textAnchor="middle" fontSize="11" fill="#3b3128" fontFamily="Arial, sans-serif" fontWeight="bold">GARAGE</text>
      {/* the stairs going up beside the back wall, with a banister */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <polygon points={`${398 - i * 4},${240 - i * 18} ${440 - i * 4},${240 - i * 18} ${440 - i * 4},${223 - i * 18} ${398 - i * 4},${223 - i * 18}`} fill="#9a7b5c" />
          <rect x={398 - i * 4} y={221 - i * 18} width="42" height="3" fill="#c7a984" />
        </g>
      ))}
      <line x1="444" y1="238" x2="414" y2="108" stroke="#4a3424" strokeWidth={4} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={442 - i * 4.6} y1={232 - i * 20} x2={442 - i * 4.6} y2={212 - i * 20} stroke="#5d4430" strokeWidth={1.6} />
      ))}
      {/* a radiator, a coat hook with coats, a picture */}
      <polygon points="190,206 222,214 222,236 190,234" fill="#f3f1ec" stroke="#cfcac0" strokeWidth={1} />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={194 + i * 6} y1={208 + i * 1.6} x2={194 + i * 6} y2={234} stroke="#cfcac0" strokeWidth={1} />
      ))}
      <rect x="196" y="140" width="22" height="3" fill="#4a3424" transform="skewY(14)" />
      <path d="M200 192 q-6 26 2 40 l10 -2 q4 -18 -2 -36z" fill="#3c4a5c" />
      <path d="M210 194 q-4 24 4 36 l9 -1 q2 -18 -4 -33z" fill="#8a3b33" />
      <polygon points="440,130 462,124 462,150 440,154" fill="#efe6cf" stroke="#6b5a48" strokeWidth={2} />
      <polygon points="444,134 458,130 458,146 444,149" fill="#7fa7c8" />
      {/* the ceiling light and the pool of light it throws */}
      <ellipse cx="320" cy="42" rx="34" ry="7" fill="#fffbe8" />
      <ellipse cx="320" cy="42" rx="80" ry="30" fill={`url(#glare-${id})`} opacity="0.6" />
      <rect width="640" height="360" fill={`url(#pool-${id})`} />
    </g>
  );
}

function CctvStill({ x }: { x: Extract<Exhibit, { kind: "cctv" }> }) {
  const id = `${x.time.replace(":", "")}${x.spot.replace(" ", "")}${x.people[0]?.name.replace(" ", "") ?? ""}`;
  const at = SPOT[x.spot];
  const back = x.spot === "room" ? x.action === "in" : x.action === "out";
  const placed =
    x.people.length === 1
      ? [{ p: x.people[0], px: at.x, py: at.y, ps: at.s }]
      : x.people.map((p, i) => ({ p, px: 130 + (i * 380) / Math.max(1, x.people.length - 1), py: 330, ps: 0.95 }));
  return (
    <figure className="overflow-hidden rounded-xl border-[3px] border-ink bg-black shadow-[4px_4px_0_#111]">
      <svg viewBox="0 0 640 360" className="block w-full" role="img" aria-label={`Camera still, ${pm(x.time)}, hall camera: ${x.people.map((p) => p.name).join(", ")}`}>
        <CameraFilters id={id} />
        <g filter={`url(#wash-${id})`}>
          <g filter={`url(#soft-${id})`}>
            <Hall id={id} room={x.room} open={x.spot} />
            {/* soft shadows on the floor, then the people, lit from above */}
            {placed.map(({ p, px, py, ps }) => (
              <ellipse key={`s-${p.name}`} cx={px + 6 * ps} cy={py + 2} rx={30 * ps} ry={8 * ps} fill="#000" opacity="0.45" filter={`url(#shadow-${id})`} />
            ))}
            {placed.map(({ p, px, py, ps }) => (
              <Person key={p.name} {...p} x={px} y={py} scale={ps} back={back && x.people.length === 1} />
            ))}
          </g>
        </g>
        {/* face tags, as the camera software draws them */}
        {placed.map(({ p, px, py, ps }) => {
          // One person: the tag sits under their feet, clear of the door signs. A group: above their heads.
          const ty = placed.length === 1 ? py + 4 : py - 150 * ps - 18;
          return (
            <g key={`t-${p.name}`}>
              <rect x={px - 32 * ps} y={py - 150 * ps} width={64 * ps} height={152 * ps} fill="none" stroke="#9bff8a" strokeWidth={1.2} opacity={0.7} />
              <rect x={px - 52} y={ty} width={104} height={18} fill="#0a0a0a" opacity={0.75} />
              <text x={px} y={ty + 13} textAnchor="middle" fontSize="12" fill="#9bff8a" fontFamily="'Courier New', monospace" fontWeight="bold">
                {p.name.toUpperCase()}
              </text>
            </g>
          );
        })}
        <rect width="640" height="360" fill={`url(#scan-${id})`} />
        <rect width="640" height="360" filter={`url(#grain-${id})`} />
        <rect width="640" height="360" fill={`url(#vig-${id})`} />
        {/* the camera's own overlay, on dark bands so it reads against a light hall */}
        <rect x="8" y="8" width="176" height="28" fill="#000" opacity={0.55} />
        <rect x="8" y="327" width="150" height="25" fill="#000" opacity={0.55} />
        <rect x="574" y="8" width="58" height="28" fill="#000" opacity={0.55} />
        <text x="16" y="28" fontSize="18" fill="#ffffff" fontFamily="'Courier New', monospace" fontWeight="bold" stroke="#000" strokeWidth={0.6}>
          {pm(x.time, x.spot === "hall" ? 0 : secs(x.time))}
        </text>
        <text x="16" y="345" fontSize="15" fill="#ffffff" fontFamily="'Courier New', monospace" fontWeight="bold" stroke="#000" strokeWidth={0.5}>
          CAM 01  HALL
        </text>
        <circle cx="586" cy="22" r="7" fill="#ff2b2b" />
        <text x="598" y="28" fontSize="16" fill="#ffffff" fontFamily="'Courier New', monospace" fontWeight="bold">REC</text>
      </svg>
    </figure>
  );
}

// ---- photos ------------------------------------------------------------------

function PhotoPrint({ x }: { x: Extract<Exhibit, { kind: "photo" }> }) {
  const tilt = x.present ? -2 : 1.5;
  return (
    <figure className="mx-auto w-[88%] bg-white p-3 pb-9 shadow-[4px_5px_0_#111,0_8px_18px_rgba(0,0,0,0.25)]" style={{ transform: `rotate(${tilt}deg)` }}>
      <svg viewBox="0 0 400 300" className="block w-full" role="img" aria-label={`Photo at ${pm(x.time)}: ${x.present ? `the ${x.itemName} on the ${x.spot}` : `the ${x.spot}, empty`}`}>
        <defs>
          <linearGradient id={`light-${x.time}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff6dd" stopOpacity="0.5" />
            <stop offset="1" stopColor="#000" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <Scene item={x.item} present={x.present} />
        <rect width="400" height="300" fill={`url(#light-${x.time})`} />
        <text x="388" y="288" textAnchor="end" fontSize="20" fill="#ff8a1f" fontFamily="'Courier New', monospace" fontWeight="bold" opacity={0.92}>
          {pm(x.time)}
        </text>
      </svg>
    </figure>
  );
}

/** The spot each thing sits on, with the thing there or gone. */
function Scene({ item, present }: { item: ItemKey; present: boolean }) {
  switch (item) {
    case "cake":
      return (
        <g>
          <rect width="400" height="300" fill="#eef3f4" />
          {Array.from({ length: 8 }, (_, i) => Array.from({ length: 5 }, (_, j) => <rect key={`${i}${j}`} x={i * 50} y={j * 34} width={48} height={32} fill="#f9fbfb" stroke="#d3dcde" />))}
          <rect x="0" y="170" width="400" height="22" fill="#5e6a72" />
          <rect x="0" y="192" width="400" height="108" fill="#c8a57e" />
          <rect x="20" y="210" width="110" height="80" fill="#b8936b" stroke="#8f6e4f" strokeWidth={2} />
          <rect x="145" y="210" width="110" height="80" fill="#b8936b" stroke="#8f6e4f" strokeWidth={2} />
          <rect x="270" y="210" width="110" height="80" fill="#b8936b" stroke="#8f6e4f" strokeWidth={2} />
          <ellipse cx="200" cy="170" rx="70" ry="10" fill="#dfe4e6" />
          {present && (
            <g>
              <rect x="150" y="112" width="100" height="56" rx="6" fill="#f7e1c8" />
              <rect x="150" y="112" width="100" height="16" rx="6" fill="#ffffff" />
              <path d="M150 126 Q160 138 170 126 Q180 138 190 126 Q200 138 210 126 Q220 138 230 126 Q240 138 250 126" fill="#ffffff" />
              {[165, 185, 200, 215, 235].map((cx) => (
                <g key={cx}>
                  <rect x={cx - 2} y="92" width="4" height="20" fill={cx % 2 ? "#ff7aa8" : "#7ab6ff"} />
                  <ellipse cx={cx} cy="88" rx="3" ry="5" fill="#ffb43a" />
                </g>
              ))}
            </g>
          )}
        </g>
      );
    case "trophy":
      return (
        <g>
          <rect width="400" height="300" fill="#dbe6d6" />
          <rect x="40" y="40" width="320" height="200" fill="#a77b52" />
          <rect x="52" y="52" width="296" height="80" fill="#c9a37a" />
          <rect x="52" y="148" width="296" height="80" fill="#c9a37a" />
          <rect x="40" y="132" width="320" height="16" fill="#8d6440" />
          <rect x="70" y="80" width="22" height="52" fill="#3f6fb0" />
          <rect x="94" y="88" width="18" height="44" fill="#b04a3f" />
          <rect x="300" y="90" width="30" height="42" fill="#d6d1c4" />
          {present ? (
            <g>
              <path d="M180 74 H220 Q222 104 200 108 Q178 104 180 74Z" fill="#e3b72c" stroke="#a07a10" strokeWidth={2} />
              <path d="M180 80 Q166 82 170 94 Q174 100 182 98 M220 80 Q234 82 230 94 Q226 100 218 98" stroke="#c99a1c" strokeWidth={4} fill="none" />
              <rect x="196" y="108" width="8" height="12" fill="#c99a1c" />
              <rect x="184" y="120" width="32" height="12" fill="#3b2b1c" />
            </g>
          ) : (
            <rect x="182" y="126" width="36" height="6" fill="#b58f68" opacity={0.6} />
          )}
          <rect x="70" y="180" width="60" height="48" fill="#6e8f5a" />
        </g>
      );
    case "jar":
      return (
        <g>
          <rect width="400" height="300" fill="#f1e7d6" />
          <rect x="110" y="110" width="180" height="190" rx="10" fill="#f6f7f8" stroke="#b9bec2" strokeWidth={3} />
          <line x1="110" y1="190" x2="290" y2="190" stroke="#b9bec2" strokeWidth={3} />
          <rect x="268" y="128" width="8" height="46" rx="4" fill="#9aa0a5" />
          <rect x="268" y="206" width="8" height="60" rx="4" fill="#9aa0a5" />
          <rect x="30" y="160" width="70" height="140" fill="#c7aa82" />
          <rect x="300" y="160" width="70" height="140" fill="#c7aa82" />
          {present && (
            <g>
              <rect x="166" y="54" width="68" height="56" rx="12" fill="#e9f2f6" stroke="#9fb7c4" strokeWidth={3} opacity={0.95} />
              <rect x="172" y="44" width="56" height="14" rx="5" fill="#c0392b" />
              {[[182, 82], [200, 92], [216, 78], [190, 98], [212, 98]].map(([cx, cy]) => (
                <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={9} fill="#c08a4a" stroke="#8a5a2a" strokeWidth={1.5} />
              ))}
            </g>
          )}
        </g>
      );
    case "remote":
      return (
        <g>
          <rect width="400" height="300" fill="#e8e1d5" />
          <rect x="0" y="120" width="400" height="180" rx="30" fill="#5b6f8f" />
          <rect x="0" y="100" width="150" height="120" rx="36" fill="#6a7fa1" />
          <rect x="30" y="160" width="340" height="100" rx="20" fill="#7186a8" />
          <rect x="60" y="150" width="140" height="70" rx="16" fill="#8396b5" />
          {present && (
            <g transform="rotate(-12 80 140)">
              <rect x="40" y="128" width="96" height="24" rx="10" fill="#222" />
              {[60, 76, 92, 108].map((cx) => (
                <circle key={cx} cx={cx} cy={140} r={4} fill={cx === 60 ? "#e24b3b" : "#777"} />
              ))}
            </g>
          )}
        </g>
      );
    case "tin":
      return (
        <g>
          <rect width="400" height="300" fill="#efe4d3" />
          <rect x="0" y="0" width="400" height="120" fill="#e6d5bd" />
          <rect x="250" y="20" width="90" height="70" fill="#a9c8e8" stroke="#7a6048" strokeWidth={5} />
          <rect x="60" y="70" width="46" height="90" rx="8" fill="#6b4a2f" />
          <rect x="294" y="70" width="46" height="90" rx="8" fill="#6b4a2f" />
          <polygon points="40,150 360,150 400,250 0,250" fill="#a26c43" />
          <polygon points="0,250 400,250 400,266 0,266" fill="#7d4f2e" />
          <rect x="20" y="266" width="16" height="34" fill="#6b4425" />
          <rect x="364" y="266" width="16" height="34" fill="#6b4425" />
          <polygon points="150,150 250,150 268,250 132,250" fill="#e9dcc6" opacity={0.85} />
          {present && (
            <g>
              <ellipse cx="200" cy="214" rx="54" ry="14" fill="#5a1220" />
              <rect x="146" y="172" width="108" height="42" fill="#9e2236" />
              <ellipse cx="200" cy="172" rx="54" ry="14" fill="#c43a50" />
              <ellipse cx="200" cy="172" rx="32" ry="7" fill="#e8c35a" />
              <text x="200" y="202" textAnchor="middle" fontSize="12" fill="#f3d27a" fontFamily="Georgia, serif" fontWeight="bold">CHOCOLATES</text>
            </g>
          )}
        </g>
      );
    case "jigsaw":
      return (
        <g>
          <rect width="400" height="300" fill="#e3ecf4" />
          <rect x="30" y="60" width="340" height="230" fill="#f2d7a6" stroke="#b98d4f" strokeWidth={4} />
          <rect x="30" y="160" width="340" height="12" fill="#b98d4f" />
          <rect x="60" y="182" width="44" height="60" fill="#5aa0d8" />
          <rect x="110" y="196" width="40" height="46" fill="#e66e5a" />
          <circle cx="300" cy="226" r="20" fill="#f0c33c" />
          {present && (
            <g>
              <rect x="150" y="96" width="110" height="64" fill="#6c9be0" stroke="#2f4f7f" strokeWidth={3} />
              <path d="M166 118 h20 a6 6 0 1 1 10 0 h20 v14 a6 6 0 1 0 0 10 v12 h-50z" fill="#f0c33c" stroke="#a07a10" strokeWidth={1.5} />
              <text x="230" y="150" textAnchor="middle" fontSize="12" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold">500</text>
            </g>
          )}
        </g>
      );
  }
}

// ---- phones ------------------------------------------------------------------

function Phone({ clock, children, label }: { clock: string; children: React.ReactNode; label: string }) {
  return (
    <figure className="mx-auto w-[86%] rounded-[2.2rem] border-[3px] border-ink bg-[#111] p-2 shadow-[4px_5px_0_#111]" aria-label={label}>
      <div className="overflow-hidden rounded-[1.7rem] bg-white">
        <div className="flex items-center justify-between bg-[#f6f6f8] px-5 pb-1 pt-2 text-[13px] font-bold text-[#111]">
          <span>{clock}</span>
          <span className="h-4 w-20 rounded-full bg-[#111]" aria-hidden />
          <span className="flex items-center gap-1.5" aria-hidden>
            <svg viewBox="0 0 18 12" className="h-3 w-4">
              {[0, 1, 2, 3].map((i) => (
                <rect key={i} x={i * 4.5} y={9 - i * 3} width={3.2} height={3 + i * 3} rx={0.8} fill="#111" />
              ))}
            </svg>
            <svg viewBox="0 0 16 12" className="h-3 w-4">
              <path d="M1 4.5a10 10 0 0 1 14 0M3.5 7a6.5 6.5 0 0 1 9 0M6 9.5a3 3 0 0 1 4 0" stroke="#111" strokeWidth={1.8} fill="none" strokeLinecap="round" />
            </svg>
            <span className="flex items-center">
              <span className="flex h-3 w-6 items-center rounded-[3px] border-[1.5px] border-[#111] p-[1px]">
                <span className="h-full w-[64%] rounded-[1px] bg-[#111]" />
              </span>
              <span className="ml-[1px] h-1.5 w-[2px] rounded-r bg-[#111]" />
            </span>
          </span>
        </div>
        {children}
        <div className="flex justify-center bg-white pb-2 pt-1" aria-hidden>
          <span className="h-1 w-24 rounded-full bg-[#111]" />
        </div>
      </div>
    </figure>
  );
}

const SENDER_COLOUR = ["#c0392b", "#2c6fbb", "#1e8a4c", "#8e44ad", "#d35400"];

function PhoneChat({ x }: { x: Extract<Exhibit, { kind: "chat" }> }) {
  const senders = [...new Set(x.messages.map((m) => m.sender))];
  return (
    <Phone clock={x.clock} label={`A phone showing the ${x.title} group chat`}>
      <div className="flex items-center gap-2 border-b border-[#ddd] bg-[#f6f6f8] px-3 py-2">
        <span className="text-xl text-[#2c6fbb]" aria-hidden>‹</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2c6fbb] text-xs font-bold text-white" aria-hidden>
          FA
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold text-[#111]">{x.title}</span>
          <span className="text-[11px] text-[#777]">group chat</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 bg-[#e9e3da] px-3 py-3">
        <span className="self-center rounded-full bg-white/80 px-3 py-0.5 text-[11px] font-bold text-[#555]">Today</span>
        {x.messages.map((m, i) => (
          <div key={i} className="max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.15)]">
            <div className="text-[12px] font-bold" style={{ color: SENDER_COLOUR[senders.indexOf(m.sender) % SENDER_COLOUR.length] }}>
              {m.sender}
            </div>
            <div className="text-[15px] leading-snug text-[#111]">{m.text}</div>
            <div className="mt-0.5 text-right text-[11px] text-[#888]">{pm(m.time)}</div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

function LockApp({ x }: { x: Extract<Exhibit, { kind: "lock" }> }) {
  const rows = [
    { t: x.left, text: "Locked", sub: "Automatically, when the door closed" },
    { t: x.left, text: "Opened from inside", sub: `${x.who} left` },
    { t: x.opened, text: `Unlocked with ${x.who}'s key fob`, sub: "Key fob 2" },
  ];
  return (
    <Phone clock={x.clock} label={`A phone showing the garage lock app: unlocked with ${x.who}'s key fob at ${x.opened}, left at ${x.left}`}>
      <div className="bg-[#14202e] px-4 pb-4 pt-3 text-white">
        <div className="text-[12px] font-bold tracking-widest text-[#8fb3d9]">SMART LOCK</div>
        <div className="mt-1 flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden>
            <rect x="5" y="10" width="14" height="11" rx="2" fill="#4cd07d" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#4cd07d" strokeWidth={2.4} fill="none" />
          </svg>
          <div>
            <div className="text-xl font-bold">Garage door</div>
            <div className="text-[13px] text-[#4cd07d]">Locked</div>
          </div>
        </div>
        <div className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] text-[#c9d7e6]">This is the only door into the garage.</div>
      </div>
      <div className="bg-white px-4 py-2">
        <div className="pb-1 text-[12px] font-bold tracking-widest text-[#777]">ACTIVITY TODAY</div>
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-3 border-t border-[#eee] py-2">
            <span className="w-16 shrink-0 text-[13px] font-bold text-[#111]">{pm(r.t)}</span>
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] text-[#111]">{r.text}</span>
              <span className="text-[12px] text-[#888]">{r.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ---- forensics ---------------------------------------------------------------

function EvidenceBag({ x }: { x: Extract<Exhibit, { kind: "bag" }> }) {
  const c = CLOTH[x.colour] ?? x.colour;
  return (
    <figure className="mx-auto w-[92%]" aria-label={`Evidence bag: ${x.colour} wool thread from the ${x.spot}`}>
      <svg viewBox="0 0 400 300" className="block w-full drop-shadow-[4px_5px_0_#111]" role="img">
        <defs>
          <linearGradient id="bag" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="0.5" stopColor="#eef4f7" stopOpacity="0.7" />
            <stop offset="1" stopColor="#dfe8ee" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="400" height="300" fill="#6b5a48" rx="6" />
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x="0" y={i * 34} width="400" height="2" fill="#5d4d3c" />
        ))}
        <g transform="rotate(-3 200 150)">
          <rect x="40" y="26" width="320" height="250" rx="8" fill="url(#bag)" stroke="#b9c6cf" strokeWidth={2} />
          <rect x="40" y="26" width="320" height="22" fill="#d8e2e8" stroke="#b9c6cf" strokeWidth={2} />
          <rect x="40" y="48" width="320" height="10" fill="#c0392b" opacity={0.9} />
          <text x="200" y="56" textAnchor="middle" fontSize="8" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="2">
            EVIDENCE SEAL · DO NOT OPEN
          </text>
          {/* the thread */}
          <path d="M120 110 C150 80, 170 140, 200 110 S 250 90, 270 130 S 230 170, 250 180" stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M120 110 C150 80, 170 140, 200 110 S 250 90, 270 130 S 230 170, 250 180" stroke="#fff" strokeOpacity={0.35} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeDasharray="3 5" />
          {/* the label */}
          <rect x="62" y="186" width="276" height="76" fill="#fffdf4" stroke="#333" strokeWidth={1.5} />
          <text x="72" y="204" fontSize="13" fill="#111" fontFamily="'Courier New', monospace" fontWeight="bold">EVIDENCE  ITEM 1</text>
          <text x="72" y="222" fontSize="12" fill="#111" fontFamily="'Courier New', monospace">WHAT:  {x.colour.toUpperCase()} WOOL THREAD</text>
          <text x="72" y="238" fontSize="12" fill="#111" fontFamily="'Courier New', monospace">WHERE: {x.spot.toUpperCase().slice(0, 22)}</text>
          <text x="72" y="254" fontSize="12" fill="#111" fontFamily="'Courier New', monospace">ROOM:  {x.room.toUpperCase()}</text>
        </g>
      </svg>
      <p className="mt-3 rounded-xl border-2 border-dashed border-ink bg-[#fffdf4] px-3 py-2 font-mono text-[14px]">Also found: {x.mark}</p>
    </figure>
  );
}
