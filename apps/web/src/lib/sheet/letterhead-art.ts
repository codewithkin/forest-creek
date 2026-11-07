/**
 * The Forest Creek letterhead the lodge supplied, as drawing data: the teal
 * band with its gold waves and leaves, the emblem ring, the leaf divider, the
 * rosette watermark, the footer band and the round stamp. Points on an A4 page
 * (595 x 842). The PDF (letterhead-pdf.tsx) and the screen (letterhead-view.tsx)
 * draw exactly these shapes, so they never disagree. Import-free.
 */

export const PAGE = { width: 595.28, height: 841.89 } as const;

export const art = {
  teal: "#0B3B3C",
  tealLight: "#10504E",
  gold: "#E8B23A",
  goldDeep: "#D9A12A",
  mist: "#DCE8E4",
  rule: "#2E7D6E",
  leaf: "#2E8B6E",
  sprig: "#8A9A55",
  sprigDark: "#5E8A5A",
  watermark: "#CFE2DE",
  watermarkGold: "#E2CF9E",
  stamp: "#3346B0",
} as const;

/** Where a page's own content may go: below the divider, above the footer band. */
export const BODY = { top: 178, bottom: 78, side: 54 } as const;
export const HEADER_HEIGHT = 140;
export const FOOTER_HEIGHT = 66;
export const DIVIDER_Y = 158;

/** The emblem, inside its gold ring. */
export const EMBLEM = { cx: 80, cy: 60, r: 50 } as const;
/** The wordmark and its strapline, right of the emblem. */
export const WORDMARK = { left: 158, top: 30, size: 40, strapTop: 82 } as const;

export type Shape =
  | { kind: "path"; d: string; fill?: string; stroke?: string; width?: number; opacity?: number; dash?: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; width?: number; opacity?: number; dash?: string }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate: number; stroke: string; width: number };

const round = (value: number) => Math.round(value * 100) / 100;

type Point = [number, number];
type Segment = { control: Point; to: Point };

/** A gentle wave from x0 to x1 around y, as quadratic segments. */
function waveSegments(y: number, amplitude: number, periods: number, x0 = 0, x1 = PAGE.width): Segment[] {
  const half = (x1 - x0) / (periods * 2);
  return Array.from({ length: periods * 2 }, (_, index) => {
    const start = x0 + index * half;
    const sign = index % 2 === 0 ? -1 : 1;
    return { control: [start + half / 2, y + sign * amplitude * 2], to: [start + half, y] };
  });
}

const q = ({ control, to }: Segment) => `Q ${round(control[0])} ${round(control[1])} ${round(to[0])} ${round(to[1])}`;

function waveLine(y: number, amplitude: number, periods: number): string {
  return [`M 0 ${round(y)}`, ...waveSegments(y, amplitude, periods).map(q)].join(" ");
}

/** A band between a straight edge (y = edge) and a wavy one at y. */
function waveBand(y: number, amplitude: number, periods: number, edge: number): string {
  const segments = waveSegments(y, amplitude, periods);
  const back = [...segments].reverse().map((segment, index, all) => q({ control: segment.control, to: index + 1 < all.length ? all[index + 1]!.to : [0, y] }));
  return [`M 0 ${edge}`, `L ${PAGE.width} ${edge}`, `L ${PAGE.width} ${round(y)}`, ...back, "Z"].join(" ");
}

function leaf(base: Point, angle: number, length: number, width: number): string {
  const [x, y] = base;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (along: number, across: number): Point => [x + along * cos - across * sin, y + along * sin + across * cos];
  const tip = at(length, 0);
  const left = at(length / 2, width);
  const right = at(length / 2, -width);
  return `M ${round(x)} ${round(y)} Q ${round(left[0])} ${round(left[1])} ${round(tip[0])} ${round(tip[1])} Q ${round(right[0])} ${round(right[1])} ${round(x)} ${round(y)} Z`;
}

