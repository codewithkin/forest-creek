type Cell = string | number | null | undefined;

/**
 * Rows to CSV text. A text cell starting with = + - or @ gets a leading quote
 * mark, or a spreadsheet would run a guest's typed name as a formula.
 */
export function toCsv(rows: Cell[][]): string {
  const cell = (value: Cell) => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  const url = URL.createObjectURL(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
