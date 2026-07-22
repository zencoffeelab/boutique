import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { LabelRefundError, requestOrRefreshLabelRefund } from "~/services/label-refunds.server";

const paramsSchema = z.object({ orderId: z.uuid(), shipmentId: z.uuid() });

export async function action({ request, params }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  if (request.method !== "POST") return Response.json({ ok: false, message: "Méthode non autorisée." }, { status: 405 });
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return Response.json({ ok: false, message: "Colis invalide." }, { status: 422 });
  try {
    const refund = await requestOrRefreshLabelRefund({ ...parsed.data, adminId: admin.id });
    return Response.json({ ok: refund.status !== "ERROR", refund, message: refund.message });
  } catch (cause) {
    const status = cause instanceof LabelRefundError ? cause.status : 500;
    const message = cause instanceof Error ? cause.message : "Le remboursement de l’étiquette a échoué.";
    console.error("shippo_label_refund_failed", { orderId: parsed.data.orderId, shipmentId: parsed.data.shipmentId, status, message });
    return Response.json({ ok: false, message }, { status });
  }
}
