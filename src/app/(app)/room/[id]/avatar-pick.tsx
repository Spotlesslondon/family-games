"use client";

// Pick your character: shown in the lobby to anyone who has not picked one yet,
// and to anyone who taps their own character to change it (until a game
// starts). Six big tiles; a character someone else has is greyed with their
// name, unless all six are taken (from the seventh player on, duplicates are
// allowed). The tapped tile lights up at once, before the server answers.

import { useState } from "react";
import { AVATARS, AVATAR_KEYS, PlayerAvatar, type AvatarKey } from "@/components/avatars";
import { mayTake } from "@/lib/avatars";
import { message, postAsMember } from "@/lib/client/session";

export interface Taken {
  avatar: AvatarKey;
  name: string;
}

export function AvatarPick({
  roomId,
  myName,
  current,
  takenByOthers,
  onDone,
  onCancel,
}: {
  roomId: string;
  myName: string;
  current: AvatarKey | null;
  takenByOthers: Taken[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [tapped, setTapped] = useState<AvatarKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = tapped ?? current;
  const takenKeys = takenByOthers.map((t) => t.avatar);

  async function pick(key: AvatarKey) {
    if (tapped) return;
    setTapped(key);
    setError(null);
    const res = await postAsMember("/api/rooms/avatar", { roomId, avatar: key }).catch(() => null);
    if (!res?.ok) {
      const body = res ? await res.json().catch(() => ({})) : { error: "offline" };
      setError(message(body.error));
      setTapped(null);
      return;
    }
    onDone();
    setTapped(null);
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <h1 className="font-display text-4xl leading-tight">Pick your character</h1>
      <p className="text-lg">This is you tonight, {myName}. Everyone sees it next to your name.</p>
      <ul className="grid grid-cols-2 gap-4">
        {AVATAR_KEYS.map((key) => {
          const owner = takenByOthers.find((t) => t.avatar === key);
          const allowed = mayTake(key, takenKeys);
          const selected = shown === key;
          return (
            <li key={key}>
              <button
                type="button"
                disabled={!allowed}
                aria-pressed={selected}
                onClick={() => pick(key)}
                className={`relative flex w-full flex-col items-center gap-2 rounded-md border-4 bg-white px-2 pb-3 pt-4 shadow-[4px_4px_0_#111] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-40 disabled:shadow-none ${
                  selected ? "border-pick" : "border-ink"
                }`}
              >
                {selected && (
                  <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-ink bg-pick" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5 L10 17.5 L19 7" />
                    </svg>
                  </span>
                )}
                <PlayerAvatar avatar={key} className="h-24 w-auto" label={AVATARS[key].name} />
                <span className="font-display text-2xl">{AVATARS[key].name}</span>
                {owner && !allowed && <span className="text-sm font-bold">{owner.name} has it</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p role="alert" aria-live="polite" className="min-h-7 text-center font-bold text-alert">{error ?? ""}</p>
      {onCancel && current && (
        <button type="button" onClick={onCancel} className="h-14 rounded-md border-4 border-ink bg-white font-bold shadow-[4px_4px_0_#111]">
          Keep {AVATARS[current].name}
        </button>
      )}
    </section>
  );
}
