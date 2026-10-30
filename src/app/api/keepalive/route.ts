// Daily keepalive, called by the Vercel cron in vercel.json.
// Supabase pauses free projects that see too little database activity over
// seven days; one REST read a day through the API keeps it awake.
// Vercel sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.

import { headers } from "next/headers";
import { serviceClient } from "@/lib/supabase/server";

export async function GET() {
  // Reading request headers makes this run per request rather than at build.
  const authorization = (await headers()).get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authorization !== `Bearer ${secret}`) {
    return new Response("unauthorised", { status: 401 });
  }

  const { error } = await serviceClient().from("families").select("id").limit(1);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}
