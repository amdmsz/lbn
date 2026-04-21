import {
  OperationModule,
  OperationTargetType,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canCreateProducts, canManageProducts } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { PRODUCT_CENTER_DICTIONARY_TYPES } from "@/lib/products/metadata";
import { findProductDomainCurrentlyHiddenEntry } from "@/lib/products/recycle";

export type ProductActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

const optionalTrimmedString = z.string().trim().max(191).default("");
const optionalLongText = z.string().trim().max(2000).default("");

const upsertProductSchema = z.object({
  id: z.string().trim().default(""),
  supplierId: z.string().trim().min(1, "Supplier is required."),
  code: z.string().trim().min(1, "Product code is required.").max(50),
  name: z.string().trim().min(1, "Product name is required.").max(120),
  mainImagePath: z.string().trim().max(191).default(""),
  brandName: optionalTrimmedString,
  seriesName: optionalTrimmedString,
  categoryCode: optionalTrimmedString,
  primarySalesSceneCode: optionalTrimmedString,
  supplyGroupCode: optionalTrimmedString,
  financeCategoryCode: optionalTrimmedString,
  description: z.string().trim().max(1000).default(""),
  internalSupplyRemark: optionalLongText,
});

const upsertProductSkuSchema = z.object({
  id: z.string().trim().default(""),
  productId: z.string().trim().min(1, "Product is required."),
  skuName: z.string().trim().min(1, "SKU name is required.").max(120),
  defaultUnitPrice: z.coerce.number().min(0, "Default unit price cannot be negative."),
  codSupported: z.enum(["true", "false"]).transform((value) => value === "true"),
  insuranceSupported: z.enum(["true", "false"]).transform((value) => value === "true"),
  defaultInsuranceAmount: z.coerce
    .number()
    .min(0, "Default insurance amount cannot be negative."),
});

const createProductWithInitialSkuSchema = upsertProductSchema.extend({
  initialSku: upsertProductSkuSchema
    .omit({
      id: true,
      productId: true,
    })
    .extend({
      defaultUnitPrice: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.coerce.number().min(0).default(0),
      ),
    }),
});

function ensureManageProducts(actor: ProductActor) {
  if (!canManageProducts(actor.role, actor.permissionCodes)) {
    throw new Error("You do not have permission to manage products.");
  }
}

function ensureCreateProducts(actor: ProductActor) {
  if (!canCreateProducts(actor.role, actor.permissionCodes)) {
    throw new Error("You do not have permission to create products.");
  }
}

async function assertProductNotInRecycleBin(productId: string, actionLabel: string) {
  const activeEntry = await findProductDomainCurrentlyHiddenEntry(
    prisma,
    "PRODUCT",
    productId,
  );

  if (activeEntry) {
    throw new Error(`The product is already hidden and cannot ${actionLabel}.`);
  }
}

async function assertProductSkuNotInRecycleBin(skuId: string, actionLabel: string) {
  const activeEntry = await findProductDomainCurrentlyHiddenEntry(
    prisma,
    "PRODUCT_SKU",
    skuId,
  );

  if (activeEntry) {
    throw new Error(`The SKU is already hidden and cannot ${actionLabel}.`);
  }
}

async function assertSupplierNotInRecycleBin(supplierId: string, actionLabel: string) {
  const activeEntry = await findProductDomainCurrentlyHiddenEntry(
    prisma,
    "SUPPLIER",
    supplierId,
  );

  if (activeEntry) {
    throw new Error(`The supplier is already hidden and cannot ${actionLabel}.`);
  }
}

async function assertDictionaryCode(typeCode: string, code: string, label: string) {
  if (!code) {
    return;
  }

  const dictionaryItem = await prisma.dictionaryItem.findFirst({
    where: {
      code,
      type: {
        code: typeCode,
      },
    },
    select: {
      id: true,
    },
  });

  if (!dictionaryItem) {
    throw new Error(`${label} does not exist in settings/dictionaries.`);
  }
}

function normalizeProductInput(input: z.infer<typeof upsertProductSchema>) {
  return {
    ...input,
    mainImagePath: input.mainImagePath || null,
    brandName: input.brandName || null,
    seriesName: input.seriesName || null,
    categoryCode: input.categoryCode || null,
    primarySalesSceneCode: input.primarySalesSceneCode || null,
    supplyGroupCode: input.supplyGroupCode || null,
    financeCategoryCode: input.financeCategoryCode || null,
    description: input.description || null,
    internalSupplyRemark: input.internalSupplyRemark || null,
  };
}

