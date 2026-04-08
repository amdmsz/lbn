export function buildShippingExportBatchDownloadHref(exportBatchId: string) {
  return `/api/shipping/export-batches/${exportBatchId}/download`;
}
