import { ArrowDown, ArrowUp, GripVertical, Save, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Form } from "react-router";
import {
  cloneSiteNavigation,
  getSiteNavigationItem,
  siteNavigationItems,
  type NavigationItemKey,
  type SiteNavigationConfiguration,
} from "~/lib/site-navigation";

type NavigationPlacement =
  | { area: "palette" }
  | { area: "menu" }
  | { area: "footer"; columnId: string };

type DragPayload = NavigationPlacement & { key: NavigationItemKey };

function placedItems(configuration: SiteNavigationConfiguration, placement: Exclude<NavigationPlacement, { area: "palette" }>) {
  if (placement.area === "menu") return configuration.menu;
  return configuration.footerColumns.find((column) => column.id === placement.columnId)?.items ?? [];
}

export function AdminNavigationOrganizer({
  initialConfiguration,
  demo,
}: {
  initialConfiguration: SiteNavigationConfiguration;
  demo: boolean;
}) {
  const [configuration, setConfiguration] = useState(() => cloneSiteNavigation(initialConfiguration));
  const draggedItem = useRef<DragPayload | null>(null);

  const beginDrag = (event: DragEvent<HTMLElement>, payload: DragPayload) => {
    if (demo) return;
    draggedItem.current = payload;
    event.dataTransfer.effectAllowed = payload.area === "palette" ? "copy" : "move";
    event.dataTransfer.setData("application/x-zcl-navigation", JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", payload.key);
  };

  const payloadFrom = (event: DragEvent<HTMLElement>) => {
    const serialized = event.dataTransfer.getData("application/x-zcl-navigation");
    if (serialized) {
      try {
        return JSON.parse(serialized) as DragPayload;
      } catch {
        return draggedItem.current;
      }
    }
    return draggedItem.current;
  };

  const place = (
    event: DragEvent<HTMLElement>,
    target: Exclude<NavigationPlacement, { area: "palette" }>,
    beforeKey?: NavigationItemKey,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = payloadFrom(event);
    if (!payload || demo) return;
    if (target.area === "menu" && getSiteNavigationItem(payload.key).footerOnly) return;

    setConfiguration((current) => {
      const next = cloneSiteNavigation(current);
      if (payload.area === "menu") next.menu = next.menu.filter((key) => key !== payload.key);
      if (payload.area === "footer") {
        const source = next.footerColumns.find((column) => column.id === payload.columnId);
        if (source) source.items = source.items.filter((key) => key !== payload.key);
      }

      if (target.area === "menu") {
        next.menu = next.menu.filter((key) => key !== payload.key);
        const targetIndex = beforeKey ? next.menu.indexOf(beforeKey) : -1;
        next.menu.splice(targetIndex >= 0 ? targetIndex : next.menu.length, 0, payload.key);
      } else {
        const column = next.footerColumns.find((candidate) => candidate.id === target.columnId);
        if (!column) return current;
        column.items = column.items.filter((key) => key !== payload.key);
        const targetIndex = beforeKey ? column.items.indexOf(beforeKey) : -1;
        column.items.splice(targetIndex >= 0 ? targetIndex : column.items.length, 0, payload.key);
      }
      return next;
    });
    draggedItem.current = null;
  };

  const remove = (placement: Exclude<NavigationPlacement, { area: "palette" }>, key: NavigationItemKey) => {
    setConfiguration((current) => {
      const next = cloneSiteNavigation(current);
      if (placement.area === "menu") next.menu = next.menu.filter((candidate) => candidate !== key);
      else {
        const column = next.footerColumns.find((candidate) => candidate.id === placement.columnId);
        if (column) column.items = column.items.filter((candidate) => candidate !== key);
      }
      return next;
    });
  };

  const move = (placement: Exclude<NavigationPlacement, { area: "palette" }>, key: NavigationItemKey, direction: -1 | 1) => {
    setConfiguration((current) => {
      const next = cloneSiteNavigation(current);
      const items = placedItems(next, placement);
      const currentIndex = items.indexOf(key);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return current;
      [items[currentIndex], items[targetIndex]] = [items[targetIndex], items[currentIndex]];
      return next;
    });
  };

  const updateColumnTitle = (columnId: string, locale: "fr-FR" | "en-GB", title: string) => {
    setConfiguration((current) => {
      const next = cloneSiteNavigation(current);
      const column = next.footerColumns.find((candidate) => candidate.id === columnId);
      if (column) column.titles[locale] = title;
      return next;
    });
  };

  const renderPlacedItem = (
    key: NavigationItemKey,
    placement: Exclude<NavigationPlacement, { area: "palette" }>,
    index: number,
  ) => {
    const item = getSiteNavigationItem(key);
    const items = placedItems(configuration, placement);
    return <li
      className="admin-navigation-item"
      draggable={!demo}
      onDragStart={(event) => beginDrag(event, { ...placement, key })}
      onDragEnd={() => { draggedItem.current = null; }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => place(event, placement, key)}
      key={key}
    >
      <GripVertical aria-hidden="true" />
      <span><strong>{item.adminLabel}</strong>{item.footerOnly ? <small>Bloc dynamique</small> : null}</span>
      <div className="admin-navigation-item__actions">
        <button type="button" disabled={demo || index === 0} onClick={() => move(placement, key, -1)} aria-label={`Remonter ${item.adminLabel}`}><ArrowUp aria-hidden="true" /></button>
        <button type="button" disabled={demo || index === items.length - 1} onClick={() => move(placement, key, 1)} aria-label={`Descendre ${item.adminLabel}`}><ArrowDown aria-hidden="true" /></button>
        <button type="button" disabled={demo} onClick={() => remove(placement, key)} aria-label={`Retirer ${item.adminLabel}`}><Trash2 aria-hidden="true" /></button>
      </div>
    </li>;
  };

  return <Form method="post" className="admin-navigation-organizer">
    <input type="hidden" name="intent" value="save_navigation" />
    <input type="hidden" name="configuration" value={JSON.stringify(configuration)} />
    <section className="ui-card admin-navigation-palette" aria-labelledby="navigation-pages-title">
      <div>
        <p className="eyebrow">Pages disponibles</p>
        <h2 id="navigation-pages-title">Éléments à placer</h2>
        <p>Glissez une page dans le menu ou dans une colonne du footer. Une même page peut être présente dans les deux zones.</p>
      </div>
      <ul>
        {siteNavigationItems.map((item) => <li
          className="admin-navigation-palette__item"
          draggable={!demo}
          onDragStart={(event) => beginDrag(event, { area: "palette", key: item.key })}
          onDragEnd={() => { draggedItem.current = null; }}
          key={item.key}
        >
          <GripVertical aria-hidden="true" />
          <span><strong>{item.adminLabel}</strong>{item.footerOnly ? <small>Footer uniquement</small> : <small>Page</small>}</span>
        </li>)}
      </ul>
    </section>

    <section className="ui-card admin-navigation-preview" aria-labelledby="navigation-menu-title">
      <div className="admin-navigation-preview__heading">
        <div><p className="eyebrow">Header</p><h2 id="navigation-menu-title">Menu principal</h2></div>
        <p>Le logo, la langue, le panier et le compte restent fixes.</p>
      </div>
      <ul
        className="admin-navigation-dropzone admin-navigation-dropzone--menu"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => place(event, { area: "menu" })}
        aria-label="Pages du menu principal"
      >
        {configuration.menu.map((key, index) => renderPlacedItem(key, { area: "menu" }, index))}
        {configuration.menu.length === 0 ? <li className="admin-navigation-empty">Déposez des pages dans le menu</li> : null}
      </ul>
    </section>

    <section className="ui-card admin-footer-organizer" aria-labelledby="navigation-footer-title">
      <div className="admin-navigation-preview__heading">
        <div><p className="eyebrow">Pied de page</p><h2 id="navigation-footer-title">Footer · 3 colonnes</h2></div>
        <p>Le manifeste, les mentions de bas de page et Instagram restent fixes.</p>
      </div>
      <div className="admin-footer-organizer__columns">
        {configuration.footerColumns.map((column) => <section className="admin-footer-column" key={column.id}>
          <div className="admin-footer-column__titles">
            <label>Nom français<input value={column.titles["fr-FR"]} maxLength={60} required disabled={demo} onChange={(event) => updateColumnTitle(column.id, "fr-FR", event.currentTarget.value)} /></label>
            <label>Nom anglais<input value={column.titles["en-GB"]} maxLength={60} required disabled={demo} onChange={(event) => updateColumnTitle(column.id, "en-GB", event.currentTarget.value)} /></label>
          </div>
          <ul
            className="admin-navigation-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => place(event, { area: "footer", columnId: column.id })}
            aria-label={`Pages de la colonne ${column.titles["fr-FR"] || column.id}`}
          >
            {column.items.map((key, index) => renderPlacedItem(key, { area: "footer", columnId: column.id }, index))}
            {column.items.length === 0 ? <li className="admin-navigation-empty">Déposez des pages dans cette colonne</li> : null}
          </ul>
        </section>)}
      </div>
    </section>

    <div className="admin-navigation-organizer__actions">
      <button className="ui-button ui-button--default" type="submit" disabled={demo}><Save aria-hidden="true" /> Enregistrer le rangement</button>
    </div>
  </Form>;
}
