// Review gate. An approval is bound to one exact draft hash. Any edit produces a new hash and
// the old approval no longer applies. Published SOPs that fail validation go on HOLD; they are
// never deleted, so the record of what was approved stays auditable.
import type { Approval, Sop, Finding, GateResult } from "./types";

export type RecordHasher = (value: unknown) => string;

/** Record an approval for the exact draft the reviewer saw. Returns a new approvals list. */
export function approve(approvals: Approval[], sop: Pick<Sop, "meta" | "hash">, reviewerRole: string, approvedOn: string): Approval[] {
  const rest = approvals.filter((a) => !(a.doc_id === sop.meta.id && a.draft_hash === sop.hash));
  return [...rest, { doc_id: sop.meta.id, draft_hash: sop.hash, reviewer_role: reviewerRole, approved_on: approvedOn }];
}

export function findApproval(approvals: Approval[], docId: string, draftHash: string): Approval | null {
  return approvals.find((a) => a.doc_id === docId && a.draft_hash === draftHash) ?? null;
}

export function isApprovalValid(approval: Approval | null, currentHash: string): boolean {
  return approval !== null && approval.draft_hash === currentHash;
}

/**
 * Decide the effective status of an SOP.
 * draft:    declared draft, or no approval bound to the current hash
 * stale:    approved, but the review date has passed (and nothing else blocks it)
 * held:     approved, but a blocking validator finding exists
 * published: approved and clean
 */
export function evaluateGate(sop: Pick<Sop, "meta" | "hash">, approvals: Approval[], findings: Finding[]): GateResult {
  const id = sop.meta.id;
  const bound = findApproval(approvals, id, sop.hash);
  const anyForSop = approvals.filter((a) => a.doc_id === id);
  const invalidatedFrom = !bound && anyForSop.length ? (anyForSop[anyForSop.length - 1]?.draft_hash ?? null) : null;
  const blocking = findings.filter((f) => f.docId === id && f.severity === "block");
  const reasons: string[] = [];

  if (sop.meta.status === "draft") {
    reasons.push("Declared as draft. Not submitted for review.");
    return { status: "draft", approval: null, approvalValid: false, approvalInvalidatedFrom: null, reasons };
  }
  if (!bound) {
    reasons.push(
      invalidatedFrom
        ? `Approval was bound to draft ${invalidatedFrom.slice(0, 12)} but the current draft is ${sop.hash.slice(0, 12)}. The edit invalidated the approval; re-review is required.`
        : "No approval is bound to the current draft hash.",
    );
    return { status: "draft", approval: null, approvalValid: false, approvalInvalidatedFrom: invalidatedFrom, reasons };
  }
  const nonStale = blocking.filter((f) => f.code !== "STALE_SOURCE");
  if (nonStale.length) {
    for (const f of nonStale) reasons.push(`${f.code}: ${f.detail}`);
    return { status: "held", approval: bound, approvalValid: true, approvalInvalidatedFrom: null, reasons };
  }
  if (blocking.some((f) => f.code === "STALE_SOURCE")) {
    reasons.push("Review date has passed. Excluded from answering until re-reviewed.");
    return { status: "stale", approval: bound, approvalValid: true, approvalInvalidatedFrom: null, reasons };
  }
  return { status: "published", approval: bound, approvalValid: true, approvalInvalidatedFrom: null, reasons };
}

/** Published hash closes the provenance chain: source hash -> draft hash -> published hash. */
export function publishedHash(sop: Pick<Sop, "meta" | "hash">, sourceHash: string | null, approval: Approval, hashRecord: RecordHasher): string {
  return hashRecord({
    doc_id: sop.meta.id,
    source_hash: sourceHash,
    draft_hash: sop.hash,
    reviewer_role: approval.reviewer_role,
    approved_on: approval.approved_on,
  });
}
