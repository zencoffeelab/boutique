import { describe, expect, it } from "vitest";
import { adminProductProgressMessage } from "~/routes/admin-product";

describe("admin product progress", () => {
  it("describes the long-running product operation", () => {
    expect(adminProductProgressMessage("save_product")).toBe("Enregistrement du produit…");
    expect(adminProductProgressMessage("upload_media")).toBe("Import de l’image…");
    expect(adminProductProgressMessage("save_editorial_block")).toBe("Enregistrement du bloc éditorial…");
    expect(adminProductProgressMessage("unknown")).toBe("Modification en cours…");
  });
});
