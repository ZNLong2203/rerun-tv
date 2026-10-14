/**
 * chrF (Popović, 2015): F-score over character n-grams, the usual automatic
 * check for translation when the languages differ in word boundaries. Spaces
 * are removed, as in the reference implementation; β = 2 weights recall.
 */

function ngrams(text: string, n: number): Map<string, number> {
  const chars = [...text.replace(/\s+/g, "")];
  const out = new Map<string, number>();
  for (let i = 0; i + n <= chars.length; i++) {
    const g = chars.slice(i, i + n).join("");
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** chrF in [0, 100] for one hypothesis against one reference. */
export function chrf(hypothesis: string, reference: string, maxN = 6, beta = 2): number {
  let precision = 0;
  let recall = 0;
  let orders = 0;
  for (let n = 1; n <= maxN; n++) {
    const h = ngrams(hypothesis.toLowerCase(), n);
    const r = ngrams(reference.toLowerCase(), n);
    const hTotal = [...h.values()].reduce((a, b) => a + b, 0);
    const rTotal = [...r.values()].reduce((a, b) => a + b, 0);
    if (hTotal === 0 || rTotal === 0) continue;
    let match = 0;
    for (const [g, c] of h) match += Math.min(c, r.get(g) ?? 0);
    precision += match / hTotal;
    recall += match / rTotal;
    orders++;
  }
  if (orders === 0) return 0;
  const p = precision / orders;
  const r = recall / orders;
  if (p + r === 0) return 0;
  const b2 = beta * beta;
  return (100 * ((1 + b2) * p * r)) / (b2 * p + r);
}

/** Overlap in seconds between two time ranges. */
export function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}
