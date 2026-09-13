---
name: Shared business data
description: Cross-device persistence and migration rules for the automotive ledger.
---

Business records are authoritative in PostgreSQL; browser localStorage is only a legacy migration source and backup, not a live source of truth.

**Why:** Separate phone and computer browser stores caused records to disappear across devices.

**How to apply:** Load vehicles, donors, expenses, sales, and parts from the API initially, after mutations, and when the window regains focus. Do not use periodic polling that makes the page appear to reload. Legacy imports must be additive, preserve empty arrays and stored rows, and never write server snapshots back over local backups.

Part edits use version checks and deleted legacy parts use tombstones so stale browsers cannot silently overwrite or resurrect records.

**Why:** A stale legacy import previously recreated deleted parts with new QR identifiers; silent last-write-wins could also diverge devices.

**How to apply:** Keep QR/public IDs stable, require the current version for updates, and retain tombstones during import/delete flows.