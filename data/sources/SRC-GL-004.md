---
id: SRC-GL-004
kind: procedure_capture
erp_release: 26.1
captured_by: Finance Systems (synthetic)
captured_on: 2026-09-08
---

# Procedure capture: Close an accounting period

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
