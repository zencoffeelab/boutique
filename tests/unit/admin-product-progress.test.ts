// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdminProductSaveControl,
  adminProductProgressMessage,
  isAdminProductImageUpload,
} from "~/routes/admin-product";

afterEach(cleanup);

describe("admin product progress", () => {
  it("describes the long-running product operation", () => {
    expect(adminProductProgressMessage("save_product")).toBe("Enregistrement du produit…");
    expect(adminProductProgressMessage("upload_media")).toBe("Import de l’image…");
    expect(adminProductProgressMessage("save_editorial_block")).toBe("Enregistrement du bloc éditorial…");
    expect(adminProductProgressMessage("upload_thumbnail_label")).toBe("Création de la miniature…");
    expect(adminProductProgressMessage("upload_hover_image")).toBe("Import de l’image de survol…");
    expect(adminProductProgressMessage("delete_hover_image")).toBe("Suppression de l’image de survol…");
    expect(adminProductProgressMessage("unknown")).toBe("Modification en cours…");
  });

  it("identifies the operations that transfer an image", () => {
    expect(isAdminProductImageUpload("upload_media")).toBe(true);
    expect(isAdminProductImageUpload("upload_thumbnail_label")).toBe(true);
    expect(isAdminProductImageUpload("upload_hover_image")).toBe(true);
    expect(isAdminProductImageUpload("save_product")).toBe(false);
    expect(isAdminProductImageUpload("delete_media")).toBe(false);
  });

  it("disables save during an image upload and explains a blocked click", () => {
    render(createElement(AdminProductSaveControl, {
      demo: false,
      modifying: true,
      pendingIntent: "upload_media",
    }));

    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Import de la photo en cours");

    fireEvent.click(screen.getByRole("button", { name: "Pourquoi l’enregistrement est indisponible" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossible d’enregistrer maintenant : une photo est en cours d’import",
    );
  });
});
