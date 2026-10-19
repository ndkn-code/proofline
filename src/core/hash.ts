// Node-only hashing helpers. The browser bundle never imports this file.
import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stable JSON serialization (sorted keys) so hashes of records are reproducible. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function hashRecord(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function short(hash: string | null | undefined, n = 12): string {
  return hash ? hash.slice(0, n) : "none";
}
