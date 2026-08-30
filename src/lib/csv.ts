/** Shared CSV parsing for every bulk importer (athletes, program seeds). */

/** Minimal RFC4180-ish CSV parser: handles quoted fields, commas and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Header-name matcher used to auto-map columns. */
export function findHeader(headers: string[], hints: string[]): string {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const hint of hints) {
    const exact = lower.findIndex((h) => h === hint);
    if (exact !== -1) return headers[exact]!;
  }
  for (const hint of hints) {
    const partial = lower.findIndex((h) => h.includes(hint));
    if (partial !== -1) return headers[partial]!;
  }
  return "";
}
