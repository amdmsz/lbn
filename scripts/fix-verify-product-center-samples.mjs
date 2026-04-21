import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE_NAME = "liquor_crm_m4_verify";
const DEMO_TRADE_NO = "TO202604201349367434";
const VERIFY_PRODUCT_PREFIX = "VERIFY_PC_";

const STATIC_PRODUCT_NAMES = {
  VERIFY_PRODUCT_A: {
    name: "验证商品A",
    brandName: "验证品牌",
    seriesName: "验证系列A",
    description: "用于 verify 库的 Product Center 基础演示商品A",
    skuNames: ["验证SKU A"],
  },
  VERIFY_PRODUCT_B: {
    name: "验证商品B",
    brandName: "验证品牌",
    seriesName: "验证系列B",
    description: "用于 verify 库的 Product Center 基础演示商品B",
    skuNames: ["验证SKU B"],
  },
};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to repair verify product-center samples.");
}

const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\/+/, "");

if (databaseName !== EXPECTED_DATABASE_NAME) {
  throw new Error(
    `This script only supports ${EXPECTED_DATABASE_NAME}. Current database is ${databaseName || "<unknown>"}.`,
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

function buildVerifyProductName(code) {
  return `商品中心闭环验证-${code.slice(VERIFY_PRODUCT_PREFIX.length)}`;
}

function buildVerifySkuName(productCode, index) {
  return `闭环验证 SKU ${productCode.slice(VERIFY_PRODUCT_PREFIX.length)}-${index + 1}`;
}

async function main() {
  const summary = {
    suppliers: [],
    products: [],
    skus: [],
    tradeOrder: null,
  };

  await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({
      where: { code: "VERIFY_SUPPLIER_PC" },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (supplier) {
      const nextName = "验证供货商";
      await tx.supplier.update({
        where: { id: supplier.id },
        data: {
          name: nextName,
        },
      });
      summary.suppliers.push({
        code: supplier.code,
        previousName: supplier.name,
        nextName,
      });
    }

    const staticProducts = await tx.product.findMany({
      where: {
        code: {
          in: Object.keys(STATIC_PRODUCT_NAMES),
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        brandName: true,
        seriesName: true,
        description: true,
        skus: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            skuName: true,
          },
        },
      },
    });

    for (const product of staticProducts) {
      const fix = STATIC_PRODUCT_NAMES[product.code];
      if (!fix) {
        continue;
      }

      await tx.product.update({
        where: { id: product.id },
        data: {
          name: fix.name,
          brandName: fix.brandName,
          seriesName: fix.seriesName,
          description: fix.description,
        },
      });

      summary.products.push({
        code: product.code,
        previousName: product.name,
        nextName: fix.name,
      });

      for (const [index, sku] of product.skus.entries()) {
        const nextSkuName = fix.skuNames[index] ?? `${fix.name} SKU ${index + 1}`;
        await tx.productSku.update({
          where: { id: sku.id },
          data: {
            skuName: nextSkuName,
          },
        });

        summary.skus.push({
          productCode: product.code,
          skuId: sku.id,
          previousSkuName: sku.skuName,
          nextSkuName,
        });
      }
    }

    const verifyProducts = await tx.product.findMany({
      where: {
        code: {
          startsWith: VERIFY_PRODUCT_PREFIX,
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        brandName: true,
        seriesName: true,
        description: true,
        skus: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            skuName: true,
          },
        },
      },
    });

    for (const product of verifyProducts) {
      const nextName = buildVerifyProductName(product.code);
      const nextBrandName = "闭环验证";
      const nextSeriesName = "M4";
      const nextDescription = "用于 verify 库的 Product Center 闭环验证样本";

      await tx.product.update({
        where: { id: product.id },
        data: {
          name: nextName,
          brandName: nextBrandName,
          seriesName: nextSeriesName,
          description: nextDescription,
        },
      });

      summary.products.push({
        code: product.code,
        previousName: product.name,
        nextName,
      });

      for (const [index, sku] of product.skus.entries()) {
        const nextSkuName = buildVerifySkuName(product.code, index);
        await tx.productSku.update({
          where: { id: sku.id },
          data: {
            skuName: nextSkuName,
          },
        });

        summary.skus.push({
          productCode: product.code,
          skuId: sku.id,
          previousSkuName: sku.skuName,
          nextSkuName,
        });
      }
    }

    const demoTradeOrder = await tx.tradeOrder.findUnique({
      where: { tradeNo: DEMO_TRADE_NO },
      select: {
        id: true,
        tradeNo: true,
      },
    });

    if (!demoTradeOrder) {
      summary.tradeOrder = {
        tradeNo: DEMO_TRADE_NO,
        status: "missing",
      };
      return;
    }

    const [tradeOrderItems, tradeOrderComponents] = await Promise.all([
      tx.tradeOrderItem.findMany({
        where: { tradeOrderId: demoTradeOrder.id },
        select: {
          id: true,
          productId: true,
          skuId: true,
          titleSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
        },
      }),
      tx.tradeOrderItemComponent.findMany({
        where: { tradeOrderId: demoTradeOrder.id },
        select: {
          id: true,
          supplierId: true,
          productId: true,
          skuId: true,
          supplierNameSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          exportDisplayNameSnapshot: true,
        },
      }),
    ]);

    const productIds = [
      ...new Set(
        tradeOrderItems
          .flatMap((item) => [item.productId])
          .concat(tradeOrderComponents.flatMap((component) => [component.productId]))
          .filter(Boolean),
      ),
    ];
    const skuIds = [
      ...new Set(
        tradeOrderItems
          .flatMap((item) => [item.skuId])
          .concat(tradeOrderComponents.flatMap((component) => [component.skuId]))
          .filter(Boolean),
      ),
    ];
    const supplierIds = [...new Set(tradeOrderComponents.map((component) => component.supplierId))];

    const [products, skus, suppliers] = await Promise.all([
      productIds.length > 0
        ? tx.product.findMany({
            where: {
              id: {
                in: productIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [],
      skuIds.length > 0
        ? tx.productSku.findMany({
            where: {
              id: {
                in: skuIds,
              },
            },
            select: {
              id: true,
              skuName: true,
            },
          })
        : [],
      supplierIds.length > 0
        ? tx.supplier.findMany({
            where: {
              id: {
                in: supplierIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [],
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const skuMap = new Map(skus.map((sku) => [sku.id, sku]));
    const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

    let updatedItemCount = 0;
    let updatedComponentCount = 0;

    for (const item of tradeOrderItems) {
      const product = item.productId ? productMap.get(item.productId) : null;
      const sku = item.skuId ? skuMap.get(item.skuId) : null;

      const nextProductName = product?.name ?? item.productNameSnapshot ?? null;
      const nextSkuName = sku?.skuName ?? item.skuNameSnapshot ?? null;
      const nextTitle =
        nextProductName && nextSkuName
          ? `${nextProductName} / ${nextSkuName}`
          : nextProductName ?? item.titleSnapshot;

      await tx.tradeOrderItem.update({
        where: { id: item.id },
        data: {
          titleSnapshot: nextTitle,
          productNameSnapshot: nextProductName,
          skuNameSnapshot: nextSkuName,
          specSnapshot: nextSkuName,
          unitSnapshot: "",
        },
      });

      updatedItemCount += 1;
    }

    for (const component of tradeOrderComponents) {
      const supplier = supplierMap.get(component.supplierId);
      const product = component.productId ? productMap.get(component.productId) : null;
      const sku = component.skuId ? skuMap.get(component.skuId) : null;

      await tx.tradeOrderItemComponent.update({
        where: { id: component.id },
        data: {
          supplierNameSnapshot: supplier?.name ?? component.supplierNameSnapshot,
          productNameSnapshot: product?.name ?? component.productNameSnapshot,
          skuNameSnapshot: sku?.skuName ?? component.skuNameSnapshot,
          specSnapshot: sku?.skuName ?? component.specSnapshot,
          unitSnapshot: "",
          exportDisplayNameSnapshot: product?.name ?? component.exportDisplayNameSnapshot,
        },
      });

      updatedComponentCount += 1;
    }

    summary.tradeOrder = {
      tradeNo: demoTradeOrder.tradeNo,
      status: "cleaned",
      updatedItemCount,
      updatedComponentCount,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
