"use client";

// Shown when the app cannot reach the server (a network blip or a server
// error). It is not a sign-out: the person stays signed in and can retry.
// Wording to be reviewed by the CEO seat.

export function Reconnect({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6">
      <h1 className="font-display text-3xl font-semibold">Can&apos;t reach Asher Games</h1>
      <p className="text-lg text-muted">Check the Wi-Fi or mobile data, then try again. You are still signed in.</p>
      <button type="button" onClick={onRetry} className="btn btn-primary h-14 font-display text-xl font-bold text-ink">
        Try again
      </button>
    </main>
  );
}
