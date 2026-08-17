import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export function loader({ request, params }: LoaderFunctionArgs) {
  const english = new URL(request.url).pathname.startsWith("/en/");
  return redirect(`${english ? "/en/blog" : "/blog"}${params.slug ? `/${params.slug}` : ""}`, 301);
}
