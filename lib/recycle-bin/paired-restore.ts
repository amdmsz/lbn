import type { RecycleTargetType } from "@prisma/client";

export type RecycleCascadeSource = {
  targetType: RecycleTargetType;
  targetId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRecycleCascadeSource(
  snapshot: unknown,
): RecycleCascadeSource | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const targetType = snapshot.cascadeSourceTargetType;
  const targetId = snapshot.cascadeSourceTargetId;

  if (typeof targetType !== "string" || typeof targetId !== "string") {
    return null;
  }

  return {
    targetType: targetType as RecycleTargetType,
    targetId,
  };
}

export function isRecycleCascadeFrom(
  snapshot: unknown,
  source: RecycleCascadeSource,
) {
  const cascadeSource = getRecycleCascadeSource(snapshot);

  return (
    cascadeSource?.targetType === source.targetType &&
    cascadeSource.targetId === source.targetId
  );
}
