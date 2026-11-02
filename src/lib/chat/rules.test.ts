import { describe, expect, it } from "vitest";
import { QUICK_REPLIES, checkTyped, effectiveMode, isQuickKey } from "./rules";

const refused = (t: string) => {
  const r = checkTyped(t);
  return r.ok ? null : r.reason;
};

describe("chat rules", () => {
  it("lets ordinary game talk through, tidied", () => {
    expect(checkTyped("  Nan is   definitely the wolf ")).toEqual({ ok: true, text: "Nan is definitely the wolf" });
    expect(checkTyped("I scored 3 points!")).toEqual({ ok: true, text: "I scored 3 points!" });
    expect(checkTyped("Mr White is out, well done Sussex")).toEqual({ ok: true, text: "Mr White is out, well done Sussex" });
    expect(checkTyped("Scunthorpe and class and assess")).toEqual({ ok: true, text: "Scunthorpe and class and assess" });
  });

  it("refuses empty and over 120 characters", () => {
    expect(refused("   ")).toBe("chat_empty");
    expect(refused("a".repeat(121))).toBe("chat_too_long");
    expect(refused("a".repeat(120))).toBeNull();
  });

  it("refuses links", () => {
    for (const t of ["look at https://x.io", "www.example.com", "go to example.com", "example dot com", "yt.be/abc"]) {
      expect(refused(t), t).toBe("chat_link");
    }
  });

  it("refuses phone numbers and email addresses", () => {
    for (const t of ["call 07700 900123", "ring 0770-090-0123", "me@example.org"]) expect(refused(t), t).toBe("chat_contact");
  });

  it("refuses swearing and slurs, including letter swaps and spacing", () => {
    for (const t of ["oh shit", "SH1T", "f u c k", "you b1tch", "what a w4nker"]) expect(refused(t), t).toBe("chat_word");
  });

  it("knows the quick replies, and nothing else is one", () => {
    expect(isQuickKey("well_done")).toBe(true);
    expect(isQuickKey("toString")).toBe(false);
    expect(isQuickKey("hello")).toBe(false);
    for (const label of Object.values(QUICK_REPLIES)) expect(checkTyped(label).ok).toBe(true);
  });

  it("is quick replies only while a child is in the room, unless the host chose", () => {
    expect(effectiveMode(null, true)).toBe("quick");
    expect(effectiveMode(null, false)).toBe("typed");
    expect(effectiveMode("typed", true)).toBe("typed");
    expect(effectiveMode("off", false)).toBe("off");
  });
});
