import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { cartLineSchema } from "~/domain/schemas";
import type { Audience } from "~/domain/types";
import { getAudience } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { env } from "~/lib/env.server";

const previewSchema = z.object({
  locale: z.enum(["fr-FR", "en-GB"]),
  lines: z.array(cartLineSchema).max(100),
});

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Invalid cart." }, { status: 422 });

  const authorizedAudience = await getAudience(request);
  const requestedAudiences = [...new Set(parsed.data.lines.map((line) => line.audience))]
    .filter((audience): audience is Audience => audience === "retail" || authorizedAudience === "professional");
  const catalogs = await Promise.all(requestedAudiences.map(async (audience) => ({
    audience,
    products: await getProducts({ status: "published", audience }),
  })));
  const productsByAudience = new Map(catalogs.map(({ audience, products }) => [audience, new Map(products.map((product) => [product.id, product]))]));

  const lines = parsed.data.lines.flatMap((line) => {
    const product = productsByAudience.get(line.audience)?.get(line.productId);
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
    const offer = variant?.offers.find((candidate) => candidate.audience === line.audience && candidate.active);
    if (!product || !variant || !offer) return [];
    return [{
      productId: line.productId,
      variantId: line.variantId,
      audience: line.audience,
      quantity: line.quantity,
      productSlug: product.slug,
      productName: product.translations[parsed.data.locale].name,
      variantLabel: variant.label,
      unitPriceCents: offer.price.amount,
      availableStock: variant.stockOnHand - variant.stockReserved,
      imageUrl: product.media[0]?.url ?? "",
    }];
  });
  const resolvedKeys = new Set(lines.map((line) => `${line.variantId}:${line.audience}`));
  const unavailableKeys = parsed.data.lines
    .map((line) => `${line.variantId}:${line.audience}`)
    .filter((key) => !resolvedKeys.has(key));

  return Response.json({
    ok: true,
    lines,
    unavailableKeys,
    freeShippingFranceThresholdCents: env().FREE_SHIPPING_FR_CENTS,
  }, { headers: { "cache-control": "private, no-store" } });
}
