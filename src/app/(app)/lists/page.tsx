"use client";

// The host's saved lists: one per group chat ("Siblings", "Gran's house").
// Starting a night from a list puts exactly those names on the join screen.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { initial, loadSession, memberClient, message, postAsMember, type ClientSession } from "@/lib/client/session";
import { Reconnect } from "@/app/(app)/reconnect";

interface Person {
  id: string;
  name: string;
  guest: boolean;
}

interface SavedList {
  id: string;
  name: string;
  people: Set<string>;
}

const BANDS: { value: string; label: string }[] = [
  { value: "6-8", label: "6 to 8" },
  { value: "9-11", label: "9 to 11" },
  { value: "12-15", label: "12 to 15" },
  { value: "16+", label: "16 or over" },
];

const field = "h-13 rounded-2xl border-2 border-surface-2 bg-ground px-4 text-lg text-ink outline-none focus:border-go";

async function send(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await postAsMember("/api/lists", body).catch(() => null);
  if (!res) return { ok: false, error: "offline" };
  const out = await res.json().catch(() => ({}));
  return res.ok ? { ...out, ok: true } : { ok: false, error: out.error };
}

export default function Lists() {
  const router = useRouter();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newList, setNewList] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // list id with the "someone new" form open
  const [newName, setNewName] = useState("");
  const [newBand, setNewBand] = useState<string | null>(null);

  const read = useCallback(async () => {
    const db = memberClient();
    const [{ data: members, error: e1 }, { data: saved, error: e2 }, { data: onLists, error: e3 }] = await Promise.all([
      db.from("members").select("id, display_name, is_guest").order("created_at"),
      db.from("lists").select("id, name").order("created_at"),
      db.from("list_people").select("list_id, member_id"),
    ]);
    if (e1 || e2 || e3) {
      setError("Could not load your lists. Try again.");
      return;
    }
    const byList = new Map<string, Set<string>>();
    for (const r of onLists ?? []) {
      const set = byList.get(r.list_id as string) ?? new Set<string>();
      set.add(r.member_id as string);
      byList.set(r.list_id as string, set);
    }
    setPeople((members ?? []).map((m) => ({ id: m.id as string, name: m.display_name as string, guest: m.is_guest as boolean })));
    setLists((saved ?? []).map((l) => ({ id: l.id as string, name: l.name as string, people: byList.get(l.id as string) ?? new Set() })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((s) => {
        if (cancelled) return;
        if (!s || s.seat) {
          router.replace("/join");
          return;
        }
        if (s.member.role !== "owner" && s.member.role !== "adult") {
          router.replace("/home");
          return;
        }
        setOffline(false);
        setSession(s);
        read();
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, read, attempt]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await send({ action: "create", name: newList });
    setBusy(false);
    if (!out.ok) {
      setError(message(out.error));
      return;
    }
    setNewList("");
    read();
  }

  async function toggle(list: SavedList, personId: string) {
    const on = !list.people.has(personId);
    // Show the change at once; put it back if the server says no.
    setLists((all) =>
      all.map((l) => {
        if (l.id !== list.id) return l;
        const next = new Set(l.people);
        if (on) next.add(personId);
        else next.delete(personId);
        return { ...l, people: next };
      })
    );
    setError(null);
    const out = await send({ action: "set", listId: list.id, memberId: personId, on });
    if (!out.ok) setError(message(out.error));
    read();
  }

  async function remove(listId: string) {
    if (confirmDelete !== listId) {
      setConfirmDelete(listId); // a second tap deletes, so a slip does nothing
      return;
    }
    setConfirmDelete(null);
    setError(null);
    const out = await send({ action: "delete", listId });
    if (!out.ok) setError(message(out.error));
    read();
  }

  async function addSomeone(event: React.FormEvent, listId: string) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await send({ action: "add_player", name: newName, ageBand: newBand, listId });
    setBusy(false);
    if (!out.ok) {
      setError(message(out.error));
      return;
    }
    setNewName("");
    setNewBand(null);
    setAdding(null);
    read();
  }

  if (offline) return <Reconnect onRetry={() => setAttempt((n) => n + 1)} />;
  if (!session) return <main className="flex flex-1 items-center justify-center text-muted">Loading...</main>;

  // The host is always at their own night, so they are not ticked onto lists.
  const others = people.filter((p) => p.id !== session.member.id);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 pb-10 pt-10">
      <Link href="/home" aria-label="Back" className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold">Your lists</h1>
        <p className="text-muted">One list for each group chat. When you start a game night from a list, those are the names people see when they tap your link.</p>
      </div>

      <p role="alert" aria-live="polite" className="-my-3 min-h-6 font-bold text-alert">{error ?? ""}</p>

      {lists.map((list) => (
        <section key={list.id} className="flex flex-col gap-4 rounded-3xl bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">{list.name}</h2>
            <button
              type="button"
              onClick={() => remove(list.id)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-bold ${confirmDelete === list.id ? "bg-alert text-ground" : "border-2 border-line text-muted"}`}
            >
              {confirmDelete === list.id ? "Tap to delete" : "Delete"}
            </button>
          </div>
          {others.length === 0 ? (
            <p className="text-muted">Nobody to add yet. Add someone new below.</p>
          ) : (
            <ul className="flex flex-wrap gap-2.5">
              {others.map((p) => {
                const on = list.people.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(list, p.id)}
                      className={`flex h-12 items-center gap-2 rounded-full border-2 pl-1.5 pr-4 font-bold ${on ? "border-go bg-go text-ground" : "border-line"}`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full font-display ${on ? "bg-ground text-go" : "bg-surface-2"}`}>{initial(p.name)}</span>
                      {p.name}
                      {p.guest && <span className={`text-sm font-semibold ${on ? "" : "text-muted"}`}>guest</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {adding === list.id ? (
            <form onSubmit={(e) => addSomeone(e, list.id)} className="flex flex-col gap-3 border-t-2 border-surface-2 pt-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-bold">First name</span>
                <input className={field} value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 40))} autoCapitalize="words" required />
              </label>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-bold">Age</legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {BANDS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={newBand === b.value}
                      onClick={() => setNewBand(b.value)}
                      className={`h-12 rounded-2xl border-2 font-bold ${newBand === b.value ? "border-go bg-go text-ground" : "border-surface-2 bg-ground"}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="text-sm text-muted">They join by your link and tap their name. No PIN.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setAdding(null)} className="h-13 rounded-full border-2 border-line font-bold">Cancel</button>
                <button type="submit" disabled={busy || !newName.trim() || !newBand} className="h-13 rounded-full bg-go font-bold text-ground disabled:opacity-60">
                  {busy ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(list.id);
                setNewName("");
                setNewBand(null);
              }}
              className="h-12 rounded-full border-2 border-dashed border-line font-bold"
            >
              Add someone new
            </button>
          )}
        </section>
      ))}

      <form onSubmit={create} className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-line p-5">
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-xl font-semibold">New list</span>
          <input className={field} value={newList} onChange={(e) => setNewList(e.target.value.slice(0, 40))} placeholder="Siblings" required />
        </label>
        <button type="submit" disabled={busy || !newList.trim()} className="h-14 rounded-full bg-go font-display text-xl font-bold text-ground disabled:opacity-60">
          {busy ? "Making..." : "Make the list"}
        </button>
      </form>
    </main>
  );
}
