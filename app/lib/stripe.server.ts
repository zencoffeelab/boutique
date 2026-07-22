import Stripe from "stripe";

export function createStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Zen Coffee Lab" },
  });
}

export function constructStripeEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  webhookSecret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(
    payload,
    signature,
    webhookSecret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}
