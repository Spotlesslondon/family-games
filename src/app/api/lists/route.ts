// POST /api/lists: the host's saved lists. One door, by action:
//   { action: "create", name }
//   { action: "delete", listId }
//   { action: "set", listId, memberId, on }
//   { action: "add_player", name, ageBand, listId? }

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { addPlayer, createList, deleteList, setOnList } from "@/lib/lists/service";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    switch (body.action) {
      case "create":
        return Response.json({ list: await createList(token, body.name) });
      case "delete":
        await deleteList(token, body.listId);
        return Response.json({ ok: true });
      case "set":
        await setOnList(token, body.listId, body.memberId, body.on === true);
        return Response.json({ ok: true });
      case "add_player":
        return Response.json({ person: await addPlayer(token, { name: body.name, ageBand: body.ageBand, listId: body.listId }) });
      default:
        throw new AuthError("invalid_request", 400);
    }
  } catch (err) {
    return errorResponse(err);
  }
}
