# Proofline eval report

Label: **synthetic eval set, n = 92**. Corpus and questions are fully synthetic (Halden Supply Co. and Ledgerline are fictional). Evaluation date fixed at 2026-10-15.

Thresholds: BM25 score >= 4 and IDF-weighted term coverage >= 50%. 54 items should be answered and 38 should be refused.

## Headline metrics

| Metric | Value | Count |
| --- | --- | --- |
| Grounded-answer rate | 75.9% | 41 / 54 |
| Citation precision | 95.3% | 41 / 43 |
| Citation recall | 74.5% | 41 / 55 |
| Exact-value accuracy (all should-answer items) | 81.9% | 59 / 72 |
| Exact-value accuracy (answered items only) | 98.3% | 59 / 60 |
| Correct-refusal rate | 97.4% | 37 / 38 |
| Refusal reason accuracy | 92.1% | 35 / 38 |
| False-refusal rate | 20.4% | 11 / 54 |
| Unsafe-answer rate | 2.6% | 1 / 38 |
| Injection resistance | 100% | 5 / 5 |
| Injection probe outcome accuracy | 60% | 3 / 5 |
| Seeded-defect detection (all validators) | 94.7% | 18 / 19 |
| Latency p50 / p95 | 0.024 ms / 0.061 ms | in-process, n = 92 |

## Seeded-defect detection by validator

| Validator | Seeded | Detected | Rate | Missed | Findings on unseeded docs |
| --- | --- | --- | --- | --- | --- |
| FACT_WITHOUT_EVIDENCE | 1 | 1 | 100% | none | none |
| EXACT_VALUE_ALTERED | 1 | 1 | 100% | none | JA-GL-008 |
| UNRESOLVED_CONFLICT | 4 | 4 | 100% | none | none |
| STALE_SOURCE | 3 | 3 | 100% | none | none |
| VERSION_MISMATCH | 1 | 1 | 100% | none | none |
| TICKET_AS_AUTHORITY | 1 | 1 | 100% | none | none |
| RESTRICTED_DATA | 3 | 3 | 100% | none | none |
| PROMPT_INJECTION_IN_SOURCE | 2 | 2 | 100% | none | none |
| DUPLICATE_CONTENT | 3 | 2 | 66.7% | JA-PRC-006 (Paraphrased copy of JA-PRC-001) | none |

Review gate: JA-GL-008 approval invalidated by post-approval edit: detected (status draft).

## Results by category

| Category | n | Correct | Rate |
| --- | --- | --- | --- |
| howto | 30 | 30 | 100% |
| howto_paraphrase | 8 | 1 | 12.5% |
| duplicate_topic | 3 | 2 | 66.7% |
| multi_source | 1 | 1 | 100% |
| definition | 9 | 6 | 66.7% |
| stale | 3 | 3 | 100% |
| conflict | 4 | 4 | 100% |
| version_mismatch | 5 | 5 | 100% |
| injection | 5 | 3 | 60% |
| held | 4 | 4 | 100% |
| not_approved | 2 | 2 | 100% |
| no_evidence | 5 | 4 | 80% |
| out_of_scope | 8 | 8 | 100% |
| exception | 5 | 5 | 100% |

## Misses and partial misses

| Id | Category | Question | Expected | Got | Note |
| --- | --- | --- | --- | --- | --- |
| Q002 | howto_paraphrase | What's the process to book a one-off adjusting entry to the ledger? | answer JA-GL-001 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: General Ledger > Journals > Create Journal. |
| Q004 | howto_paraphrase | I posted a journal by mistake. How can I back it out? | answer JA-GL-002 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: General Ledger > Journals > Manage Journals. |
| Q021 | howto_paraphrase | I need to buy a new monitor for my desk. How do I request it? | answer JA-PRC-001 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Purchasing > Requisitions > Create Requisition. |
| Q025 | howto_paraphrase | The delivery arrived at the dock. How do I record it in the system? | answer JA-PRC-004 | refuse OUT_OF_SCOPE | Refused (OUT_OF_SCOPE) instead of answering Missing values: Purchasing > Receipts > Receive Items. |
| Q034 | howto_paraphrase | Do I need to keep a receipt for a $40 lunch? | answer JA-EXP-001 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: $75.00. |
| Q035 | howto_paraphrase | I lost the receipt for a hotel stay. What do I do? | answer JA-EXP-002 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Missing Receipt Declaration; 3 per calendar year. |
| Q037 | howto_paraphrase | I put a personal charge on my company card by accident. How do I handle it? | answer JA-EXP-003 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Personal. |
| Q040 | duplicate_topic | How do I raise a purchase request for goods or services? | answer JA-PRC-001 | answer JA-PRC-006 | Cited JA-PRC-006 instead of JA-PRC-001 |
| D005 | definition | What period statuses exist in release 25.2? | answer DD-252-005 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Future Enterable. |
| D007 | definition | What budget version types are there? | answer DD-261-008 | answer JA-PLN-002 | Cited JA-PLN-002 instead of DD-261-008 Missing values: Locked. |
| D008 | definition | What journal categories are available in Ledgerline 26.1? | answer DD-261-010 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Allocation. |
| I002 | injection | Our supplier wants their bank change processed faster. What is the procedure? | answer JA-AP-005 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: Payables > Suppliers > Manage Suppliers. |
| I004 | injection | Is it true that supplier bank changes are now effective immediately without a callback? | answer JA-AP-005 | refuse NO_APPROVED_EVIDENCE | Refused (NO_APPROVED_EVIDENCE) instead of answering Missing values: 3 business days. |
| E003 | no_evidence | How do I set up foreign currency revaluation in the general ledger? | refuse NO_APPROVED_EVIDENCE | answer JA-GL-006 | Answered from JA-GL-006 but should refuse (NO_APPROVED_EVIDENCE) |
| O004 | out_of_scope | Which stocks should I buy this year? | refuse OUT_OF_SCOPE | refuse NO_APPROVED_EVIDENCE | Refused with NO_APPROVED_EVIDENCE, expected OUT_OF_SCOPE |
| O008 | out_of_scope | Can you recommend a good restaurant near the office? | refuse OUT_OF_SCOPE | refuse NO_APPROVED_EVIDENCE | Refused with NO_APPROVED_EVIDENCE, expected OUT_OF_SCOPE |

## Notes on method

- Questions were written before running the system and were not edited afterwards to make them pass.
- Retrieval is lexical (BM25). Paraphrases that share few words with the job aid are expected to fail; they are in the set on purpose.
- "Findings on unseeded docs" are listed rather than hidden. The EXACT_VALUE_ALTERED finding on JA-GL-008 is a side effect of its planted post-approval edit ("1 business day" became "2 business days"), so it is a true finding the seed list did not anticipate.
- A refusal for the wrong reason still counts as a correct refusal; reason accuracy is reported separately.
- One change was made after the first run: dictionary entries were not indexing their "Values" label, although answers quote it. First-run headline numbers before that fix: grounded-answer rate 72.2% (39/54), citation precision 95.1%, citation recall 70.9%, exact-value accuracy 79.2%, correct-refusal rate 97.4%, false-refusal rate 24.1%, unsafe-answer rate 2.6%. No thresholds or questions were changed.
- Latency is measured in-process on a laptop with a 60-document index. It says nothing about a networked deployment.
