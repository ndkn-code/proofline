---
id: SOP-AP-003
doc_type: sop
title: Release an invoice from a matching hold
module: Accounts Payable
erp_release: 26.1
owner_role: AP Operations Supervisor
reviewed_on: 2026-09-02
review_due: 2027-03-02
status: published
source_id: SRC-AP-003
---

# Release an invoice from a matching hold

## Purpose

Use this SOP to clear a matching hold so an invoice can be paid.

## Steps

1. Go to Payables > Invoices > Holds Workbench.
2. Filter by hold code, for example QTY, PRC or RCV.
3. Open the invoice and review the hold reason.
4. Resolve the cause first: post the receipt, correct the PO price or update the invoice quantity.
5. Select Validate. The hold releases automatically when the cause is resolved.

## Notes

- Only the AP Operations Supervisor can manually release a PRC hold.
- Holds older than 30 days appear on the weekly hold aging report.
