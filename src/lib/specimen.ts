/** Specimen signature SVG for signatories (handwriting-style font, deterministic per PRNG). */
import type { Rng } from './prng';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Specimen signature: the signatory's name in a handwriting-style font with an underline flourish. */
export function specimenSvg(name: string, rng: Rng): string {
  const parts = name.split(' ');
  const text = parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
  const rot = rng.int(-7, 1);
  const size = rng.int(26, 31);
  const y = rng.int(54, 60);
  const c1 = rng.int(30, 70);
  const c2 = rng.int(40, 75);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80">` +
    `<text x="18" y="46" transform="rotate(${rot} 120 40)" font-family="'Segoe Script','Brush Script MT','Snell Roundhand','Apple Chancery',cursive" font-style="italic" font-size="${size}" fill="#1e2a4a">${escapeXml(text)}</text>` +
    `<path d="M20 ${y} C 80 ${c1}, 140 ${c2 + 20}, 222 ${y - 6}" stroke="#1e2a4a" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}
