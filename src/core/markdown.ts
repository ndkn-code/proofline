// Minimal front matter + section parser that keeps 1-based line numbers for locators. Isomorphic.
import type { ArticleLine, Section } from "./types";

export interface ParsedMarkdown {
  front: Record<string, string | string[]>;
  sections: Section[];
}

function parseValue(v: string): string | string[] {
  const t = v.trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    return t
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return t.replace(/^["']|["']$/g, "");
}

export function parseMarkdown(raw: string): ParsedMarkdown {
  const lines = raw.split("\n");
  const front: Record<string, string | string[]> = {};
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== "---") {
      const line = lines[i] ?? "";
      const idx = line.indexOf(":");
      if (idx > 0) front[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1));
      i++;
    }
    i++; // closing ---
  }

  const sections: Section[] = [];
  let current: Section | null = null;
  for (; i < lines.length; i++) {
    const text = lines[i] ?? "";
    const lineNo = i + 1;
    const h = /^##\s+(.*)$/.exec(text);
    if (h) {
      if (current) sections.push(current);
      current = { heading: (h[1] ?? "").trim(), lineStart: lineNo, lineEnd: lineNo, lines: [] };
      continue;
    }
    if (/^#\s+/.test(text)) continue; // document title line
    if (!current) {
      if (text.trim() === "") continue;
      current = { heading: "Overview", lineStart: lineNo, lineEnd: lineNo, lines: [] };
    }
    if (text.trim() === "") continue;
    const stepMatch = /^(\d+)\.\s+(.*)$/.exec(text.trim());
    const bullet = /^[-*]\s+(.*)$/.exec(text.trim());
    const body = stepMatch ? (stepMatch[2] ?? "") : bullet ? (bullet[1] ?? "") : text.trim();
    const entry: ArticleLine = { line: lineNo, text: body, step: stepMatch ? Number(stepMatch[1]) : null };
    current.lines.push(entry);
    current.lineEnd = lineNo;
  }
  if (current) sections.push(current);
  return { front, sections };
}

/** Full plain text of a parsed document (used for indexing and pattern scans). */
export function sectionText(sections: Section[]): string {
  return sections.map((s) => `${s.heading}\n${s.lines.map((l) => l.text).join("\n")}`).join("\n");
}
