-- Add explicit logistics overdue exception type and switch auto-check cadence to cost-capped windows.

ALTER TABLE `shippingtask`
  MODIFY COLUMN `logisticsExceptionType` ENUM('ADDRESS_MISMATCH', 'RETURN_OR_REJECTED', 'TRACE_QUERY_FAILED', 'OVERDUE_NOT_SIGNED') NULL;

ALTER TABLE `logisticsfollowuptask`
  ALTER COLUMN `intervalDays` SET DEFAULT 2;
