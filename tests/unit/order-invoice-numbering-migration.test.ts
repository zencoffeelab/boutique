import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(fileURLToPath(new URL("../../supabase/migrations/202608080001_align_order_invoice_numbers.sql", import.meta.url)), "utf8");

describe("matching order and invoice number migration", () => {
  it("uses a temporary reference before payment", () => {
    expect(migration).toContain("v_order_number text := 'ZCL-TMP-'");
  });

  it("allocates one transactional suffix to both final documents", () => {
    expect(migration).toContain("create table commerce_document_counters");
    expect(migration).toContain("on conflict (period) do update");
    expect(migration).toContain("v_order_number := 'ZCL-' || v_document_suffix");
    expect(migration).toContain("v_invoice := 'ZCL-F-' || v_document_suffix");
    expect(migration).toContain("order_number = v_order_number");
  });
});
