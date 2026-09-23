import type { LoaderFunctionArgs } from "react-router";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const headers = { "Cache-Control": "private, no-store" };
  if (admin.demo) return Response.json({ unread: 0 }, { headers });

  const client = createServiceSupabase();
  if (!client)
    return Response.json(
      { unread: 0, error: "Base de données indisponible." },
      { status: 503, headers },
    );

  const [applicationsResult, unreadMailResult] = await Promise.all([
    client
      .from("professional_applications")
      .select("email,status")
      .in("status", ["pending", "approved", "suspended"])
      .limit(1_000),
    client
      .from("admin_mail_messages")
      .select("sender_address")
      .eq("direction", "inbound")
      .eq("is_read", false)
      .limit(1_000),
  ]);
  if (applicationsResult.error)
    return Response.json(
      { unread: 0, error: applicationsResult.error.message },
      { status: 500, headers },
    );
  if (unreadMailResult.error)
    return Response.json(
      { unread: 0, error: unreadMailResult.error.message },
      { status: 500, headers },
    );

  const applications = applicationsResult.data ?? [];
  const professionalEmails = new Set(
    applications.map((application) => application.email.toLocaleLowerCase("en-US")),
  );
  const pendingApplications = applications.filter(
    (application) => application.status === "pending",
  ).length;
  const unreadProfessionalMessages = (unreadMailResult.data ?? []).filter(
    (message) =>
      professionalEmails.has(message.sender_address.toLocaleLowerCase("en-US")),
  ).length;

  return Response.json(
    { unread: Math.min(pendingApplications + unreadProfessionalMessages, 999) },
    { headers },
  );
}
