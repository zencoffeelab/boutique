import type { LoaderFunctionArgs } from "react-router";
import { env } from "~/lib/env.server";
import { runCommerceMaintenance } from "~/services/commerce-maintenance.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const config = env();
  const cronSecret = context.cloudflare.env.CRON_SECRET ?? config.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return new Response("Unauthorized.", { status: 401 });
  const maintenance = await runCommerceMaintenance();
  if (!maintenance.available) return new Response("Database unavailable.", { status: 503 });
  return Response.json({ ok: true, ...maintenance });
}
