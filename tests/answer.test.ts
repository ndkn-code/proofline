import { describe, expect, it } from "vitest";
import { createAnswerer } from "../src/core/answer";
import { loadAndIngest } from "../src/core/load";

const { index } = loadAndIngest();
const ask = createAnswerer(index).ask;

describe("answerer", () => {
  it("answers extractively: every step is a verbatim line of a published article at the cited line", () => {
    const r = ask("How do I void a supplier payment?");
    expect(r.kind).toBe("answer");
    for (const s of r.steps) {
      const c = r.citations[s.citation - 1]!;
      expect(s.text).toBe(c.quote);
      const art = index.articles.find((a) => a.id === c.docId)!;
      expect(art.status).toBe("published");
      const line = art.sections.flatMap((x) => x.lines).find((l) => l.line === c.locator.lineStart)!;
      expect(line.text).toBe(c.quote);
    }
  });

  it("returns at most five eligible candidates", () => {
    expect(ask("How do I enter a supplier invoice?").candidates.length).toBeLessThanOrEqual(5);
  });

  it("refuses with the conflict reason when the best evidence is in conflict", () => {
    const r = ask("When does the planning cycle lock?");
    expect(r.kind).toBe("refusal");
    expect(r.refusal?.reason).toBe("CONFLICTING_EVIDENCE");
  });

  it("never cites a ticket and never surfaces the injected ticket", () => {
    const r = ask("A supplier sent new bank details. How do I update them?");
    expect(r.citations.every((c) => c.lane !== "ticket")).toBe(true);
    expect(r.relatedTickets.some((t) => t.id === "TCK-0037")).toBe(false);
  });

  it("routes exception requests to a human", () => {
    expect(ask("Can you approve my expense report?").refusal?.reason).toBe("EXCEPTION_REQUIRES_HUMAN");
  });
});
