import type { SupabaseClient } from "@supabase/supabase-js";

export async function countUnreadNonSpamMail(client: SupabaseClient) {
  const { data: spamLabel, error: spamLabelError } = await client
    .from("admin_mail_labels")
    .select("id")
    .eq("name", "Spam")
    .maybeSingle();
  if (spamLabelError) return { count: 0, error: spamLabelError };

  let query = client
    .from("admin_mail_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_read", false);
  if (spamLabel?.id) query = query.or(`label_id.is.null,label_id.neq.${spamLabel.id}`);

  const { count, error } = await query;
  return { count: count ?? 0, error };
}
