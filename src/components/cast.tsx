// The Asher Games cast, as shared SVG components.
// Source: claude/cast-v1.html, drawn by the CEO seat, 1 Nov 2026. Original
// characters: outline #111, flat fills, no gradients. Approved by Joshua for
// the public page on 1 Nov 2026 (site-go-live.md). Change the art there first,
// then here, so the record and the code agree.

interface CastProps {
  className?: string;
  /** Hide from screen readers when the character sits beside text that already names it. */
  decorative?: boolean;
}

function a11y(label: string, decorative?: boolean) {
  return decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label };
}

export function HouseTrio({ className, decorative }: CastProps) {
  return (
    <svg viewBox="215 195 260 240" className={className} {...a11y('Three silly characters: a pink bean with spaghetti arms, a yellow triangle with its tongue out, and a green snake', decorative)}>
      <path d="M232 222 C252 202 272 242 292 222 S332 202 352 224 S392 242 412 220" fill="none" stroke="#111" strokeWidth="16" strokeLinecap="round"/>
      <path d="M232 222 C252 202 272 242 292 222 S332 202 352 224 S392 242 412 220" fill="none" stroke="#2BD67B" strokeWidth="8" strokeLinecap="round"/>
      <circle cx="420" cy="218" r="13" fill="#2BD67B" stroke="#111" strokeWidth="4"/>
      <circle cx="423" cy="215" r="4" fill="#fff" stroke="#111" strokeWidth="2"/>
      <path d="M432 222 L446 226 M432 222 L444 214" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round"/>
      <path d="M262 388 C236 352 246 294 290 284 C334 276 352 332 330 388 Z" fill="#FF5C93" stroke="#111" strokeWidth="5" strokeLinejoin="round"/>
      <path d="M262 330 C238 308 234 280 246 258" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <path d="M332 332 C356 310 360 280 350 258" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="246" cy="254" r="7" fill="#FF5C93" stroke="#111" strokeWidth="4"/>
      <circle cx="350" cy="254" r="7" fill="#FF5C93" stroke="#111" strokeWidth="4"/>
      <circle cx="292" cy="321" r="13" fill="#fff" stroke="#111" strokeWidth="4"/>
      <circle cx="296" cy="323" r="5" fill="#111"/>
      <path d="M272 352 Q296 380 320 352 Z" fill="#fff" stroke="#111" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M278 388 L270 418 L256 420 M318 388 L330 416 L344 418" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M412 302 L376 392 L446 392 Z" fill="#FFD23F" stroke="#111" strokeWidth="5" strokeLinejoin="round"/>
      <circle cx="402" cy="347" r="4.5" fill="#111"/>
      <circle cx="422" cy="347" r="4.5" fill="#111"/>
      <path d="M400 366 Q412 378 424 366" fill="none" stroke="#111" strokeWidth="3.5" strokeLinecap="round"/>
      <ellipse cx="416" cy="377" rx="5" ry="7" fill="#FF3B3B" stroke="#111" strokeWidth="2.5"/>
      <path d="M384 366 L364 342 L374 334 L354 312" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M440 366 L458 342" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <path d="M394 392 L390 424 M432 392 L440 420" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <path d="M412 286 L412 270 M388 294 L378 282 M436 294 L446 282 M240 360 L228 366 M228 338 L226 326" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="360" cy="268" r="3.5" fill="#fff"/>
      <circle cx="238" cy="300" r="3.5" fill="#fff"/>
      <circle cx="458" cy="300" r="3.5" fill="#fff"/>
      <circle cx="454" cy="262" r="3.5" fill="#fff"/>
      <circle cx="356" cy="418" r="3.5" fill="#fff"/>
    </svg>
  );
}

