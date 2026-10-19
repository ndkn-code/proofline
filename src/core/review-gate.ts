// Review gate. An approval is bound to one exact draft hash. Any edit produces a new hash and
// the old approval no longer applies. Published articles that fail validation go on HOLD; they are
// never deleted, so the record of what was approved stays auditable.
import type { Approval, Article, Finding, GateResult } from "./types";

export type RecordHasher = (value: unknown) => string;

/** Record an approval for the exact draft the reviewer saw. Returns a new approvals list. */
export function approve(approvals: Approval[], article: Pick<Article, "meta" | "hash">, reviewerRole: string, approvedOn: string): Approval[] {
  const rest = approvals.filter((a) => !(a.article_id === article.meta.id && a.draft_hash === article.hash));
  return [...rest, { article_id: article.meta.id, draft_hash: article.hash, reviewer_role: reviewerRole, approved_on: approvedOn }];
}

export function findApproval(approvals: Approval[], articleId: string, draftHash: string): Approval | null {
  return approvals.find((a) => a.article_id === articleId && a.draft_hash === draftHash) ?? null;
}

export function isApprovalValid(approval: Approval | null, currentHash: string): boolean {
  return approval !== null && approval.draft_hash === currentHash;
}

/**
 * Decide the effective status of an article.
 * draft:    declared draft, or no approval bound to the current hash
 * stale:    approved, but the review date has passed (and nothing else blocks it)
 * held:     approved, but a blocking validator finding exists
 * published: approved and clean
 */
export function evaluateGate(article: Pick<Article, "meta" | "hash">, approvals: Approval[], findings: Finding[]): GateResult {
  const id = article.meta.id;
  const bound = findApproval(approvals, id, article.hash);
  const anyForArticle = approvals.filter((a) => a.article_id === id);
  const invalidatedFrom = !bound && anyForArticle.length ? (anyForArticle[anyForArticle.length - 1]?.draft_hash ?? null) : null;
  const blocking = findings.filter((f) => f.docId === id && f.severity === "block");
  const reasons: string[] = [];

  if (article.meta.status === "draft") {
    reasons.push("Declared as draft. Not submitted for review.");
    return { status: "draft", approval: null, approvalValid: false, approvalInvalidatedFrom: null, reasons };
  }
  if (!bound) {
    reasons.push(
      invalidatedFrom
        ? `Approval was bound to draft ${invalidatedFrom.slice(0, 12)} but the current draft is ${article.hash.slice(0, 12)}. The edit invalidated the approval; re-review is required.`
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
export function publishedHash(article: Pick<Article, "meta" | "hash">, sourceHash: string | null, approval: Approval, hashRecord: RecordHasher): string {
  return hashRecord({
    article_id: article.meta.id,
    source_hash: sourceHash,
    draft_hash: article.hash,
    reviewer_role: approval.reviewer_role,
    approved_on: approval.approved_on,
  });
}
