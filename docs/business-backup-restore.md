# Business analytics backup and restore

`backupStore()` now includes the legacy `scrollshow_state` snapshot and all 14 `ss_business_*` tables. A read-only repeatable-read transaction captures a consistent database state, including project and user deletion fences. SQL rows are written to encrypted `business-part-00000.enc` segments, bounded to 4 MB of row JSON and 500 rows per part. Every part is read back and checked before the encrypted manifest is committed. Missing schema, oversized rows or capacity exhaustion fail the backup explicitly. The manifest records counts for every table, including empty tables.

All business segments follow the existing 30-day private-blob retention policy. The existing `BACKUP_ENCRYPTION_KEY` encrypts the complete archive; it is separate from the business-connection credential encryption key. A completed backup reports `businessCovered: true`, `businessRows` and `businessParts`. Archives created before this feature have no business section and cannot recover those SQL records.

## Explicit restore

Use a fresh isolated target database. Apply the legacy and business schema before attempting a business restore. Set `DATABASE_URL` (and optionally the direct `DATABASE_URL_UNPOOLED`) to that target, and supply the archive's `BACKUP_ENCRYPTION_KEY` securely in the process environment.

Download `manifest.enc` and all referenced media and business parts into one directory, or set a separate `RESTORE_SOURCE_BLOB_TOKEN` for reading the source archive. If the archive contains media, set `RESTORE_TARGET_BLOB_TOKEN` for an explicitly chosen target media bucket.

Run the existing tool with the additional business-schema acknowledgment:

```sh
npx tsx scripts/restore-backup.ts /absolute/path/manifest.enc \
  --confirm-empty-target --confirm-business-schema-migrated \
  --confirm-target-media-store
```

`--confirm-target-media-store` is required only for archives containing media. No live restore was executed while implementing this support.

The tool refuses nonempty target SQL tables. Missing, corrupted, swapped or truncated business parts abort the same transaction that restores the legacy store. Provider connections restore as disconnected with credentials and webhook secrets removed; ingestion keys are revoked; links and bio pages are disabled; publication tracking-coverage timestamps are cleared to avoid claiming continuity across the restore gap. Project/user tombstones remain intact and cannot be bypassed by child rows. Legacy session/API/publishing quarantine remains in effect through `restoreReviewRequired`.

After restoring, reconcile account deletions that occurred after the archive timestamp, external billing and provider transaction status before manually removing the existing global quarantine. Then users can reconnect providers and deliberately re-enable links. Historical totals remain available, but a restore does not certify that external systems still match the archived state.

Verification covers encrypted segmented round trips, missing/tampered/truncated parts, scoped rows, deletion fences and credential quarantine. `scripts/verify-business-backup.ts` additionally exercises transactional restoration on the explicitly named isolated test branch; it rejects other database hosts and uses disposable schemas.
