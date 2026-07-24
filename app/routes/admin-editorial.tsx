import { redirect } from "react-router";

export function loader() {
  return redirect("/admin/faq");
}

export default function AdminEditorialRedirect() {
  return null;
}
