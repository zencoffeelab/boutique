import type { ProfessionalDiscountTableContent } from "~/lib/professional-content";

export function ProfessionalDiscountTable({ content }: { content: ProfessionalDiscountTableContent }) {
  return <details className="professional-discount-table"><summary>{content.summary}</summary><table><caption>{content.note}</caption><tbody>{content.tiers.map(({ quantity, discount }) => <tr key={quantity}><th scope="row">{quantity}</th><td><span aria-hidden="true">→</span><span>{discount}</span></td></tr>)}</tbody></table></details>;
}
