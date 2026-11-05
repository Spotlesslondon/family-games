import { describe, expect, it } from "vitest";
import { CARDS_PER_FORECAST, FORECAST_CARDS, scoreCard, suitable } from "./cards";

describe("forecast cards", () => {
  it("carries exactly the approved batch: 12 everyday and 18 Christmas cards, unique keys", () => {
    expect(FORECAST_CARDS.filter((c) => c.pack === "everyday")).toHaveLength(12);
    expect(FORECAST_CARDS.filter((c) => c.pack === "christmas")).toHaveLength(18);
    expect(new Set(FORECAST_CARDS.map((c) => c.key)).size).toBe(30);
    for (const c of FORECAST_CARDS) expect(c.text).not.toMatch(/\b(bet|wager)\b|—/i);
  });

  it("has enough cards at home for a Forecast at 3 or more players", () => {
    for (const pack of ["everyday", "christmas"] as const) {
      expect(suitable(pack, 3).length).toBeGreaterThanOrEqual(CARDS_PER_FORECAST);
      expect(suitable(pack, 3).every((c) => c.kind === "yesno")).toBe(true);
      expect(suitable(pack, 4).some((c) => c.kind === "person")).toBe(true);
    }
    expect(suitable("christmas", 8).map((c) => c.key)).not.toContain("C16");
  });
});

describe("forecast scoring", () => {
  it("scores a lone right call highest, a rare one next, a common one 1", () => {
    expect(scoreCard({ a: "yes", b: "no", c: "no", d: "no" }, "yes")).toEqual({ a: 3 });
    expect(scoreCard({ a: "yes", b: "yes", c: "no", d: "no", e: "no", f: "no" }, "yes")).toEqual({ a: 2, b: 2 });
    expect(scoreCard({ a: "yes", b: "yes", c: "no" }, "yes")).toEqual({ a: 1, b: 1 });
    expect(scoreCard({ a: "yes", b: "no" }, "yes")).toEqual({ a: 1 });
    expect(scoreCard({ a: "kid", b: "mum", c: "mum" }, "nan")).toEqual({});
  });
});
