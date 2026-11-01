// POST /api/family: create a family and its owner, and sign the owner in.

import { errorResponse, rateLimit, readJson, setRefreshCookie } from "@/lib/auth/http";
import { createFamily } from "@/lib/auth/service";

export async function POST(request: Request) {
  try {
    await rateLimit(request, "familyCreate");
    const body = await readJson(request);
    const signedIn = await createFamily({
      familyName: body.familyName,
      name: body.name,
      dateOfBirth: body.dateOfBirth,
      pin: body.pin,
    });
    await setRefreshCookie(signedIn.refreshToken);
    return Response.json({
      accessToken: signedIn.accessToken,
      expiresAt: signedIn.expiresAt,
      member: signedIn.member,
      family: signedIn.family,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
