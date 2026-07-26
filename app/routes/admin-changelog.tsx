import { CalendarDays, GitCommitHorizontal, History } from "lucide-react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { siteChangelog, type ChangelogEntry } from "~/data/site-changelog";
import { requireAdmin } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return null;
}

export const meta: MetaFunction = () => [
  { title: "Journal des modifications | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

const groupedChanges = siteChangelog.reduce<Array<{ date: string; entries: ChangelogEntry[] }>>((groups, entry) => {
  const current = groups.at(-1);
  if (current?.date === entry.date) current.entries.push(entry);
  else groups.push({ date: entry.date, entries: [entry] });
  return groups;
}, []);

const formatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function AdminChangelog() {
  const categoryCount = new Set(siteChangelog.map((entry) => entry.kind)).size;
  return <AdminShell active="changelog">
    <header className="admin-heading">
      <div>
        <p className="eyebrow">Suivi du site</p>
        <h1>Journal des modifications</h1>
        <p className="admin-heading__description">Historique des fonctionnalités, corrections, évolutions graphiques et changements de configuration de la boutique.</p>
      </div>
    </header>

    <section className="stats-grid" aria-label="Résumé du journal">
      <article className="ui-card stat-card"><History aria-hidden="true" /><span><strong>{siteChangelog.length}</strong><small>modifications recensées</small></span></article>
      <article className="ui-card stat-card"><CalendarDays aria-hidden="true" /><span><strong>{groupedChanges.length}</strong><small>journées d’évolution</small></span></article>
      <article className="ui-card stat-card"><GitCommitHorizontal aria-hidden="true" /><span><strong>{categoryCount}</strong><small>catégories de changement</small></span></article>
    </section>

    <p className="admin-notice changelog-notice">Ce journal décrit les évolutions du site. Les actions quotidiennes sur les commandes, produits et comptes restent consignées séparément dans le journal d’audit technique.</p>

    <div className="changelog-timeline">
      {groupedChanges.map((group) => <section className="changelog-day" key={group.date} aria-labelledby={`changes-${group.date}`}>
        <header className="changelog-day__heading">
          <time id={`changes-${group.date}`} dateTime={group.date}>{formatter.format(new Date(`${group.date}T12:00:00`))}</time>
          <span>{group.entries.length} modification{group.entries.length > 1 ? "s" : ""}</span>
        </header>
        <div className="changelog-day__entries">
          {group.entries.map((entry, index) => <article className="ui-card changelog-entry" key={entry.id}>
            <span className="changelog-entry__marker" aria-hidden="true">{String(group.entries.length - index).padStart(2, "0")}</span>
            <div>
              <div className="changelog-entry__meta">
                <span className={`ui-badge changelog-kind changelog-kind--${kindClass(entry.kind)}`}>{entry.kind}</span>
                {entry.reference ? <code title="Référence Git">{entry.reference}</code> : <span className="ui-badge changelog-kind changelog-kind--pending">Récent</span>}
              </div>
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
            </div>
          </article>)}
        </div>
      </section>)}
    </div>
  </AdminShell>;
}

function kindClass(kind: ChangelogEntry["kind"]) {
  return kind.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