async function validateProductSharedFields(input: {
  supplierId: string;
  categoryCode: string;
  primarySalesSceneCode: string;
  supplyGroupCode: string;
  financeCategoryCode: string;
}) {
  await assertSupplierNotInRecycleBin(input.supplierId, "bind product");
  await Promise.all([
    assertDictionaryCode(
      PRODUCT_CENTER_DICTIONARY_TYPES.category,
      input.categoryCode,
      "Product category",
    ),
    assertDictionaryCode(
      PRODUCT_CENTER_DICTIONARY_TYPES.primarySalesScene,
      input.primarySalesSceneCode,
      "Primary sales scene",
    ),
    assertDictionaryCode(
      PRODUCT_CENTER_DICTIONARY_TYPES.supplyGroup,
      input.supplyGroupCode,
      "Supply group",
    ),
    assertDictionaryCode(
      PRODUCT_CENTER_DICTIONARY_TYPES.financeCategory,
      input.financeCategoryCode,
      "Finance category",
    ),
  ]);
}

export async function upsertProduct(
  actor: ProductActor,
  rawInput: z.input<typeof upsertProductSchema>,
) {
  const input = upsertProductSchema.parse(rawInput);

  if (input.id) {
    ensureManageProducts(actor);
    await assertProductNotInRecycleBin(input.id, "edit");
  } else {
    ensureCreateProducts(actor);
  }

  await validateProductSharedFields(input);

  const [supplier, existingByCode, existing] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: {
        code: input.code,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    }),
    input.id
      ? prisma.product.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            supplierId: true,
            code: true,
            name: true,
            mainImagePath: true,
            brandName: true,
            seriesName: true,
            categoryCode: true,
            primarySalesSceneCode: true,
            supplyGroupCode: true,
            financeCategoryCode: true,
            description: true,
            internalSupplyRemark: true,
            enabled: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!supplier) {
    throw new Error("Supplier not found.");
  }

  if (existingByCode) {
    throw new Error("Product code already exists.");
  }

  const normalizedInput = normalizeProductInput(input);

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          supplierId: input.supplierId,
          code: input.code,
          name: input.name,
          mainImagePath: normalizedInput.mainImagePath,
          brandName: normalizedInput.brandName,
          seriesName: normalizedInput.seriesName,
          categoryCode: normalizedInput.categoryCode,
          primarySalesSceneCode: normalizedInput.primarySalesSceneCode,
          supplyGroupCode: normalizedInput.supplyGroupCode,
          financeCategoryCode: normalizedInput.financeCategoryCode,
          description: normalizedInput.description,
          internalSupplyRemark: normalizedInput.internalSupplyRemark,
          updatedById: actor.id,
        },
        select: { id: true, name: true },
      })
    : await prisma.product.create({
        data: {
          supplierId: input.supplierId,
          code: input.code,
          name: input.name,
          mainImagePath: normalizedInput.mainImagePath,
          brandName: normalizedInput.brandName,
          seriesName: normalizedInput.seriesName,
          categoryCode: normalizedInput.categoryCode,
          primarySalesSceneCode: normalizedInput.primarySalesSceneCode,
          supplyGroupCode: normalizedInput.supplyGroupCode,
          financeCategoryCode: normalizedInput.financeCategoryCode,
          description: normalizedInput.description,
          internalSupplyRemark: normalizedInput.internalSupplyRemark,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true, name: true },
      });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: existing ? "product.updated" : "product.created",
      targetType: OperationTargetType.PRODUCT,
      targetId: product.id,
      description: `${existing ? "Updated" : "Created"} product ${product.name}`,
      beforeData: existing ?? undefined,
      afterData: {
        ...normalizedInput,
        supplierName: supplier.name,
      },
    },
  });

  return product;
}

export async function createProductWithInitialSku(
  actor: ProductActor,
  rawInput: z.input<typeof createProductWithInitialSkuSchema>,
) {
  ensureCreateProducts(actor);
  const input = createProductWithInitialSkuSchema.parse(rawInput);

  await validateProductSharedFields(input);

  const [supplier, existingProductByCode] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true, name: true },
    }),
    prisma.product.findFirst({
      where: { code: input.code },
      select: { id: true },
    }),
  ]);

  if (!supplier) {
    throw new Error("Supplier not found.");
  }

  if (existingProductByCode) {
    throw new Error("Product code already exists.");
  }

  const normalizedProductInput = normalizeProductInput(input);

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        supplierId: input.supplierId,
        code: input.code,
        name: input.name,
        mainImagePath: normalizedProductInput.mainImagePath,
        brandName: normalizedProductInput.brandName,
        seriesName: normalizedProductInput.seriesName,
        categoryCode: normalizedProductInput.categoryCode,
        primarySalesSceneCode: normalizedProductInput.primarySalesSceneCode,
        supplyGroupCode: normalizedProductInput.supplyGroupCode,
        financeCategoryCode: normalizedProductInput.financeCategoryCode,
        description: normalizedProductInput.description,
        internalSupplyRemark: normalizedProductInput.internalSupplyRemark,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const sku = await tx.productSku.create({
      data: {
        productId: product.id,
        skuName: input.initialSku.skuName,
        defaultUnitPrice: input.initialSku.defaultUnitPrice,
        codSupported: input.initialSku.codSupported,
        insuranceSupported: input.initialSku.insuranceSupported,
        defaultInsuranceAmount: input.initialSku.defaultInsuranceAmount,
      },
      select: {
        id: true,
        skuName: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.PRODUCT,
        action: "product.created",
        targetType: OperationTargetType.PRODUCT,
        targetId: product.id,
        description: `Created product ${product.name}`,
        afterData: {
          ...normalizedProductInput,
          supplierName: supplier.name,
        },
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.PRODUCT,
        action: "product_sku.created",
        targetType: OperationTargetType.PRODUCT_SKU,
        targetId: sku.id,
        description: `Created initial SKU ${sku.skuName}`,
        afterData: {
          ...input.initialSku,
          productId: product.id,
          productName: product.name,
        },
      },
    });

    return {
      product,
      sku,
    };
  });
}

