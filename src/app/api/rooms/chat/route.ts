// POST /api/rooms/chat: { roomId, action, ... } - chat in a game night.
//   status: { mode, chosen, isHost, quick }
//   send:   { text } or { quick }      (rules in lib/chat/rules)
//   mode:   { mode: "typed" | "quick" | "off" | null }   host only
//   remove: { messageId }               host only

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { chatStatus, removeChat, sendChat, setChatMode } from "@/lib/rooms/chat";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    switch (body.action) {
      case "status":
        return Response.json(await chatStatus(token, body.roomId));
      case "send":
        return Response.json(await sendChat(token, body.roomId, body.text, body.quick));
      case "mode":
        return Response.json(await setChatMode(token, body.roomId, body.mode));
      case "remove":
        return Response.json(await removeChat(token, body.roomId, body.messageId));
      default:
        throw new AuthError("invalid_request", 400);
    }
  } catch (err) {
    return errorResponse(err);
  }
}
