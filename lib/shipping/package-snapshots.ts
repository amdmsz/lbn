export type ShippingPackageSnapshot = {
  label: string;
  shippingProvider: string;
  trackingNumber: string;
  remark: string;
};

export type ShippingPackageSnapshotInput = {
  label?: string;
  shippingProvider?: string;
  trackingNumber?: string;
  remark?: string;
};

function normalizePart(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function normalizeShippingPackageSnapshots(
  value: unknown,
): ShippingPackageSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const snapshot = entry as Partial<ShippingPackageSnapshot>;
      const label = normalizePart(snapshot.label) || `包裹 ${index + 1}`;
      const shippingProvider = normalizePart(snapshot.shippingProvider);
      const trackingNumber = normalizePart(snapshot.trackingNumber);
      const remark = normalizePart(snapshot.remark);

      if (!label && !shippingProvider && !trackingNumber && !remark) {
        return null;
      }

      return {
        label,
        shippingProvider,
        trackingNumber,
        remark,
      };
    })
    .filter((entry): entry is ShippingPackageSnapshot => Boolean(entry));
}

export function buildShippingPackageSnapshots(input: {
  labels: string[];
  shippingProviders: string[];
  trackingNumbers: string[];
  remarks: string[];
}) {
  const length = Math.max(
    input.labels.length,
    input.shippingProviders.length,
    input.trackingNumbers.length,
    input.remarks.length,
  );
  const snapshots: ShippingPackageSnapshot[] = [];

  for (let index = 0; index < length; index += 1) {
    const label = normalizePart(input.labels[index]) || `包裹 ${index + 1}`;
    const shippingProvider = normalizePart(input.shippingProviders[index]);
    const trackingNumber = normalizePart(input.trackingNumbers[index]);
    const remark = normalizePart(input.remarks[index]);

    if (!shippingProvider && !trackingNumber && !remark && !label) {
      continue;
    }

    if (!shippingProvider && !trackingNumber && !remark) {
      continue;
    }

    snapshots.push({
      label,
      shippingProvider,
      trackingNumber,
      remark,
    });
  }

  return snapshots;
}

export function getPrimaryShippingPackageSnapshot(
  snapshots: ShippingPackageSnapshot[] | null | undefined,
) {
  return snapshots?.[0] ?? null;
}

export function summarizeShippingPackageSnapshots(
  snapshots: ShippingPackageSnapshot[] | null | undefined,
) {
  if (!snapshots || snapshots.length === 0) {
    return "未拆包裹";
  }

  const first = snapshots[0];
  const provider = first.shippingProvider || "承运商待补";
  const tracking = first.trackingNumber || "单号待填";
  const extraCount = snapshots.length - 1;
  const extraLabel = extraCount > 0 ? ` +${extraCount}` : "";

  return `${snapshots.length} 箱${extraLabel} · ${provider} / ${tracking}`;
}