/** A curved stem with leaves on alternate sides and one at the tip. */
function sprig(from: Point, to: Point, bend: number, leaves: number, length: number, width: number, colour: string, opacity: number): Shape[] {
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const span = Math.hypot(dx, dy);
  const control: Point = [mid[0] - (dy / span) * bend, mid[1] + (dx / span) * bend];
  const point = (t: number): Point => [
    (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t ** 2 * to[0],
    (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t ** 2 * to[1],
  ];
  const heading = (t: number) => Math.atan2(2 * (1 - t) * (control[1] - from[1]) + 2 * t * (to[1] - control[1]), 2 * (1 - t) * (control[0] - from[0]) + 2 * t * (to[0] - control[0]));
  const shapes: Shape[] = [
    { kind: "path", d: `M ${round(from[0])} ${round(from[1])} Q ${round(control[0])} ${round(control[1])} ${round(to[0])} ${round(to[1])}`, stroke: colour, width: 0.9, opacity },
  ];
  for (let index = 0; index < leaves; index++) {
    const t = (index + 1) / (leaves + 1);
    const side = index % 2 === 0 ? 1 : -1;
    shapes.push({ kind: "path", d: leaf(point(t), heading(t) + side * 0.85, length, width), fill: colour, opacity });
  }
  shapes.push({ kind: "path", d: leaf(to, heading(1), length * 0.9, width), fill: colour, opacity });
  return shapes;
}

/** The teal band: lighter circle, gold waves under it, leaves top right and by the emblem, the emblem's ring. */
export function headerShapes(): Shape[] {
  const edge = 118;
  return [
    { kind: "path", d: waveBand(edge, 4, 9, 0), fill: art.teal },
    { kind: "circle", cx: 548, cy: -38, r: 152, fill: art.tealLight },
    ...sprig([566, -4], [512, 78], -10, 8, 13, 3.6, art.sprig, 0.85),
    ...sprig([597, 34], [552, 122], -8, 8, 12, 3.4, art.sprig, 0.7),
    ...sprig([-2, 112], [26, 62], 6, 5, 11, 3.2, art.sprigDark, 0.75),
    { kind: "path", d: waveLine(edge + 4, 4, 9), stroke: art.gold, width: 2.4 },
    { kind: "path", d: waveLine(edge + 9.5, 4, 9), stroke: art.goldDeep, width: 0.8 },
    { kind: "circle", cx: EMBLEM.cx, cy: EMBLEM.cy, r: EMBLEM.r, fill: art.tealLight, stroke: art.gold, width: 3 },
  ];
}

/** The rule under the band: teal lines, gold ends, two leaves and a bud in the middle. */
export function dividerShapes(): Shape[] {
  const y = DIVIDER_Y;
  const mid = PAGE.width / 2;
  return [
    { kind: "path", d: `M ${BODY.side - 10} ${y} L ${round(mid - 36)} ${y}`, stroke: art.rule, width: 0.8 },
    { kind: "path", d: `M ${round(mid + 36)} ${y} L ${round(PAGE.width - BODY.side + 10)} ${y}`, stroke: art.rule, width: 0.8 },
    { kind: "path", d: `M ${BODY.side - 10} ${y + 2.6} L ${BODY.side + 16} ${y + 2.6}`, stroke: art.gold, width: 1.6 },
    { kind: "path", d: `M ${round(PAGE.width - BODY.side - 16)} ${y + 2.6} L ${round(PAGE.width - BODY.side + 10)} ${y + 2.6}`, stroke: art.gold, width: 1.6 },
    { kind: "path", d: leaf([mid, y], Math.PI, 26, 4.6), fill: art.leaf },
    { kind: "path", d: leaf([mid, y], 0, 26, 4.6), fill: art.leaf },
    { kind: "path", d: leaf([mid, y], -Math.PI / 2, 9, 3), fill: art.sprig },
    { kind: "circle", cx: mid, cy: y + 1.5, r: 1.8, fill: art.gold },
  ];
}

/** The rosette behind the words, faint enough to read through. */
export const WATERMARK = { cx: PAGE.width / 2, cy: 468, r: 205 } as const;

export function watermarkShapes(): Shape[] {
  const { cx, cy, r } = WATERMARK;
  const shapes: Shape[] = [
    { kind: "circle", cx, cy, r, stroke: art.watermark, width: 0.6 },
    { kind: "circle", cx, cy, r: r - 6, stroke: art.watermarkGold, width: 1.1, dash: "1 2.2" },
    { kind: "circle", cx, cy, r: r - 24, stroke: art.watermark, width: 1.1, dash: "1 2.2" },
    { kind: "circle", cx, cy, r: r - 30, stroke: art.watermark, width: 0.5 },
  ];
  for (let index = 0; index < 36; index++) {
    shapes.push({ kind: "ellipse", cx, cy, rx: r - 42, ry: 62, rotate: index * 5, stroke: art.watermark, width: 0.3 });
  }
  for (let index = 0; index < 30; index++) {
    const angle = (index * 12 * Math.PI) / 180;
    shapes.push({ kind: "circle", cx: round(cx + Math.cos(angle) * 80), cy: round(cy + Math.sin(angle) * 80), r: 80, stroke: art.watermark, width: 0.25 });
  }
  return shapes;
}

/** The footer band: a gold wave over teal, leaves in both corners. Drawn in a box FOOTER_HEIGHT tall. */
export function footerShapes(): Shape[] {
  const edge = 10;
  return [
    { kind: "path", d: waveBand(edge, 3.5, 9, FOOTER_HEIGHT), fill: art.teal },
    { kind: "path", d: waveLine(edge - 3.5, 3.5, 9), stroke: art.goldDeep, width: 2 },
    ...sprig([8, FOOTER_HEIGHT + 4], [112, 30], 8, 7, 11, 3, art.sprigDark, 0.6),
    ...sprig([PAGE.width - 8, FOOTER_HEIGHT + 4], [PAGE.width - 112, 30], -8, 7, 11, 3, art.sprigDark, 0.6),
  ];
}

/** Characters spaced around a circle: the stamp's lettering. Angles in degrees, 0 at the top, clockwise. */
export function lettersOnCircle(text: string, cx: number, cy: number, radius: number, centreAngle: number, spread: number, inward = true) {
  const characters = [...text];
  const step = characters.length > 1 ? spread / (characters.length - 1) : 0;
  const start = centreAngle - spread / 2;
  return characters.map((character, index) => {
    const angle = inward ? start + index * step : centreAngle + spread / 2 - index * step;
    const radians = ((angle - 90) * Math.PI) / 180;
    return { character, x: round(cx + Math.cos(radians) * radius), y: round(cy + Math.sin(radians) * radius), rotate: round(inward ? angle : angle + 180) };
  });
}

/** The lodge's round stamp, drawn in a 100 x 100 box: two rings, the name over the top, the strapline under, stars, a mountain and river. */
export const STAMP_SIZE = 100;

export function stampShapes(): Shape[] {
  const c = STAMP_SIZE / 2;
  return [
    { kind: "circle", cx: c, cy: c, r: 48, stroke: art.stamp, width: 2.4 },
    { kind: "circle", cx: c, cy: c, r: 31, stroke: art.stamp, width: 1.2 },
    { kind: "circle", cx: c, cy: c - 9, r: 7, fill: art.stamp, opacity: 0.85 },
    { kind: "path", d: `M ${c - 22} ${c + 6} L ${c - 6} ${c - 12} L ${c + 2} ${c - 3} L ${c + 9} ${c - 10} L ${c + 22} ${c + 6} Z`, fill: art.stamp },
    { kind: "path", d: `M ${c - 20} ${c + 12} Q ${c - 8} ${c + 7} ${c} ${c + 12} T ${c + 20} ${c + 12}`, stroke: art.stamp, width: 1.6 },
    { kind: "path", d: `M ${c - 16} ${c + 18} Q ${c - 6} ${c + 13} ${c + 2} ${c + 18} T ${c + 16} ${c + 18}`, stroke: art.stamp, width: 1.4 },
    { kind: "path", d: star(c - 39, c, 3.2), fill: art.stamp },
    { kind: "path", d: star(c + 39, c, 3.2), fill: art.stamp },
  ];
}

export function stampLetters() {
  const c = STAMP_SIZE / 2;
  return {
    top: lettersOnCircle("FOREST CREEK", c, c, 37, 0, 118),
    bottom: lettersOnCircle("WHERE NATURE MEETS LUXURY", c, c, 41.5, 180, 128, false),
  };
}

function star(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? r : r * 0.45;
    const angle = (index * Math.PI) / 5 - Math.PI / 2;
    return `${round(cx + Math.cos(angle) * radius)} ${round(cy + Math.sin(angle) * radius)}`;
  });
  return `M ${points.join(" L ")} Z`;
}
