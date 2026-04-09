import type { Prisma } from "@prisma/client";

export function buildVisibleLeadWhereInput(): Prisma.LeadWhereInput {
  return {
    rolledBackAt: null,
  };
}

export function withVisibleLeadWhere(
  where: Prisma.LeadWhereInput | null | undefined,
): Prisma.LeadWhereInput {
  if (!where || Object.keys(where).length === 0) {
    return buildVisibleLeadWhereInput();
  }

  return {
    AND: [buildVisibleLeadWhereInput(), where],
  };
}
