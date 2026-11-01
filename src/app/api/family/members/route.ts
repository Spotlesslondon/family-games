// GET  /api/family/members?code=ABCDEF: names in a family, for "who is playing".
// POST /api/family/members: the owner adds a member (Authorization: Bearer).

import { bearer, errorResponse, readJson } from "@/lib/auth/http";
import { addMember, AuthError, listMembers } from "@/lib/auth/service";

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code");
    return Response.json(await listMembers(code));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearer(request);
    if (!token) throw new AuthError("not_signed_in", 401);
    const body = await readJson(request);
    const member = await addMember(token, {
      name: body.name,
      dateOfBirth: body.dateOfBirth,
      pin: body.pin,
      role: body.role,
    });
    return Response.json({ member });
  } catch (err) {
    return errorResponse(err);
  }
}
