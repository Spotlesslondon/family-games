import { describe, expect, it } from "vitest";
import { isTransient } from "@/lib/auth/service";
import { clientIp } from "@/lib/auth/http";
import { IDLE_CLOSE_MS, isIdle } from "@/lib/rooms/service";

describe("which refresh failures sign someone out", () => {
  it("keeps the sign-in on a network failure or a Supabase outage", () => {
    expect(isTransient({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
    expect(isTransient({ status: 0 })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
    expect(isTransient({ status: 429 })).toBe(true);
  });
  it("signs out only on a genuinely invalid refresh token", () => {
    expect(isTransient({ name: "AuthApiError", status: 400 })).toBe(false);
    expect(isTransient({ status: 401 })).toBe(false);
  });
});

describe("visitor address for rate limits", () => {
  const req = (h: Record<string, string>) => new Request("https://ashergames.com/api/x", { headers: h });
  it("prefers Vercel's own header and takes the first address", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "81.2.69.160", "x-forwarded-for": "10.0.0.1" }))).toBe("81.2.69.160");
    expect(clientIp(req({ "x-forwarded-for": "81.2.69.160, 10.0.0.1" }))).toBe("81.2.69.160");
  });
  it("falls back to a shared bucket rather than skipping the limit", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("idle game nights", () => {
  const now = Date.parse("2026-11-01T20:00:00Z");
  it("closes a night with no activity for over 90 minutes", () => {
    expect(IDLE_CLOSE_MS).toBe(90 * 60_000);
    expect(isIdle(new Date(now - IDLE_CLOSE_MS - 1000).toISOString(), now)).toBe(true);
  });
  it("keeps a night through a long dinner break", () => {
    expect(isIdle(new Date(now - 60 * 60_000).toISOString(), now)).toBe(false);
  });
  it("keeps a night that is still going", () => {
    expect(isIdle(new Date(now - 5 * 60_000).toISOString(), now)).toBe(false);
    expect(isIdle(null, now)).toBe(false);
  });
});
