import Stripe from "stripe";
import type { ActionFunctionArgs } from "react-router";
import { refundSchema } from "~/domain/schemas";
import { requireAdmin } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request); const raw = request.headers.get("content-type")?.includes("application/json") ? await request.json().catch(() => null) : Object.fromEntries(await request.formData()); const parsed = refundSchema.safeParse(raw);
  if (!parsed.success || !params.id) return Response.json({ ok: false, message: "Invalid refund." }, { status: 422 });
  const config = env(); const client = createServiceSupabase();
  if (!client || !config.STRIPE_SECRET_KEY) return Response.json({ ok: false, message: "Refund service unavailable." }, { status: 503 });
  const { data: payment } = await client.from("payments").select("*").eq("order_id", params.id).in("status", ["paid", "partially_refunded"]).maybeSingle();
  if (!payment?.provider_payment_intent_id || parsed.data.amountCents > payment.amount_cents - payment.refunded_cents) return Response.json({ ok: false, message: "Refund exceeds the refundable balance." }, { status: 409 });
  const refund = await new Stripe(config.STRIPE_SECRET_KEY).refunds.create({ payment_intent: payment.provider_payment_intent_id, amount: parsed.data.amountCents, reason: "requested_by_customer", metadata: { order_id: params.id, internal_reason: parsed.data.reason } }, { idempotencyKey: `refund:${params.id}:${payment.refunded_cents}:${parsed.data.amountCents}` });
  const snapshot = { stripe_refund_id: refund.id, amount_cents: parsed.data.amountCents, reason: parsed.data.reason };
  const { error } = await client.from("credit_notes").upsert({ order_id: params.id, provider_refund_id: refund.id, amount_cents: parsed.data.amountCents, reason: parsed.data.reason, immutable_snapshot: snapshot }, { onConflict: "provider_refund_id", ignoreDuplicates: true });
  if (error) return Response.json({ ok: false, message: "Refund created but credit note could not be recorded." }, { status: 500 });
  await client.from("audit_log").insert({ actor_id: admin.id === "demo-admin" ? null : admin.id, action: "order.refund_requested", entity_type: "order", entity_id: params.id, after_data: snapshot });
  return Response.json({ ok: true, refundId: refund.id });
}
