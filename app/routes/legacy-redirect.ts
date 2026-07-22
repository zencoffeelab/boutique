import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export function loader({ request, params }: LoaderFunctionArgs) {
  const pathname = new URL(request.url).pathname;
  const english = pathname.startsWith("/en/");
  return redirect(`${english ? "/en/shop" : "/boutique"}/${params.slug ?? ""}`, 301);
}