export function Blank({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Blank, the Mr White character: a tall white figure with a question mark for a face', decorative)}>
      <rect x="36" y="50" width="52" height="80" rx="14" fill="#fff" stroke="#111" strokeWidth="4"/>
      <path d="M54 80 C54 66 72 66 72 78 C72 86 62 88 62 96" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="62" cy="108" r="3.5" fill="#111"/>
      <path d="M52 130 L50 148 L40 148 M72 130 L74 148 L84 148" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M36 92 C20 94 18 78 26 70 M88 92 C104 94 106 78 98 70" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  );
}

export function Fibber({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Fibber, the Fake Answers character: a green blob whose tongue is a speech bubble', decorative)}>
      <path d="M44 126 L40 148 M80 126 L84 148" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
      <ellipse cx="62" cy="92" rx="34" ry="38" fill="#2BD67B" stroke="#111" strokeWidth="4"/>
      <circle cx="50" cy="80" r="8" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="74" cy="80" r="8" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="53" cy="80" r="3" fill="#111"/>
      <circle cx="77" cy="80" r="3" fill="#111"/>
      <ellipse cx="62" cy="100" rx="16" ry="6" fill="#111"/>
      <polygon points="56,124 52,136 66,124" fill="#fff" stroke="#111" strokeWidth="3" strokeLinejoin="round"/>
      <rect x="45" y="102" width="34" height="22" rx="10" fill="#fff" stroke="#111" strokeWidth="3"/>
      <path d="M53 110 L71 110 M53 117 L65 117" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Sweaty({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Sweaty, the Hot Seat character: a nervous pink chair with sweat drops', decorative)}>
      <path d="M32 116 L30 148 M50 116 L50 148 M74 116 L74 148 M92 116 L94 148" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
      <rect x="32" y="44" width="60" height="58" rx="8" fill="#FF5C93" stroke="#111" strokeWidth="4"/>
      <rect x="26" y="102" width="72" height="14" rx="4" fill="#FF3B3B" stroke="#111" strokeWidth="4"/>
      <circle cx="50" cy="68" r="7" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="74" cy="68" r="7" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="50" cy="70" r="2.5" fill="#111"/>
      <circle cx="74" cy="70" r="2.5" fill="#111"/>
      <path d="M46 90 Q54 82 62 90 T78 90" fill="none" stroke="#111" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M106 50 Q112 60 106 66 Q100 60 106 50 Z" fill="#2F6BFF" stroke="#111" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M18 64 Q24 74 18 80 Q12 74 18 64 Z" fill="#2F6BFF" stroke="#111" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function Slammer({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Slammer, the Fingers on the Buzzers character: a red buzzer with a grin, about to be slammed by a yellow hand', decorative)}>
      <path d="M44 130 L42 148 L32 148 M80 130 L82 148 L92 148" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="28" y="112" width="68" height="18" rx="4" fill="#FFD23F" stroke="#111" strokeWidth="4"/>
      <path d="M32 112 C32 54 92 54 92 112 Z" fill="#FF3B3B" stroke="#111" strokeWidth="4" strokeLinejoin="round"/>
      <circle cx="52" cy="92" r="7" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="72" cy="92" r="7" fill="#fff" stroke="#111" strokeWidth="3"/>
      <circle cx="53" cy="90" r="2.5" fill="#111"/>
      <circle cx="73" cy="90" r="2.5" fill="#111"/>
      <path d="M52 103 Q62 111 72 103 Z" fill="#111" stroke="#111" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M70 46 C84 34 98 32 114 36" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="64" cy="50" r="9" fill="#FFD23F" stroke="#111" strokeWidth="4"/>
      <path d="M24 88 L12 84 M24 100 L10 100 M100 88 L112 84 M100 100 L114 100" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
    </svg>
  );
}

export function KnowItAll({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Know-it-all, the quiz character: a smug yellow bean in huge glasses with one finger raised', decorative)}>
      <path d="M52 134 L50 150 L40 150 M72 134 L74 150 L84 150" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <ellipse cx="62" cy="94" rx="30" ry="42" fill="#FFD23F" stroke="#111" strokeWidth="4"/>
      <path d="M54 54 L50 42 M62 52 L62 38 M70 54 L74 42" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="48" cy="80" r="12" fill="#fff" stroke="#111" strokeWidth="4"/>
      <circle cx="76" cy="80" r="12" fill="#fff" stroke="#111" strokeWidth="4"/>
      <path d="M60 80 L64 80" fill="none" stroke="#111" strokeWidth="4"/>
      <circle cx="50" cy="82" r="4" fill="#111"/>
      <circle cx="78" cy="82" r="4" fill="#111"/>
      <path d="M50 108 Q62 116 76 104" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round"/>
      <path d="M90 100 C110 96 112 66 104 52" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="104" cy="48" r="6" fill="#FFD23F" stroke="#111" strokeWidth="4"/>
    </svg>
  );
}

export function Sneak({ className, decorative }: CastProps) {
  return (
    <svg viewBox="0 22 124 148" className={className} {...a11y('Sneak, the secret missions character: a hat with eyes peeking out from under the brim', decorative)}>
      <path d="M54 108 L52 148 L42 148 M70 108 L72 148 L82 148" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="50" cy="98" r="9" fill="#fff" stroke="#111" strokeWidth="3.5"/>
      <circle cx="74" cy="98" r="9" fill="#fff" stroke="#111" strokeWidth="3.5"/>
      <circle cx="46" cy="98" r="3.5" fill="#111"/>
      <circle cx="70" cy="98" r="3.5" fill="#111"/>
      <path d="M36 82 L42 54 Q62 46 82 54 L88 82 Z" fill="#2F6BFF" stroke="#111" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M39 72 L85 72" fill="none" stroke="#FFD23F" strokeWidth="5"/>
      <ellipse cx="62" cy="84" rx="46" ry="9" fill="#2F6BFF" stroke="#111" strokeWidth="4"/>
    </svg>
  );
}
