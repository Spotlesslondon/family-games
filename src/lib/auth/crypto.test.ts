import { describe, expect, it } from "vitest";
import {
  ageBand,
  ageOn,
  cleanName,
  familyCode,
  hashPin,
  isValidDate,
  isValidPin,
  memberEmail,
  memberPassword,
  normaliseFamilyCode,
  verifyPin,
} from "./crypto";

const KEY = "k".repeat(44);

describe("PINs", () => {
  it("accepts exactly four digits", () => {
    expect(isValidPin("0123")).toBe(true);
    for (const bad of ["123", "12345", "12a4", " 1234", "", 1234, null]) {
      expect(isValidPin(bad)).toBe(false);
    }
  });

  it("verifies the right PIN and rejects the wrong one", () => {
    const stored = hashPin("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("4821");
    expect(verifyPin("4821", stored)).toBe(true);
    expect(verifyPin("4822", stored)).toBe(false);
    expect(verifyPin("482", stored)).toBe(false);
  });

  it("salts every hash", () => {
    expect(hashPin("1111")).not.toBe(hashPin("1111"));
  });

  it("rejects malformed stored values instead of throwing", () => {
    expect(verifyPin("1111", "x")).toBe(false);
    expect(verifyPin("1111", "scrypt$abc$def$ghi")).toBe(false);
  });
});

describe("member passwords", () => {
  it("is stable for the same user and key", () => {
    expect(memberPassword("user-1", KEY)).toBe(memberPassword("user-1", KEY));
  });

  it("differs per user and per key", () => {
    expect(memberPassword("user-1", KEY)).not.toBe(memberPassword("user-2", KEY));
    expect(memberPassword("user-1", KEY)).not.toBe(memberPassword("user-1", "j".repeat(44)));
  });

  it("fits Supabase's 72 character password limit", () => {
    expect(memberPassword("user-1", KEY).length).toBeLessThanOrEqual(72);
  });

  it("refuses a missing or short key", () => {
    expect(() => memberPassword("user-1", "")).toThrow();
    expect(() => memberPassword("user-1", "short")).toThrow();
  });

  it("builds a hidden email on a domain that can never receive mail", () => {
    expect(memberEmail("abc")).toBe("member-abc@members.family-games.invalid");
  });
});

describe("family codes", () => {
  it("are six capital letters", () => {
    for (let i = 0; i < 50; i++) expect(familyCode()).toMatch(/^[A-Z]{6}$/);
  });

  it("normalise what people type", () => {
    expect(normaliseFamilyCode(" asherz ")).toBe("ASHERZ");
    expect(normaliseFamilyCode("ASH")).toBeNull();
    expect(normaliseFamilyCode("ASH3RZ")).toBeNull();
    expect(normaliseFamilyCode(42)).toBeNull();
  });
});

describe("ages", () => {
  it("counts birthdays correctly", () => {
    expect(ageOn("2016-11-02", "2026-11-01")).toBe(9);
    expect(ageOn("2016-11-01", "2026-11-01")).toBe(10);
  });

  it("places ages in the quiz bands", () => {
    expect(ageBand("2019-01-01", "2026-11-01")).toBe("6-8");
    expect(ageBand("2016-01-01", "2026-11-01")).toBe("9-11");
    expect(ageBand("2012-01-01", "2026-11-01")).toBe("12-15");
    expect(ageBand("1985-01-01", "2026-11-01")).toBe("16+");
  });

  it("validates real calendar dates only", () => {
    expect(isValidDate("2016-02-29")).toBe(true);
    expect(isValidDate("2015-02-29")).toBe(false);
    expect(isValidDate("2016-13-01")).toBe(false);
    expect(isValidDate("01/02/2016")).toBe(false);
  });

  it("tidies names", () => {
    expect(cleanName("  Ella   Rose ")).toBe("Ella Rose");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(41))).toBeNull();
  });
});
