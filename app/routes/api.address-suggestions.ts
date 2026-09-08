import { z } from "zod";
import type { LoaderFunctionArgs } from "react-router";

const searchSchema = z.object({ q: z.string().trim().min(3).max(160), countryCode: z.literal("FR") });

type GeocodingResponse = { features?: Array<{ properties?: { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; label?: string } }> };

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({ q: url.searchParams.get("q"), countryCode: url.searchParams.get("countryCode") });
  if (!parsed.success) return Response.json({ suggestions: [] }, { headers: { "cache-control": "private, no-store" } });
  try {
    const upstream = await fetch(`https://data.geopf.fr/geocodage/search/?q=${encodeURIComponent(parsed.data.q)}&limit=5&type=housenumber`, { headers: { accept: "application/json" } });
    if (!upstream.ok) throw new Error("Address search unavailable");
    const data = await upstream.json() as GeocodingResponse;
    const suggestions = (data.features ?? []).flatMap(({ properties }) => {
      const line1 = [properties?.housenumber, properties?.street ?? properties?.name].filter(Boolean).join(" ").trim();
      const postalCode = properties?.postcode?.trim();
      const city = properties?.city?.trim();
      return line1 && postalCode && city ? [{ line1, postalCode, city, label: properties?.label ?? `${line1} ${postalCode} ${city}` }] : [];
    });
    return Response.json({ suggestions }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ suggestions: [] }, { headers: { "cache-control": "private, no-store" } });
  }
}
