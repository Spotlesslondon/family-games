import { describe, expect, it } from "vitest";
import { createSessionStore, SessionUnavailable, type ClientSession } from "./session-store";

const T0 = 1_800_000_000_000; // a fixed "now" in milliseconds

function session(token: string, expiresInMs: number, now = T0): ClientSession {
  return {
    accessToken: token,
    expiresAt: Math.floor((now + expiresInMs) / 1000),
    member: { id: "m1", name: "Kid", role: "member", familyId: "f1" },
  };
}

function harness() {
  let now = T0;
  const replies: Array<() => Promise<Response>> = [];
  let calls = 0;
  const store = createSessionStore({
    fetchSession: () => {
      calls += 1;
      const next = replies.shift();
      if (!next) throw new Error("unexpected session request");
      return next();
    },
    now: () => now,
    withLock: (fn) => fn(),
  });
  return {
    store,
    calls: () => calls,
    advance: (ms: number) => { now += ms; },
    ok: (s: ClientSession) => replies.push(async () => Response.json(s)),
    status: (code: number) => replies.push(async () => Response.json({ error: "x" }, { status: code })),
    offline: () => replies.push(async () => { throw new TypeError("Failed to fetch"); }),
    deferred: () => {
      let resolve!: (r: Response) => void;
      replies.push(() => new Promise<Response>((r) => { resolve = r; }));
      return (s: ClientSession) => resolve(Response.json(s));
    },
    nowMs: () => now,
  };
}

describe("session store", () => {
  it("reuses a token that has more than a minute left", async () => {
    const h = harness();
    h.ok(session("a", 3_600_000));
    expect(await h.store.token()).toBe("a");
    h.advance(30 * 60_000);
    expect(await h.store.token()).toBe("a");
    expect(h.calls()).toBe(1);
  });

  it("renews before expiry, so a game night longer than an hour keeps working", async () => {
    const h = harness();
    h.ok(session("a", 3_600_000));
    await h.store.token();
    h.advance(59 * 60_000 + 30_000); // 30 seconds left
    h.ok(session("b", 3_600_000, h.nowMs()));
    expect(await h.store.token()).toBe("b");
    h.advance(70 * 60_000);
    h.ok(session("c", 3_600_000, h.nowMs()));
    expect(await h.store.token()).toBe("c");
    expect(h.calls()).toBe(3);
  });

  it("makes one renewal however many callers ask at once", async () => {
    const h = harness();
    const finish = h.deferred();
    const asks = [h.store.token(), h.store.token(), h.store.token(), h.store.load()];
    finish(session("a", 3_600_000));
    const got = await Promise.all(asks);
    expect(got.slice(0, 3)).toEqual(["a", "a", "a"]);
    expect(h.calls()).toBe(1);
  });

  it("treats only a 401 as signed out", async () => {
    const h = harness();
    h.status(401);
    expect(await h.store.load()).toBeNull();
  });

  it("does not sign anyone out on a server error or a network blip", async () => {
    const h = harness();
    h.status(503);
    await expect(h.store.load()).rejects.toBeInstanceOf(SessionUnavailable);
    h.offline();
    await expect(h.store.load()).rejects.toBeInstanceOf(SessionUnavailable);
    h.ok(session("a", 3_600_000, h.nowMs()));
    expect(await h.store.token()).toBe("a");
  });

  it("keeps playing on a still-valid token if renewal hits a blip", async () => {
    const h = harness();
    h.ok(session("a", 3_600_000));
    await h.store.token();
    h.advance(59 * 60_000 + 30_000); // inside the renew window, still valid
    h.offline();
    expect(await h.store.token()).toBe("a");
  });

  it("never hands the previous person's token to a shared phone", async () => {
    const h = harness();
    const finish = h.deferred();
    const pending = h.store.load();
    h.store.forget(); // sign-out while a renewal is in flight
    finish(session("previous-person", 3_600_000));
    expect(await pending).toBeNull();
    expect(h.store.cachedToken()).toBeNull();
    h.ok(session("next-person", 3_600_000));
    expect(await h.store.token()).toBe("next-person");
  });

  it("renews straight away after the server refuses a token", async () => {
    const h = harness();
    h.ok(session("a", 3_600_000));
    await h.store.token();
    h.store.invalidate();
    h.ok(session("b", 3_600_000));
    expect(await h.store.token()).toBe("b");
    expect(h.calls()).toBe(2);
  });
});
