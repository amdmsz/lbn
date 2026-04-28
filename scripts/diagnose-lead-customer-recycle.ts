import dotenv from "dotenv";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  Prisma,
  PrismaClient,
  RecycleDomain,
  RecycleEntryStatus,
  RecycleTargetType,
} from "@prisma/client";

dotenv.config({ quiet: true });

function getArg(name: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  return raw?.slice(prefix.length).trim() ?? "";
}

const envFile = getArg("env-file") || process.env.ENV_FILE?.trim();
if (envFile) {
  dotenv.config({ path: envFile, override: true, quiet: true });
}

function parseLimit() {
  const parsed = Number.parseInt(getArg("limit"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

const limit = parseLimit();
const phone = getArg("phone");
const targetId = getArg("target-id");
const activeOnly = process.argv.includes("--active-only");

async function main() {
  const entryAnd: Prisma.RecycleBinEntryWhereInput[] = [
    {
      domain: {
        in: [RecycleDomain.LEAD, RecycleDomain.CUSTOMER],
      },
    },
  ];

  if (activeOnly) {
    entryAnd.push({ status: RecycleEntryStatus.ACTIVE });
  }

  if (targetId) {
    entryAnd.push({
      OR: [{ id: targetId }, { targetId }],
    });
  }

  if (phone) {
    entryAnd.push({
      OR: [
        { titleSnapshot: { contains: phone } },
        { secondarySnapshot: { contains: phone } },
      ],
    });
  }

  const entries = await prisma.recycleBinEntry.findMany({
    where: { AND: entryAnd },
    take: limit,
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      domain: true,
      targetType: true,
      targetId: true,
      titleSnapshot: true,
      secondarySnapshot: true,
      status: true,
      activeEntryKey: true,
      restoreRouteSnapshot: true,
      deletedAt: true,
      resolvedAt: true,
      blockerSnapshotJson: true,
    },
  });

  const leadTargetIds = unique(
    entries
      .filter((entry) => entry.targetType === RecycleTargetType.LEAD)
      .map((entry) => entry.targetId),
  );
  const customerTargetIds = unique(
    entries
      .filter((entry) => entry.targetType === RecycleTargetType.CUSTOMER)
      .map((entry) => entry.targetId),
  );

  const leadOr: Prisma.LeadWhereInput[] = [
    ...(leadTargetIds.length > 0 ? [{ id: { in: leadTargetIds } }] : []),
    ...(customerTargetIds.length > 0
      ? [{ customerId: { in: customerTargetIds } }]
      : []),
    ...(phone ? [{ phone: { contains: phone } }] : []),
  ];

  const leads =
    leadOr.length > 0
      ? await prisma.lead.findMany({
          where: { OR: leadOr },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            conversionStatus: true,
            ownerId: true,
            customerId: true,
            rolledBackAt: true,
            rolledBackBatchId: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                status: true,
                ownershipMode: true,
                ownerId: true,
                publicPoolReason: true,
                publicPoolEnteredAt: true,
              },
            },
            mergeLogs: {
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                batchId: true,
                customerId: true,
                action: true,
                createdAt: true,
              },
            },
            _count: {
              select: {
                assignments: true,
                callRecords: true,
                wechatRecords: true,
                liveInvitations: true,
                orders: true,
                mergeLogs: true,
              },
            },
          },
        })
      : [];

  const pairedCustomerIds = unique([
    ...customerTargetIds,
    ...leads.map((lead) => lead.customerId ?? ""),
  ]);

  const customerOr: Prisma.CustomerWhereInput[] = [
    ...(pairedCustomerIds.length > 0 ? [{ id: { in: pairedCustomerIds } }] : []),
    ...(phone ? [{ phone: { contains: phone } }] : []),
  ];

  const customers =
    customerOr.length > 0
      ? await prisma.customer.findMany({
          where: { OR: customerOr },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            ownershipMode: true,
            ownerId: true,
            lastOwnerId: true,
            publicPoolReason: true,
            publicPoolEnteredAt: true,
            createdAt: true,
            updatedAt: true,
            leads: {
              select: {
                id: true,
                status: true,
                conversionStatus: true,
                ownerId: true,
                phone: true,
              },
            },
            _count: {
              select: {
                leads: true,
                callRecords: true,
                wechatRecords: true,
                liveInvitations: true,
                tradeOrders: true,
                mergeLogs: true,
                ownershipEvents: true,
              },
            },
          },
        })
      : [];

  const activeTargetPairs = unique([
    ...leadTargetIds.map((id) => `${RecycleTargetType.LEAD}:${id}`),
    ...leads.map((lead) => `${RecycleTargetType.LEAD}:${lead.id}`),
    ...pairedCustomerIds.map((id) => `${RecycleTargetType.CUSTOMER}:${id}`),
  ]);

  const activeEntries =
    activeTargetPairs.length > 0
      ? await prisma.recycleBinEntry.findMany({
          where: {
            status: RecycleEntryStatus.ACTIVE,
            OR: activeTargetPairs.map((pair) => {
              const [targetType, id] = pair.split(":");
              return {
                targetType: targetType as RecycleTargetType,
                targetId: id,
              };
            }),
          },
          select: {
            id: true,
            targetType: true,
            targetId: true,
            status: true,
            restoreRouteSnapshot: true,
            deletedAt: true,
          },
        })
      : [];

  const activeEntryMap = new Map(
    activeEntries.map((entry) => [`${entry.targetType}:${entry.targetId}`, entry]),
  );

  console.log(
    JSON.stringify({
      event: "lead_customer_recycle_diagnostics",
      limit,
      phone: phone || null,
      targetId: targetId || null,
      activeOnly,
      entryCount: entries.length,
      leadCount: leads.length,
      customerCount: customers.length,
    }),
  );

  console.table(
    entries.map((entry) => ({
      entryId: entry.id,
      target: `${entry.targetType}:${entry.targetId}`,
      domain: entry.domain,
      status: entry.status,
      title: entry.titleSnapshot,
      secondary: entry.secondarySnapshot ?? "",
      route: entry.restoreRouteSnapshot,
      deletedAt: toIso(entry.deletedAt),
      resolvedAt: toIso(entry.resolvedAt),
      activeKey: entry.activeEntryKey ?? "",
    })),
  );

  console.table(
    leads.map((lead) => ({
      leadId: lead.id,
      name: lead.name ?? "",
      phone: lead.phone,
      status: lead.status,
      conversion: lead.conversionStatus,
      ownerId: lead.ownerId ?? "",
      customerId: lead.customerId ?? "",
      leadActiveRecycleEntry:
        activeEntryMap.get(`${RecycleTargetType.LEAD}:${lead.id}`)?.id ?? "",
      customerActiveRecycleEntry: lead.customerId
        ? activeEntryMap.get(`${RecycleTargetType.CUSTOMER}:${lead.customerId}`)
            ?.id ?? ""
        : "",
      mergeLogs: lead._count.mergeLogs,
      calls: lead._count.callRecords,
      updatedAt: toIso(lead.updatedAt),
    })),
  );

  console.table(
    customers.map((customer) => ({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      status: customer.status,
      ownershipMode: customer.ownershipMode,
      ownerId: customer.ownerId ?? "",
      publicPoolReason: customer.publicPoolReason ?? "",
      customerActiveRecycleEntry:
        activeEntryMap.get(`${RecycleTargetType.CUSTOMER}:${customer.id}`)?.id ??
        "",
      linkedLeads: customer._count.leads,
      leadIds: customer.leads.map((lead) => lead.id).join(","),
      calls: customer._count.callRecords,
      tradeOrders: customer._count.tradeOrders,
      updatedAt: toIso(customer.updatedAt),
    })),
  );

  console.dir(
    {
      activeEntries,
      leadMergeLogs: leads.map((lead) => ({
        leadId: lead.id,
        mergeLogs: lead.mergeLogs,
      })),
    },
    { depth: null },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
