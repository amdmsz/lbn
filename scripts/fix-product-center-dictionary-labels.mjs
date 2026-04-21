import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to repair product-center dictionary labels.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

const TARGET_ITEMS = [
  {
    typeCode: "PRODUCT_CATEGORY",
    code: "BAIJIU",
    label: "\u767d\u9152",
    value: "baijiu",
    description: "Baijiu product category",
    sortOrder: 10,
  },
  {
    typeCode: "PRODUCT_PRIMARY_SALES_SCENE",
    code: "PRIVATE_LIVE",
    label: "\u79c1\u57df\u76f4\u64ad",
    value: "private_live",
    description: "Primary sales scene for private live sessions",
    sortOrder: 10,
  },
  {
    typeCode: "PRODUCT_SUPPLY_GROUP",
    code: "CORE_SUPPLY",
    label: "\u6838\u5fc3\u4f9b\u8d27",
    value: "core_supply",
    description: "Core internal supply group",
    sortOrder: 10,
  },
  {
    typeCode: "PRODUCT_FINANCE_CATEGORY",
    code: "DOMESTIC_SPIRIT",
    label: "\u56fd\u4ea7\u767d\u9152",
    value: "domestic_spirit",
    description: "Finance category for domestic baijiu",
    sortOrder: 10,
  },
  {
    typeCode: "PRODUCT_PACKAGE_FORM",
    code: "BOTTLE",
    label: "\u74f6\u88c5",
    value: "bottle",
    description: "Bottle package form",
    sortOrder: 10,
  },
];

async function main() {
  const typeCodes = [...new Set(TARGET_ITEMS.map((item) => item.typeCode))];
  const dictionaryTypes = await prisma.dictionaryType.findMany({
    where: {
      code: {
        in: typeCodes,
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  const typeMap = new Map(dictionaryTypes.map((type) => [type.code, type]));
  const missingTypes = typeCodes.filter((code) => !typeMap.has(code));

  if (missingTypes.length > 0) {
    throw new Error(
      `Missing dictionary types: ${missingTypes.join(", ")}. Seed dictionary types first.`,
    );
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of TARGET_ITEMS) {
    const type = typeMap.get(item.typeCode);

    if (!type) {
      continue;
    }

    const existing = await prisma.dictionaryItem.findUnique({
      where: {
        typeId_code: {
          typeId: type.id,
          code: item.code,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      await prisma.dictionaryItem.update({
        where: { id: existing.id },
        data: {
          label: item.label,
          value: item.value,
          description: item.description,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
      updatedCount += 1;
      continue;
    }

    await prisma.dictionaryItem.create({
      data: {
        typeId: type.id,
        code: item.code,
        label: item.label,
        value: item.value,
        description: item.description,
        sortOrder: item.sortOrder,
        isActive: true,
      },
    });
    createdCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        updatedCount,
        createdCount,
        items: TARGET_ITEMS.map((item) => ({
          typeCode: item.typeCode,
          code: item.code,
          label: item.label,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
