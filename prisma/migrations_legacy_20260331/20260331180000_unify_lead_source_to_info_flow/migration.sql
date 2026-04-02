-- Expand related enums to allow INFO_FLOW during data migration.
ALTER TABLE `Lead`
  MODIFY `source` ENUM(
    'H5_FORM',
    'EVENT_PAGE',
    'AD_CAMPAIGN',
    'CHANNEL_IMPORT',
    'EXCEL_IMPORT',
    'MANUAL_ENTRY',
    'OTHER',
    'INFO_FLOW'
  ) NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_import_batches`
  MODIFY `defaultLeadSource` ENUM(
    'H5_FORM',
    'EVENT_PAGE',
    'AD_CAMPAIGN',
    'CHANNEL_IMPORT',
    'EXCEL_IMPORT',
    'MANUAL_ENTRY',
    'OTHER',
    'INFO_FLOW'
  ) NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_import_templates`
  MODIFY `defaultLeadSource` ENUM(
    'H5_FORM',
    'EVENT_PAGE',
    'AD_CAMPAIGN',
    'CHANNEL_IMPORT',
    'EXCEL_IMPORT',
    'MANUAL_ENTRY',
    'OTHER',
    'INFO_FLOW'
  ) NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_customer_merge_logs`
  MODIFY `source` ENUM(
    'H5_FORM',
    'EVENT_PAGE',
    'AD_CAMPAIGN',
    'CHANNEL_IMPORT',
    'EXCEL_IMPORT',
    'MANUAL_ENTRY',
    'OTHER',
    'INFO_FLOW'
  ) NOT NULL;

-- Normalize existing source data to the single supported value.
UPDATE `Lead` SET `source` = 'INFO_FLOW';
UPDATE `lead_import_batches` SET `defaultLeadSource` = 'INFO_FLOW';
UPDATE `lead_import_templates` SET `defaultLeadSource` = 'INFO_FLOW';
UPDATE `lead_customer_merge_logs` SET `source` = 'INFO_FLOW';

-- Narrow enums down to the single business-approved source.
ALTER TABLE `Lead`
  MODIFY `source` ENUM('INFO_FLOW') NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_import_batches`
  MODIFY `defaultLeadSource` ENUM('INFO_FLOW') NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_import_templates`
  MODIFY `defaultLeadSource` ENUM('INFO_FLOW') NOT NULL DEFAULT 'INFO_FLOW';

ALTER TABLE `lead_customer_merge_logs`
  MODIFY `source` ENUM('INFO_FLOW') NOT NULL;
