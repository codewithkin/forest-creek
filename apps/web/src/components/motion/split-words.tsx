import type { CSSProperties } from "react";

/**
 * A headline whose words rise into place one after another. Pure CSS, so it
 * plays on first paint from the server with no hydration wait.
 */
export default function SplitWords({
  text,
  delayMs = 0,
  startIndex = 0,
}: {
  text: string;
  delayMs?: number;
  /** Continue the stagger from an earlier line of the same headline. */
  startIndex?: number;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          <span
            className="split-word"
            style={
              {
                "--word-index": startIndex + index,
                "--split-delay": `${delayMs}ms`,
              } as CSSProperties
            }
          >
            <span>{word}</span>
          </span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}
