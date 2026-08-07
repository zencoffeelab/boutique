import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCheckoutOrderNumber = vi.hoisted(() => vi.fn());

vi.mock("~/services/checkout.server", () => ({
  isTemporaryOrderNumber: (value: string | null | undefined) => Boolean(value?.startsWith("ZCL-TMP-")),
  resolveCheckoutOrderNumber,
}));

import { loader } from "~/routes/confirmation";

describe("order confirmation numbering", () => {
  beforeEach(() => resolveCheckoutOrderNumber.mockReset());

  it("shows the definitive order number resolved from the paid Stripe session", async () => {
    resolveCheckoutOrderNumber.mockResolvedValue("ZCL-202608-000001");

    const result = await loader({ request: new Request("https://www.zencoffeelab.com/commande/confirmation?session_id=cs_live_123"), params: {}, context: {} } as never);

    expect(resolveCheckoutOrderNumber).toHaveBeenCalledWith("cs_live_123");
    expect(result).toMatchObject({ order: "ZCL-202608-000001", paymentConfirmed: true, orderNumberPending: false });
  });

  it("never exposes a temporary checkout reference while the webhook is finishing", async () => {
    resolveCheckoutOrderNumber.mockResolvedValue(null);

    const result = await loader({ request: new Request("https://www.zencoffeelab.com/commande/confirmation?order=ZCL-TMP-ABC&session_id=cs_live_123"), params: {}, context: {} } as never);

    expect(result).toMatchObject({ order: null, paymentConfirmed: true, orderNumberPending: true });
  });

  it("keeps demo and legacy confirmation links compatible", async () => {
    const result = await loader({ request: new Request("http://localhost:5173/commande/confirmation?order=ZCL-DEMO-1234"), params: {}, context: {} } as never);

    expect(resolveCheckoutOrderNumber).not.toHaveBeenCalled();
    expect(result).toMatchObject({ order: "ZCL-DEMO-1234", paymentConfirmed: true, orderNumberPending: false });
  });
});
