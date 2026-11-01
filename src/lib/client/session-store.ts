// The browser's sign-in session, kept in memory only. The refresh token never
// reaches JavaScript: it lives in an HttpOnly cookie and is traded for a fresh
// one-hour access token by POST /api/auth/session.
//
// Rules this store keeps, each covered by session-store.test.ts:
// - A token with more than a minute left is reused, so moving between screens
//   costs no round trip.
// - A token close to expiry is renewed before anyone uses it, so a game night
//   longer than an hour keeps working (live updates ask for a token on every
//   heartbeat, about every 25 seconds).
// - Many callers at once cause ONE renewal, and renewals are serialised across
//   tabs. Refresh tokens rotate; two renewals racing with the same cookie can
//   make Supabase revoke the whole session and sign the person out.
// - Only a 401 means signed out. A network blip or a server error throws
//   SessionUnavailable, so screens can say "reconnecting" instead of sending a
//   child back to the sign-in screen.
// - forget() (sign-in or sign-out) wins over any renewal still in flight, so a
//   shared phone never shows the previous person.

export interface ClientSession {
  accessToken: string;
  expiresAt: number | null; // seconds since epoch, as Supabase reports it
  member: { id: string; name: string; role: string; familyId: string };
  /** Set when this phone joined by link: it may use this one room only. */
  seat?: { roomId: string };
}

export class SessionUnavailable extends Error {
  constructor() {
    super("session_unavailable");
    this.name = "SessionUnavailable";
  }
}

export interface SessionStoreDeps {
  fetchSession: () => Promise<Response>;
  now: () => number; // milliseconds
  withLock: <T>(fn: () => Promise<T>) => Promise<T>;
}

export const RENEW_BEFORE_MS = 60_000;

export function createSessionStore(deps: SessionStoreDeps) {
  let current: ClientSession | null = null;
  let inflight: Promise<ClientSession | null> | null = null;
  let generation = 0;

  const usable = (s: ClientSession | null, margin: number): s is ClientSession =>
    !!s && s.expiresAt !== null && s.expiresAt * 1000 - deps.now() > margin;

  async function renew(gen: number): Promise<ClientSession | null> {
    let res: Response;
    try {
      res = await deps.fetchSession();
    } catch {
      throw new SessionUnavailable();
    }
    if (gen !== generation) return null; // signed out or switched person meanwhile
    if (res.status === 401) {
      current = null;
      return null;
    }
    if (!res.ok) throw new SessionUnavailable();
    const session = (await res.json()) as ClientSession;
    if (gen !== generation) return null;
    current = session;
    return session;
  }

  async function load(): Promise<ClientSession | null> {
    if (usable(current, RENEW_BEFORE_MS)) return current;
    if (!inflight) {
      const gen = generation;
      const attempt = deps.withLock(() => renew(gen));
      inflight = attempt;
      attempt.then(
        () => { if (inflight === attempt) inflight = null; },
        () => { if (inflight === attempt) inflight = null; }
      );
    }
    try {
      return await inflight;
    } catch (err) {
      // A blip while the old token is still valid: keep playing on it.
      if (usable(current, 0)) return current;
      throw err;
    }
  }

  return {
    load,
    /** A current access token, renewed if needed; null when signed out. */
    async token(): Promise<string | null> {
      return (await load())?.accessToken ?? null;
    },
    /** The token in memory right now, for sends that cannot wait (page hide). */
    cachedToken(): string | null {
      return current?.accessToken ?? null;
    },
    /**
     * The server refused the token (401) although it looked valid here, for
     * example after the phone's clock drifted. Drop it so the next ask renews.
     */
    invalidate(): void {
      current = null;
    },
    forget(): void {
      generation += 1;
      current = null;
      inflight = null;
    },
  };
}
