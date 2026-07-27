import type { Locale, Product } from "~/domain/types";

const ignoredWords = new Set([
  "and",
  "de",
  "des",
  "du",
  "et",
  "la",
  "le",
  "les",
  "of",
  "the",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function words(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1 && !ignoredWords.has(word)),
  );
}

function textSimilarity(left: string, right: string): number {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftWords = words(left);
  const rightWords = words(right);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;

  let sharedWords = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) sharedWords += 1;
  }
  return sharedWords / Math.max(leftWords.size, rightWords.size);
}

function relatedProductScore(
  product: Product,
  candidate: Product,
  locale: Locale,
): number {
  const source = product.translations[locale];
  const target = candidate.translations[locale];
  const altitudeDifference = Math.abs(
    product.altitudeMeters - candidate.altitudeMeters,
  );
  const altitudeScore = Math.max(0, 2.5 - altitudeDifference / 400);

  return (
    textSimilarity(source.producer, target.producer) * 5 +
    textSimilarity(source.region, target.region) * 4 +
    textSimilarity(source.variety, target.variety) * 3.5 +
    textSimilarity(source.process, target.process) * 3 +
    altitudeScore
  );
}

export function getRelatedProducts(
  product: Product,
  candidates: readonly Product[],
  locale: Locale,
  limit = 3,
): Product[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== product.id && candidate.status === "published",
    )
    .map((candidate) => ({
      candidate,
      score: relatedProductScore(product, candidate, locale),
      altitudeDifference: Math.abs(
        product.altitudeMeters - candidate.altitudeMeters,
      ),
    }))
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        left.altitudeDifference - right.altitudeDifference ||
        left.candidate.translations[locale].name.localeCompare(
          right.candidate.translations[locale].name,
          locale,
        ),
    )
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
