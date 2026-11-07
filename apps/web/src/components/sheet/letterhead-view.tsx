import { BRAND_LINE, footerLines, type SheetFrom } from "@/lib/sheet/document-sheet";
import {
  art,
  dividerShapes,
  DIVIDER_Y,
  EMBLEM,
  FOOTER_HEIGHT,
  footerShapes,
  headerShapes,
  PAGE,
  type Shape,
  stampLetters,
  stampShapes,
  STAMP_SIZE,
  WATERMARK,
  watermarkShapes,
  WORDMARK,
} from "@/lib/sheet/letterhead-art";

/*
 * The letterhead on screen, drawn from the same shapes as the PDFs
 * (lib/sheet/letterhead-art.ts): the teal band with emblem and wordmark, the
 * leaf divider, the rosette watermark, the footer band with the address and
 * contacts. Light on purpose, in the dark dashboard too: it is paper.
 */

export const sheetLabel = "text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#7C8A85]";

function SvgShape({ shape }: { shape: Shape }) {
  if (shape.kind === "ellipse") {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} transform={`rotate(${shape.rotate} ${shape.cx} ${shape.cy})`} fill="none" stroke={shape.stroke} strokeWidth={shape.width} />;
  }
  const paint = { fill: shape.fill ?? "none", stroke: shape.stroke, strokeWidth: shape.width, opacity: shape.opacity, strokeDasharray: shape.dash };
  return shape.kind === "path" ? <path d={shape.d} {...paint} /> : <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
}

const drawn = (list: Shape[]) => list.map((shape, index) => <SvgShape key={index} shape={shape} />);

const HEADER_BOX = DIVIDER_Y + 10;
const emblemSide = (EMBLEM.r - 4) * 2;

export function LetterheadView({
  from,
  overlay,
  className = "",
  children,
}: {
  from: SheetFrom;
  overlay?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const footer = footerLines(from);
  return (
    <article className={`relative overflow-hidden rounded-2xl bg-white text-[#111A17] shadow-xl ring-1 ring-white/20 ${className}`}>
      <svg aria-hidden viewBox={`0 0 ${PAGE.width} ${HEADER_BOX}`} className="block w-full">
        {drawn(headerShapes())}
        {drawn(dividerShapes())}
        <image href="/email/logo.png" x={EMBLEM.cx - emblemSide / 2} y={EMBLEM.cy - emblemSide / 2} width={emblemSide} height={emblemSide} />
        <text x={WORDMARK.left} y={WORDMARK.top + WORDMARK.size * 0.82} className="font-display" fontSize={WORDMARK.size} fontWeight={600} letterSpacing={2.6} fill={art.gold}>
          FOREST CREEK
        </text>
        <path d={`M ${WORDMARK.left + 2} ${WORDMARK.strapTop + 4} h 22`} stroke={art.gold} strokeWidth={0.8} />
        <text x={WORDMARK.left + 31} y={WORDMARK.strapTop + 6.4} fontSize={6.8} letterSpacing={2.8} fill={art.mist}>
          {BRAND_LINE.toUpperCase()}
        </text>
      </svg>
      <p className="sr-only">Forest Creek, {BRAND_LINE}</p>
      {overlay}
      <div className="relative">
        <svg
          aria-hidden
          viewBox={`${WATERMARK.cx - WATERMARK.r - 2} ${WATERMARK.cy - WATERMARK.r - 2} ${WATERMARK.r * 2 + 4} ${WATERMARK.r * 2 + 4}`}
          className="pointer-events-none absolute top-1/2 left-1/2 w-[68%] max-w-[26rem] -translate-x-1/2 -translate-y-1/2"
        >
          {drawn(watermarkShapes())}
        </svg>
        <div className="relative px-5 pb-10 sm:px-[9%]">{children}</div>
      </div>
      <footer className="relative px-4 pt-6 pb-4 text-center text-[0.7rem] leading-relaxed">
        <svg aria-hidden viewBox={`0 0 ${PAGE.width} ${FOOTER_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          {drawn(footerShapes())}
        </svg>
        <p className="relative flex flex-wrap items-center justify-center gap-x-2.5">
          <span style={{ color: art.gold }}>{footer.place}</span>
          {footer.email && (
            <>
              <Diamond />
              <span className="font-semibold text-white">{footer.email}</span>
            </>
          )}
        </p>
        {footer.contacts.length > 0 && (
          <p className="relative flex flex-wrap items-center justify-center gap-x-2.5 text-white">
            {footer.contacts.map((contact, index) => (
              <span key={contact} className="inline-flex items-center gap-x-2.5">
                {index > 0 && <Diamond />}
                {contact}
              </span>
            ))}
          </p>
        )}
      </footer>
    </article>
  );
}

function Diamond() {
  return <span aria-hidden className="inline-block size-1 rotate-45" style={{ backgroundColor: art.gold }} />;
}

/** The big title with its short underline, and a number on the right. */
export function SheetTitle({ title, numberLabel, number }: { title: string; numberLabel: string; number: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-4xl leading-none font-semibold tracking-wide sm:text-5xl">{title}</h3>
        <span aria-hidden className="mt-4 block h-1 w-10 bg-[#844F3E]" />
      </div>
      <div className="ml-auto text-right">
        <p className={sheetLabel}>{numberLabel}</p>
        <p className="mt-1 font-semibold tracking-wide">{number}</p>
      </div>
    </div>
  );
}

/** The lodge's round stamp, as on the letterhead. */
export function StampView({ className = "size-24" }: { className?: string }) {
  const letters = stampLetters();
  const glyphs = [...letters.top.map((glyph) => ({ ...glyph, size: 9.5 })), ...letters.bottom.map((glyph) => ({ ...glyph, size: 5.4 }))];
  return (
    <svg role="img" aria-label="Forest Creek stamp" viewBox={`0 0 ${STAMP_SIZE} ${STAMP_SIZE}`} className={className} opacity={0.88}>
      {drawn(stampShapes())}
      {glyphs.map((glyph, index) => (
        <text
          key={index}
          x={glyph.x}
          y={glyph.y + glyph.size * 0.35}
          transform={`rotate(${glyph.rotate} ${glyph.x} ${glyph.y})`}
          textAnchor="middle"
          fontSize={glyph.size}
          fontWeight={600}
          fill={art.stamp}
        >
          {glyph.character}
        </text>
      ))}
    </svg>
  );
}
