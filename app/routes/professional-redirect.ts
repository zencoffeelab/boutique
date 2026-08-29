import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const english = new URL(request.url).pathname.startsWith("/en/");
  return redirect(english ? "/en/professional" : "/professionnel", 301);
}
