---
id: SOP-GL-004
doc_type: sop
title: Close an accounting period
module: General Ledger
erp_release: 26.1
owner_role: GL Accounting Lead
reviewed_on: 2026-09-08
review_due: 2027-03-08
status: published
source_id: SRC-GL-004
---

# Close an accounting period

## Purpose

Use this SOP to close a general ledger accounting period at month end in release 26.1.

## Before you start

- You need the Period Close Manager role.
- Every subledger must show Closed status for the period.

## Steps

1. Go to General Ledger > Period Close > Close Status.
2. Confirm Payables, Procurement and Expenses show Closed for the period.
3. Run the Unposted Journals report and resolve every item it lists.
4. Select the period and change the status from Open to Closed.
5. Select Run Close Checklist and attach the completed checklist to the close task.

## Notes

- In release 26.1 only the GL Accounting Lead can set the status Permanently Closed.
- The period close deadline is business day 4 at 17:00 Central.
