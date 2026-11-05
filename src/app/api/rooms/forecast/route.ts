// POST /api/rooms/forecast: { roomId, action, ... } - the Family Forecast.
//   start: { pack, cards, presenterId }   host only
//   call:  { cardId, call }               a secret call
//   claim: { cardId }                     "It happened"
//   rule:  { cardId, outcome }            host or presenter; "notyet" reopens
//   end:   {}                             host only

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/service";
import { claimCard, endForecast, makeCall, ruleCard, startForecast } from "@/lib/rooms/forecast";

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    switch (body.action) {
      case "start":
        return Response.json(await startForecast(token, body.roomId, body));
      case "call":
        return Response.json(await makeCall(token, body.roomId, body.cardId, body.call));
      case "claim":
        return Response.json(await claimCard(token, body.roomId, body.cardId));
      case "rule":
        return Response.json(await ruleCard(token, body.roomId, body.cardId, body.outcome));
      case "end":
        return Response.json(await endForecast(token, body.roomId));
      default:
        throw new AuthError("invalid_request", 400);
    }
  } catch (err) {
    return errorResponse(err);
  }
}
