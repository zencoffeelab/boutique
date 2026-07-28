const hexPair = (value: number) => Math.round(value).toString(16).padStart(2, "0");

type ColorBucket = { count: number; red: number; green: number; blue: number; chroma: number };

export function dominantLabelColor(pixels: Uint8ClampedArray) {
  const buckets = new Map<number, ColorBucket>();
  let fallbackCount = 0;
  let fallbackRed = 0;
  let fallbackGreen = 0;
  let fallbackBlue = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 96) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;

    if (maximum > 30 && !(minimum > 240 && maximum > 248)) {
      fallbackCount += 1;
      fallbackRed += red;
      fallbackGreen += green;
      fallbackBlue += blue;
    }
    if (chroma < 28 || maximum < 45 || (minimum > 225 && maximum > 242)) continue;

    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0, chroma: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.chroma += chroma;
    buckets.set(key, bucket);
  }

  const dominant = Array.from(buckets.values()).reduce<ColorBucket | null>((best, bucket) => {
    if (!best) return bucket;
    const score = bucket.count * (1 + bucket.chroma / bucket.count / 64);
    const bestScore = best.count * (1 + best.chroma / best.count / 64);
    return score > bestScore ? bucket : best;
  }, null);

  if (dominant) {
    return `#${hexPair(dominant.red / dominant.count)}${hexPair(dominant.green / dominant.count)}${hexPair(dominant.blue / dominant.count)}`;
  }
  if (fallbackCount > 0) {
    return `#${hexPair(fallbackRed / fallbackCount)}${hexPair(fallbackGreen / fallbackCount)}${hexPair(fallbackBlue / fallbackCount)}`;
  }
  return "#d9ddd3";
}
