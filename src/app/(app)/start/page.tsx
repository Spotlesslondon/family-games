"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { forgetSession, message } from "@/lib/client/session";

const field = "h-14 rounded-2xl border-2 border-surface-2 bg-surface px-4 text-lg text-ink outline-none focus:border-go";

export default function StartFamily() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (pin !== pinAgain) {
      setError("The two PINs do not match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/family", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ familyName, name, dateOfBirth, pin }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(message(body.error));
      return;
    }
    forgetSession();
    router.push("/home");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pb-8 pt-12">
      <div className="font-display text-xl font-bold text-go">Asher Games</div>
      <h1 className="font-display text-4xl font-semibold">Start your family</h1>
      <p className="text-muted">You will be the family owner. You can add everyone else next.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-bold">Family name</span>
          <input className={field} value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Ashers" autoComplete="off" required />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-bold">Your name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mum" autoComplete="given-name" required />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-bold">Your date of birth</span>
          <input className={field} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className="font-bold">Choose a PIN</span>
            <input className={field} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 numbers" required />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-bold">PIN again</span>
            <input className={field} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pinAgain} onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, ""))} required />
          </label>
        </div>
        {error && <p role="alert" className="font-bold text-alert">{error}</p>}
        <button type="submit" disabled={busy} className="mt-2 h-15 rounded-full bg-go font-display text-xl font-bold text-ground disabled:opacity-60">
          {busy ? "Setting up..." : "Create our family"}
        </button>
      </form>
    </main>
  );
}
