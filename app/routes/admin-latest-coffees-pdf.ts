import type { LoaderFunctionArgs } from "react-router";
import { getLatestPublishedProducts } from "~/lib/catalog.server";
import { requireAdmin } from "~/lib/auth.server";
import { renderLatestCoffeesPdf } from "~/services/latest-coffees-pdf.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const products = await getLatestPublishedProducts(4);
  if (products.length === 0) return new Response("Aucun café publié.", { status: 404 });
  const pdf = await renderLatestCoffeesPdf(products);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=dernieres-sorties-zen-coffee-lab.pdf",
      "cache-control": "private, no-store",
    },
  });
}
