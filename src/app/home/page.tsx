"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { avatarColour, initial, loadSession, memberClient, message, type ClientSession } from "@/lib/client/session";

interface Row {
  id: string;
  display_name: string;
  role: string;
}

const field = "h-13 rounded-2xl border-2 border-surface-2 bg-ground px-4 text-lg text-ink outline-none focus:border-go";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [family, setFamily] = useState<{ name: string; code: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [openRoom, setOpenRoom] = useState<{ id: string; code: string } | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);

  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [pin, setPin] = useState("");
  const [grownUp, setGrownUp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Everything below is read with the member's own token, through the
  // database rules: if the sign-in claims were wrong, these lists come back empty.
  const readFamily = useCallback(async (s: ClientSession) => {
    const db = memberClient(s.accessToken);
    const [{ data: fam, error: famError }, { data: people, error: peopleError }, { data: room }] = await Promise.all([
      db.from("families").select("name, code").maybeSingle(),
      db.from("members").select("id, display_name, role").order("created_at"),
      db.from("rooms").select("id, code").eq("status", "open").maybeSingle(),
    ]);
    setOpenRoom((room as { id: string; code: string } | null) ?? null);
    if (famError || peopleError || !fam) {
      setReadError("Could not load your family. Try signing in again.");
      return;
    }
    setFamily(fam as { name: string; code: string });
    setRows((people ?? []) as Row[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((s) => {
      if (cancelled) return;
      if (!s) {
        router.replace("/join");
        return;
      }
      setSession(s);
      readFamily(s);
    });
    return () => {
      cancelled = true;
    };
  }, [router, readFamily]);

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    setFormError(null);
    setBusy(true);
    const res = await fetch("/api/family/members", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({ name, dateOfBirth, pin, role: grownUp ? "adult" : "member" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setFormError(message(body.error));
      return;
    }
    setName("");
    setDateOfBirth("");
    setPin("");
    setGrownUp(false);
    readFamily(session);
  }

  async function enterRoom(path: "/api/rooms" | "/api/rooms/join") {
    if (!session) return;
    setRoomError(null);
    setRoomBusy(true);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify(openRoom ? { code: openRoom.code } : {}),
    });
    const body = await res.json().catch(() => ({}));
    setRoomBusy(false);
    if (!res.ok || !body.room) {
      setRoomError(message(body.error));
      return;
    }
    router.push(`/room/${body.room.id}`);
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/");
  }

  if (!session) {
    return <main className="flex flex-1 items-center justify-center text-muted">Loading...</main>;
  }

  const isOwner = session.member.role === "owner";
  const canHost = isOwner || session.member.role === "adult";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pb-8 pt-12">
      <div className="flex items-center justify-between">
        <div className="font-display text-xl font-bold text-go">Asher Games</div>
        <button type="button" onClick={signOut} className="h-11 rounded-full border-2 border-line px-4 font-bold">Sign out</button>
      </div>
      <h1 className="font-display text-4xl font-semibold leading-tight">Hi {session.member.name}</h1>

      {readError && <p role="alert" className="font-bold text-alert">{readError}</p>}

      {family && (
        <div className="flex items-center justify-between rounded-3xl bg-surface px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-widest text-muted">FAMILY CODE</span>
            <span className="font-display text-3xl font-bold tracking-[0.25em] text-go">{family.code}</span>
          </div>
          <span className="text-right text-muted">{family.name}</span>
        </div>
      )}

      {openRoom ? (
        <button
          type="button"
          disabled={roomBusy}
          onClick={() => enterRoom("/api/rooms/join")}
          className="flex items-center justify-between rounded-3xl bg-go px-5 py-4 text-left text-ground disabled:opacity-60"
        >
          <span className="flex flex-col">
            <span className="font-display text-2xl font-bold">Game night is on</span>
            <span className="font-bold">Room {openRoom.code}</span>
          </span>
          <span className="font-display text-xl font-bold">{roomBusy ? "Joining..." : "Join"}</span>
        </button>
      ) : canHost ? (
        <button
          type="button"
          disabled={roomBusy}
          onClick={() => enterRoom("/api/rooms")}
          className="h-16 rounded-full bg-go font-display text-2xl font-bold text-ground disabled:opacity-60"
        >
          {roomBusy ? "Opening..." : "Start a game night"}
        </button>
      ) : (
        <p className="rounded-3xl bg-surface px-5 py-4 text-muted">No game night yet. A grown-up can start one.</p>
      )}
      {roomError && <p role="alert" className="font-bold text-alert">{roomError}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold tracking-widest text-muted">IN THE FAMILY · {rows.length}</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full font-display font-bold text-ground" style={{ background: avatarColour(i) }}>
                {initial(r.display_name)}
              </span>
              <span className="flex-1 text-lg font-bold">{r.display_name}</span>
              <span className="text-sm text-muted">{r.role === "owner" ? "Owner" : r.role === "adult" ? "Grown-up" : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <form onSubmit={addPerson} className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
          <h2 className="font-display text-2xl font-semibold">Add someone</h2>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">Name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">Date of birth</span>
            <input className={field} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">Their PIN</span>
            <input className={field} type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 numbers" required />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-6 w-6 accent-[#FFC93C]" checked={grownUp} onChange={(e) => setGrownUp(e.target.checked)} />
            <span className="font-bold">This person is a grown-up</span>
          </label>
          {formError && <p role="alert" className="font-bold text-alert">{formError}</p>}
          <button type="submit" disabled={busy} className="h-14 rounded-full bg-go font-display text-xl font-bold text-ground disabled:opacity-60">
            {busy ? "Adding..." : "Add to the family"}
          </button>
        </form>
      )}
    </main>
  );
}
