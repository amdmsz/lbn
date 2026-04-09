import type { Prisma } from "@prisma/client";
import type { CustomerImportOperationLogData } from "@/lib/lead-imports/metadata";

export function parseCustomerImportOperationLogData(
  value: Prisma.JsonValue | null | undefined,
): CustomerImportOperationLogData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const customerImport = value.customerImport;

  if (!customerImport || typeof customerImport !== "object" || Array.isArray(customerImport)) {
    return null;
  }

  if (customerImport.importKind !== "CUSTOMER_CONTINUATION") {
    return null;
  }

  return customerImport as CustomerImportOperationLogData;
}
