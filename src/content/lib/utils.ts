export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string, max: number): string {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size) || 1);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}

export function fieldValues($form: any, field: string): string[] {
  try {
    return $form.field(field).data("value") || [];
  } catch {
    return [];
  }
}

function cleanLine(field: string, line: string): string {
  const text = String(line)
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
  if (!text || field === "search_queries") {
    return text;
  }
  return text
    .replace(/^https?:\/\//i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^s\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

export function dedupe(field: string, lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const value = cleanLine(field, line);
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}
