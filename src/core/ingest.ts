// Ingestion: parse raw files into typed records, hash every version, and build the corpus index.
// Hashing is injected so this module stays testable and free of Node-only imports.
import { parseMarkdown } from "./markdown";
import type {
  Approval,
  Sop,
  SopFrontMatter,
  CorpusIndex,
  DictionaryEntry,
  Finding,
  IndexedSop,
  IndexedDictionaryEntry,
  IndexedTicket,
  Module,
  SourceDoc,
  Ticket,
} from "./types";
import { MODULES } from "./types";
import { runValidators, redactRestricted } from "./validators";
import { evaluateGate, publishedHash } from "./review-gate";

export type Hasher = (text: string) => string;
export type RecordHasher = (value: unknown) => string;

export interface RawFile {
  path: string;
  raw: string;
}

function str(v: string | string[] | undefined, field: string, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new Error(`${path}: missing front matter field "${field}"`);
  return v;
}

export function parseSopMarkdown(file: RawFile, hash: Hasher): Sop {
  const { front, sections } = parseMarkdown(file.raw);
  const module = str(front.module, "module", file.path) as Module;
  if (!MODULES.includes(module)) throw new Error(`${file.path}: unknown module ${module}`);
  const status = str(front.status, "status", file.path);
  if (status !== "published" && status !== "draft") throw new Error(`${file.path}: bad status ${status}`);
  const meta: SopFrontMatter = {
    id: str(front.id, "id", file.path),
    doc_type: front.doc_type === "knowledge_article" ? "knowledge_article" : "sop",
    title: str(front.title, "title", file.path),
    module,
    erp_release: str(front.erp_release, "erp_release", file.path),
    owner_role: str(front.owner_role, "owner_role", file.path),
    reviewed_on: str(front.reviewed_on, "reviewed_on", file.path),
    review_due: str(front.review_due, "review_due", file.path),
    status,
  };
  if (typeof front.source_id === "string") meta.source_id = front.source_id;
  if (Array.isArray(front.dictionary_refs)) meta.dictionary_refs = front.dictionary_refs;
  const metaLines: Record<string, { page: number; line: number }> = {};
  file.raw.split("\n").forEach((l, i) => {
    const k = /^([a-z_]+):/.exec(l)?.[1];
    if (k && !(k in metaLines)) metaLines[k] = { page: 1, line: i + 1 };
  });
  return { meta, path: file.path, format: "markdown", raw: file.raw, hash: hash(file.raw), pages: 1, sections, metaLines };
}

export function parseSource(file: RawFile, hash: Hasher): SourceDoc {
  const { front, sections } = parseMarkdown(file.raw);
  return { id: str(front.id, "id", file.path), path: file.path, raw: file.raw, hash: hash(file.raw), sections };
}

export interface IngestInput {
  /** SOPs already extracted and parsed from their PDFs (see src/pdf and load.ts). */
  sops: Sop[];
  sources: RawFile[];
  dictionary: RawFile[];
  tickets: RawFile;
  approvals: Approval[];
  asOf: string;
  currentRelease: string;
  releases: string[];
}

export interface IngestOutput {
  index: CorpusIndex;
  sops: Sop[];
  sources: SourceDoc[];
}

export function ingest(input: IngestInput, hash: Hasher, hashRecord: RecordHasher): IngestOutput {
  const sops = [...input.sops].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  const sources = input.sources.map((f) => parseSource(f, hash));
  const dictionary: IndexedDictionaryEntry[] = input.dictionary
    .map((f) => {
      const e = JSON.parse(f.raw) as DictionaryEntry;
      return { ...e, hash: hash(f.raw), path: f.path };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const ticketsRaw = JSON.parse(input.tickets.raw) as Ticket[];
  const tickets: Ticket[] = ticketsRaw.map((t) => ({ ...t, hash: hashRecord(t) }));

  const findings: Finding[] = runValidators({
    sops,
    sources,
    dictionary,
    tickets,
    asOf: input.asOf,
  });

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const indexedSops: IndexedSop[] = sops.map((a) => {
    const own = findings.filter((f) => f.docId === a.meta.id);
    const gate = evaluateGate(a, input.approvals, own);
    const src = a.meta.source_id ? sourceById.get(a.meta.source_id) : undefined;
    const dup = own.find((f) => f.code === "DUPLICATE_CONTENT");
    return {
      id: a.meta.id,
      title: a.meta.title,
      module: a.meta.module,
      erp_release: a.meta.erp_release,
      owner_role: a.meta.owner_role,
      reviewed_on: a.meta.reviewed_on,
      review_due: a.meta.review_due,
      declared_status: a.meta.status,
      status: gate.status,
      doc_type: a.meta.doc_type,
      path: a.path,
      pages: a.pages,
      provenance: {
        sourceId: a.meta.source_id ?? null,
        sourceHash: src?.hash ?? null,
        draftHash: a.hash,
        publishedHash: gate.approvalValid && gate.approval ? publishedHash(a, src?.hash ?? null, gate.approval, hashRecord) : null,
      },
      gate,
      findings: own,
      sections: a.sections,
      duplicateOf: dup?.relatedId ?? null,
    };
  });

  const indexedTickets: IndexedTicket[] = tickets.map((t) => {
    const flagged = [...new Set(findings.filter((f) => f.docId === t.id).map((f) => f.code))];
    return {
      ...t,
      hash: t.hash ?? hashRecord(t),
      flagged,
      redacted: {
        subject: redactRestricted(t.subject),
        description: redactRestricted(t.description),
        resolution: redactRestricted(t.resolution),
      },
    };
  });

  const versions = [
    ...sops.map((a) => ({ kind: a.format === "pdf" ? "sop_pdf" : "sop", id: a.meta.id, hash: a.hash })),
    ...sources.map((s) => ({ kind: "source", id: s.id, hash: s.hash })),
    ...dictionary.map((d) => ({ kind: "dictionary", id: d.id, hash: d.hash })),
    ...indexedTickets.map((t) => ({ kind: "ticket", id: t.id, hash: t.hash })),
  ];

  return {
    sops,
    sources,
    index: {
      generated_from: "data/pdf (SOP PDFs), data/sources, data/dictionary, data/tickets (synthetic corpus)",
      as_of: input.asOf,
      current_release: input.currentRelease,
      releases: input.releases,
      sops: indexedSops,
      dictionary,
      tickets: indexedTickets,
      findings,
      versions,
    },
  };
}
