import { ShieldCheck, ShieldOff } from "lucide-react";
import { useFetcher } from "react-router";

type RoleResponse = { ok?: boolean; message?: string };

export function AdminMemberRoleForm({ memberId, role, currentAdminId, memberLabel }: { memberId: string; role: "customer" | "admin"; currentAdminId: string; memberLabel: string }) {
  const fetcher = useFetcher<RoleResponse>();
  const busy = fetcher.state !== "idle";
  const self = memberId === currentAdminId;
  const promoting = role !== "admin";
  const label = promoting ? "Passer administrateur" : self ? "Administrateur actuel" : "Retirer les droits admin";

  return <div className="admin-member-role-control">
    <fetcher.Form
      method="post"
      action={`/api/admin/members/${memberId}/role`}
      onSubmit={(event) => {
        const question = promoting
          ? `Donner les droits administrateur à ${memberLabel} ?`
          : `Retirer les droits administrateur de ${memberLabel} ?`;
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      <input type="hidden" name="role" value={promoting ? "admin" : "customer"} />
      <button className={`ui-button ui-button--sm ${promoting ? "ui-button--outline" : "ui-button--danger"}`} type="submit" disabled={busy || self}>
        {promoting ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}{label}
      </button>
    </fetcher.Form>
    {fetcher.data?.message ? <small className={fetcher.data.ok ? "form-message" : "form-message form-error"} role="status">{fetcher.data.message}</small> : null}
  </div>;
}
