// Server-only: the host's saved lists ("Siblings", "Gran's house", "Uni guys").
// A list is a named group of the host's people, mirroring a WhatsApp group.
// Starting a night from a list puts exactly those names on the join screen.
// Phones read lists through row level security (0008); every write is here.

import { serviceClient } from "@/lib/supabase/server";
import { cleanName } from "@/lib/auth/crypto";
import { AuthError, callerMember } from "@/lib/auth/service";
import { AGE_BANDS } from "@/lib/rooms/night";

export const MAX_LISTS = 20;
export const MAX_PEOPLE_PER_LIST = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lists are kept by whoever can host: the owner and grown-ups. */
async function host(accessToken: string) {
  const caller = await callerMember(accessToken);
  if (caller.role !== "owner" && caller.role !== "adult") throw new AuthError("grown_ups_host", 403);
  return caller;
}

async function ownList(familyId: string, raw: unknown): Promise<string> {
  if (typeof raw !== "string" || !UUID.test(raw)) throw new AuthError("invalid_list", 400);
  const { data } = await serviceClient().from("lists").select("id").eq("id", raw).eq("family_id", familyId).maybeSingle();
  if (!data) throw new AuthError("list_not_found", 404);
  return raw;
}

export async function createList(accessToken: string, rawName: unknown): Promise<{ id: string; name: string }> {
  const caller = await host(accessToken);
  const name = cleanName(rawName);
  if (!name) throw new AuthError("invalid_list_name", 400);
  const db = serviceClient();
  const { count } = await db.from("lists").select("id", { count: "exact", head: true }).eq("family_id", caller.family_id);
  if ((count ?? 0) >= MAX_LISTS) throw new AuthError("too_many_lists", 409);
  const { data, error } = await db.from("lists").insert({ family_id: caller.family_id, name }).select("id, name").single();
  if (error?.code === "23505") throw new AuthError("list_name_taken", 409);
  if (error || !data) throw new AuthError("server_busy", 503, { reason: error?.message });
  return data as { id: string; name: string };
}

export async function deleteList(accessToken: string, rawListId: unknown): Promise<void> {
  const caller = await host(accessToken);
  const listId = await ownList(caller.family_id, rawListId);
  // A night started from this list keeps running; the database forgets which
  // list it came from (rooms_list_fk, on delete set null) and its join screen
  // falls back to the family's regular people.
  const { error } = await serviceClient().from("lists").delete().eq("id", listId);
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
}

/**
 * Puts a person on a list or takes them off. Putting a guest on a list saves
 * them: they stop being a guest and become one of the host's people.
 */
export async function setOnList(accessToken: string, rawListId: unknown, rawMemberId: unknown, on: boolean): Promise<void> {
  const caller = await host(accessToken);
  const listId = await ownList(caller.family_id, rawListId);
  if (typeof rawMemberId !== "string" || !UUID.test(rawMemberId)) throw new AuthError("invalid_request", 400);
  const db = serviceClient();
  const { data: person } = await db.from("members").select("id, is_guest").eq("id", rawMemberId).eq("family_id", caller.family_id).maybeSingle();
  if (!person) throw new AuthError("person_not_found", 404);

  if (!on) {
    const { error } = await db.from("list_people").delete().eq("list_id", listId).eq("member_id", rawMemberId);
    if (error) throw new AuthError("server_busy", 503, { reason: error.message });
    return;
  }
  const { count } = await db.from("list_people").select("member_id", { count: "exact", head: true }).eq("list_id", listId);
  if ((count ?? 0) >= MAX_PEOPLE_PER_LIST) throw new AuthError("list_full", 409);
  const { error } = await db
    .from("list_people")
    .upsert({ list_id: listId, member_id: rawMemberId, family_id: caller.family_id }, { onConflict: "list_id,member_id", ignoreDuplicates: true });
  if (error) throw new AuthError("server_busy", 503, { reason: error.message });
  if (person.is_guest) await db.from("members").update({ is_guest: false }).eq("id", rawMemberId);
}

/**
 * Adds a player who joins by link: a first name and an age band, no PIN and
 * no sign-in of their own. Optionally straight onto a list.
 */
export async function addPlayer(
  accessToken: string,
  input: { name: unknown; ageBand: unknown; listId?: unknown }
): Promise<{ id: string; name: string }> {
  const caller = await host(accessToken);
  const name = cleanName(input.name);
  if (!name) throw new AuthError("invalid_name", 400);
  if (!AGE_BANDS.includes(input.ageBand as (typeof AGE_BANDS)[number])) throw new AuthError("invalid_age_band", 400);
  const listId = input.listId ? await ownList(caller.family_id, input.listId) : null;
  const db = serviceClient();
  const { data, error } = await db
    .from("members")
    .insert({ family_id: caller.family_id, display_name: name, age_band: input.ageBand, role: "member" })
    .select("id, display_name")
    .single();
  if (error?.code === "23505") throw new AuthError("name_taken", 409);
  if (error || !data) throw new AuthError("member_create_failed", 500, { reason: error?.message });
  if (listId) await setOnList(accessToken, listId, data.id, true);
  return { id: data.id as string, name: data.display_name as string };
}
