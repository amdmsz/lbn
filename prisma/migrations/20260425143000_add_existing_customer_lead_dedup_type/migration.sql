-- Add explicit duplicate reason for imported lead rows that match an existing customer phone.
ALTER TABLE `lead_import_rows`
  MODIFY `dedupType` ENUM('EXISTING_LEAD', 'EXISTING_CUSTOMER', 'BATCH_DUPLICATE') NULL;

ALTER TABLE `lead_dedup_logs`
  MODIFY `dedupType` ENUM('EXISTING_LEAD', 'EXISTING_CUSTOMER', 'BATCH_DUPLICATE') NOT NULL;
