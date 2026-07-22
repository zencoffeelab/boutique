import type { LoaderFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";
import { processNotificationQueue } from "~/services/notifications.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const config = env(); if (!config.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${config.CRON_SECRET}`) return new Response("Unauthorized.", { status: 401 });
  const client = createServiceSupabase(); if (!client) return new Response("Database unavailable.", { status: 503 });
  const { data: released, error } = await client.rpc("release_expired_reservations"); if (error) throw new Response(error.message, { status: 500 });
  const notifications = await processNotificationQueue(); await client.from("shipping_quotes").delete().lt("expires_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  return Response.json({ ok: true, releasedReservations: released, notifications });
}
