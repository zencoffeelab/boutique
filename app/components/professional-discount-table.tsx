export function ProfessionalDiscountTable({ english }: { english: boolean }) {
  const discounts = english
    ? [["1–5 kg", "Additional 10% off"], ["5–15 kg", "Additional 15% off"], ["15–30 kg", "Additional 20% off"], ["30–60 kg", "Additional 25% off"], ["60–100 kg", "Additional 30% off"]]
    : [["1–5 kg", "-10% supplémentaires"], ["5–15 kg", "-15% supplémentaires"], ["15–30 kg", "-20% supplémentaires"], ["30–60 kg", "-25% supplémentaires"], ["60–100 kg", "-30% supplémentaires"]];

  return <details className="professional-discount-table"><summary>{english ? "View the discount table" : "Voir le tableau des réductions"}</summary><table><caption>{english ? "N.B.: A 10% offer is already applied in the shop from 1 kg." : "N. B. : Une offre de -10% est déjà appliquée en boutique à partir du kg."}</caption><tbody>{discounts.map(([quantity, discount]) => <tr key={quantity}><th scope="row">{quantity}</th><td><span aria-hidden="true">→</span><span>{discount}</span></td></tr>)}</tbody></table></details>;
}
