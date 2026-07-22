import { describe, expect, it } from "vitest";
import { action } from "~/routes/api.admin-shipment-label-refund";

describe("admin label refund route", () => {
  it("only accepts POST requests", async () => {
    const response = await action({
      request: new Request("http://localhost/api/admin/orders/00000000-0000-4000-8000-000000000001/shipments/00000000-0000-4000-8000-000000000002/refund-label"),
      params: { orderId: "00000000-0000-4000-8000-000000000001", shipmentId: "00000000-0000-4000-8000-000000000002" }, context: {},
    } as never);
    expect(response.status).toBe(405);
  });

  it("rejects invalid order and shipment identifiers before calling Shippo", async () => {
    const response = await action({ request: new Request("http://localhost/refund-label", { method: "POST" }), params: { orderId: "invalid", shipmentId: "invalid" }, context: {} } as never);
    expect(response.status).toBe(422);
  });
});
