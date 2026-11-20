import type { ProfessionalDiscountTableContent } from "~/lib/professional-content";

export function ProfessionalDiscountTable({ content }: { content: ProfessionalDiscountTableContent }) {
  return <div className="professional-discount-table professional-discount-table--direct"><table><tbody>{content.tiers.map(({ quantity, discount }) => <tr key={quantity}><th scope="row">{quantity}</th><td><span aria-hidden="true">→</span><span>{discount}</span></td></tr>)}</tbody></table></div>;
}
