import { describe, expect, it } from "vitest";
import { AVATAR_KEYS, isAvatarKey, mayTake } from "./avatars";

describe("character picks", () => {
  it("knows the six keys and nothing else", () => {
    expect(AVATAR_KEYS).toHaveLength(6);
    expect(isAvatarKey("dome")).toBe(true);
    expect(isAvatarKey("star")).toBe(false); // the column's old default: not picked yet
    expect(isAvatarKey("<svg>")).toBe(false);
  });
  it("refuses a taken character while a free one is left", () => {
    expect(mayTake("dome", [])).toBe(true);
    expect(mayTake("dome", ["dome"])).toBe(false);
    expect(mayTake("dome", ["brick", "pip", "puff", "beam", "egg"])).toBe(true);
  });
  it("allows duplicates once all six are taken (the seventh player on)", () => {
    expect(mayTake("dome", ["dome", "brick", "pip", "puff", "beam", "egg"])).toBe(true);
    expect(mayTake("egg", ["dome", "brick", "pip", "puff", "beam", "egg", "egg"])).toBe(true);
  });
});
