import { createServiceSupabase } from "~/lib/supabase.server";

/** Keeps scheduled work independent from rendering and e-mail delivery. */
export async function runCommerceMaintenance() {
  const client = createServiceSupabase();
  if (!client) return { available: false, releasedReservations: 0, expiredProfessionalQuotes: 0 };

  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [{ data: releasedReservations, error: reservationError }, { data: expiredProfessionalQuotes, error: quoteError }, { error: shippingQuoteError }] = await Promise.all([
    client.rpc("release_expired_reservations"),
    client.rpc("release_expired_professional_quotes"),
    client.from("shipping_quotes").delete().lt("expires_at", cutoff),
  ]);
  const error = reservationError ?? quoteError ?? shippingQuoteError;
  if (error) throw new Error(error.message);
  return { available: true, releasedReservations, expiredProfessionalQuotes };
}
