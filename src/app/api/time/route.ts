// The server's clock, so a phone can line its Nerve pot up with the server's.
// No sign-in needed: it says nothing but the time.

import { connection } from "next/server";

export async function GET() {
  await connection(); // the time at the request, never a time saved at build
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
