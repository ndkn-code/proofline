import { describe, expect, it } from "vitest";
import { hashRecord, sha256 } from "../src/core/hash";
import { parseArticle } from "../src/core/ingest";
import { approve, evaluateGate, isApprovalValid, publishedHash } from "../src/core/review-gate";
import { loadAndIngest } from "../src/core/load";
import type { Finding } from "../src/core/types";
import { articleMd, mkArticle } from "./helpers";

const STEPS = ["Go to Payables > Payments > Manage Payments.", "Select Void and enter the void reason."];

describe("review gate", () => {
  it("publishes an article whose approval is bound to its exact hash", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const approvals = approve([], a, "AP Operations Supervisor", "2026-08-01");
    expect(approvals[0]!.draft_hash).toBe(a.hash);
    const g = evaluateGate(a, approvals, []);
    expect(g.status).toBe("published");
    expect(g.approvalValid).toBe(true);
  });

  it("invalidates the approval when the draft is edited, even by one character", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const approvals = approve([], a, "AP Operations Supervisor", "2026-08-01");
    const editedRaw = articleMd({ id: "A1", steps: STEPS }).replace("void reason.", "void reason!");
    const edited = parseArticle({ path: "A1.md", raw: editedRaw }, sha256);
    expect(edited.hash).not.toBe(a.hash);
    expect(isApprovalValid(approvals[0]!, edited.hash)).toBe(false);
    const g = evaluateGate(edited, approvals, []);
    expect(g.status).toBe("draft");
    expect(g.approvalInvalidatedFrom).toBe(a.hash);
    expect(g.reasons[0]).toContain("re-review");
  });

  it("re-approving the new hash publishes it again", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const edited = parseArticle({ path: "A1.md", raw: articleMd({ id: "A1", steps: [...STEPS, "Select Submit."] }) }, sha256);
    let approvals = approve([], a, "AP Operations Supervisor", "2026-08-01");
    approvals = approve(approvals, edited, "AP Operations Supervisor", "2026-09-01");
    expect(evaluateGate(edited, approvals, []).status).toBe("published");
  });

  it("puts an approved article that fails validation on HOLD and keeps the approval record", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const approvals = approve([], a, "AP Operations Supervisor", "2026-08-01");
    const finding: Finding = { code: "EXACT_VALUE_ALTERED", severity: "block", docId: "A1", lane: "job_aid", detail: "x" };
    const g = evaluateGate(a, approvals, [finding]);
    expect(g.status).toBe("held");
    expect(g.approval).not.toBeNull();
    expect(g.reasons[0]).toContain("EXACT_VALUE_ALTERED");
  });

  it("marks an approved but overdue article as stale, and warn findings do not hold", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const approvals = approve([], a, "AP Operations Supervisor", "2026-08-01");
    const stale: Finding = { code: "STALE_SOURCE", severity: "block", docId: "A1", lane: "job_aid", detail: "x" };
    const warn: Finding = { code: "RESTRICTED_DATA", severity: "warn", docId: "A1", lane: "job_aid", detail: "x" };
    expect(evaluateGate(a, approvals, [stale]).status).toBe("stale");
    expect(evaluateGate(a, approvals, [warn]).status).toBe("published");
  });

  it("never publishes a declared draft", () => {
    const a = mkArticle({ id: "A1", status: "draft", steps: STEPS });
    expect(evaluateGate(a, approve([], a, "x", "2026-08-01"), []).status).toBe("draft");
  });

  it("derives a deterministic published hash from source hash, draft hash and approval", () => {
    const a = mkArticle({ id: "A1", steps: STEPS });
    const ap = approve([], a, "AP Operations Supervisor", "2026-08-01")[0]!;
    const h1 = publishedHash(a, "src", ap, hashRecord);
    expect(publishedHash(a, "src", ap, hashRecord)).toBe(h1);
    expect(publishedHash(a, "other-src", ap, hashRecord)).not.toBe(h1);
  });

  it("in the seeded corpus, the post-approval edit to JA-GL-008 drops it to draft and held articles stay in the index", () => {
    const { index } = loadAndIngest();
    const gl8 = index.articles.find((a) => a.id === "JA-GL-008")!;
    expect(gl8.status).toBe("draft");
    expect(gl8.gate.approvalInvalidatedFrom).not.toBeNull();
    expect(gl8.provenance.publishedHash).toBeNull();
    const held = index.articles.filter((a) => a.status === "held");
    expect(held.length).toBeGreaterThan(0);
    for (const h of held) expect(h.provenance.publishedHash).not.toBeNull();
  });
});
