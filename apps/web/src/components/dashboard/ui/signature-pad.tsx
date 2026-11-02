"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A guest signs with a finger, a stylus or the mouse. Ink is dark on white,
 * as on paper, and the drawing comes out as a PNG data URL (cropped to what
 * was drawn) through onChange; clearing hands back undefined.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | undefined) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [signed, setSigned] = useState(false);

  // Sharp on high-density screens: the bitmap matches the device's pixels.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = element.getBoundingClientRect();
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    const context = element.getContext("2d")!;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
    context.strokeStyle = "#111A17";
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const grow = (x: number, y: number) => {
    const b = bounds.current;
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };

  function exportImage() {
    const element = canvas.current;
    if (!element) return;
    const ratio = element.width / element.getBoundingClientRect().width;
    const b = bounds.current;
    const pad = 8;
    const x = Math.max(0, (b.minX - pad) * ratio);
    const y = Math.max(0, (b.minY - pad) * ratio);
    const width = Math.min(element.width - x, (b.maxX - b.minX + pad * 2) * ratio);
    const height = Math.min(element.height - y, (b.maxY - b.minY + pad * 2) * ratio);
    // Cropped and scaled down to at most 600px wide: small enough to keep with the card.
    const scale = Math.min(1, 600 / width);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(width * scale));
    out.height = Math.max(1, Math.round(height * scale));
    out.getContext("2d")!.drawImage(element, x, y, width, height, 0, 0, out.width, out.height);
    onChange(out.toDataURL("image/png"));
  }

  function clear() {
    const element = canvas.current;
    if (!element) return;
    element.getContext("2d")!.clearRect(0, 0, element.width, element.height);
    bounds.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setSigned(false);
    onChange(undefined);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvas}
          aria-label="Sign here"
          className="block h-44 w-full touch-none cursor-crosshair"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            last.current = point(event);
            grow(last.current.x, last.current.y);
          }}
          onPointerMove={(event) => {
            if (!drawing.current || !last.current) return;
            const next = point(event);
            const context = event.currentTarget.getContext("2d")!;
            context.beginPath();
            context.moveTo(last.current.x, last.current.y);
            context.lineTo(next.x, next.y);
            context.stroke();
            grow(next.x, next.y);
            last.current = next;
            if (!signed) setSigned(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
            if (bounds.current.maxX > bounds.current.minX) exportImage();
          }}
        />
        {!signed && (
          <span className="pointer-events-none absolute inset-x-0 bottom-10 mx-8 border-t border-[#111A17]/30 pt-1 text-center text-xs text-[#7C8A85]">
            Guest signs here
          </span>
        )}
      </div>
      <button type="button" onClick={clear} disabled={!signed} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Eraser className="size-3.5" aria-hidden />
        Clear and sign again
      </button>
    </div>
  );
}