export async function toggleProduct(actor: ProductActor, productId: string) {
  ensureManageProducts(actor);
  await assertProductNotInRecycleBin(productId, "toggle");

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      enabled: true,
    },
  });

  if (!existing) {
    throw new Error("Product not found.");
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      enabled: !existing.enabled,
      updatedById: actor.id,
    },
    select: {
      enabled: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: "product.toggled",
      targetType: OperationTargetType.PRODUCT,
      targetId: existing.id,
      description: `${updated.enabled ? "Enabled" : "Disabled"} product ${existing.name}`,
      beforeData: { enabled: existing.enabled },
      afterData: { enabled: updated.enabled },
    },
  });

  return {
    id: existing.id,
    name: existing.name,
    enabled: updated.enabled,
  };
}

export async function upsertProductSku(
  actor: ProductActor,
  rawInput: z.input<typeof upsertProductSkuSchema>,
) {
  ensureManageProducts(actor);
  const input = upsertProductSkuSchema.parse(rawInput);

  if (input.id) {
    await assertProductSkuNotInRecycleBin(input.id, "edit");
  }

  await assertProductNotInRecycleBin(input.productId, "bind SKU");
  const [product, existing] = await Promise.all([
    prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true },
    }),
    input.id
      ? prisma.productSku.findUnique({
          where: { id: input.id },
          select: {
            id: true,
            skuName: true,
            defaultUnitPrice: true,
            codSupported: true,
            insuranceSupported: true,
            defaultInsuranceAmount: true,
            enabled: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!product) {
    throw new Error("Product not found.");
  }

  const sku = existing
    ? await prisma.productSku.update({
        where: { id: existing.id },
        data: {
          skuName: input.skuName,
          defaultUnitPrice: input.defaultUnitPrice,
          codSupported: input.codSupported,
          insuranceSupported: input.insuranceSupported,
          defaultInsuranceAmount: input.defaultInsuranceAmount,
        },
        select: { id: true, skuName: true },
      })
    : await prisma.productSku.create({
        data: {
          productId: input.productId,
          skuName: input.skuName,
          defaultUnitPrice: input.defaultUnitPrice,
          codSupported: input.codSupported,
          insuranceSupported: input.insuranceSupported,
          defaultInsuranceAmount: input.defaultInsuranceAmount,
        },
        select: { id: true, skuName: true },
      });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: existing ? "product_sku.updated" : "product_sku.created",
      targetType: OperationTargetType.PRODUCT_SKU,
      targetId: sku.id,
      description: `${existing ? "Updated" : "Created"} SKU ${sku.skuName}`,
      beforeData: existing
        ? {
            ...existing,
            defaultUnitPrice: existing.defaultUnitPrice.toString(),
            defaultInsuranceAmount: existing.defaultInsuranceAmount.toString(),
          }
        : undefined,
      afterData: {
        ...input,
        productId: input.productId,
        productName: product.name,
      },
    },
  });

  return sku;
}

export async function toggleProductSku(actor: ProductActor, skuId: string) {
  ensureManageProducts(actor);
  await assertProductSkuNotInRecycleBin(skuId, "toggle");

  const existing = await prisma.productSku.findUnique({
    where: { id: skuId },
    select: {
      id: true,
      skuName: true,
      enabled: true,
    },
  });

  if (!existing) {
    throw new Error("SKU not found.");
  }

  const updated = await prisma.productSku.update({
    where: { id: existing.id },
    data: {
      enabled: !existing.enabled,
    },
    select: {
      enabled: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: "product_sku.toggled",
      targetType: OperationTargetType.PRODUCT_SKU,
      targetId: existing.id,
      description: `${updated.enabled ? "Enabled" : "Disabled"} SKU ${existing.skuName}`,
      beforeData: { enabled: existing.enabled },
      afterData: { enabled: updated.enabled },
    },
  });

  return {
    id: existing.id,
    skuName: existing.skuName,
    enabled: updated.enabled,
  };
}
