import {
  OperationModule,
  OperationTargetType,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { z } from "zod";
import { canAccessSystemSettings } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { OUTBOUND_CALL_SEAT_PROVIDERS } from "@/lib/outbound-calls/metadata";

const seatBindingSchema = z.object({
  userId: z.string().trim().min(1, "缺少用户。"),
  provider: z.enum(OUTBOUND_CALL_SEAT_PROVIDERS).default("MOCK"),
  seatNo: z.string().trim().min(1, "坐席号不能为空。").max(80),
  extensionNo: z.string().trim().max(80).nullable().optional(),
  displayNumber: z.string().trim().max(80).nullable().optional(),
  routingGroup: z.string().trim().max(120).nullable().optional(),
  enabled: z.coerce.boolean().default(true),
});

export type OutboundCallSeatBindingRow = Awaited<
  ReturnType<typeof getOutboundCallSeatBindingRows>
>[number];

function toJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function nullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function requireOutboundCallSettingsActor(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!actor) {
    throw new Error("当前用户不存在。");
  }

  if (!canAccessSystemSettings(actor.role.code)) {
    throw new Error("当前角色不能配置外呼坐席。");
  }

  return actor;
}

export async function getOutboundCallSeatBindingRows() {
  return prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: {
        code: {
          in: ["ADMIN", "SALES"],
        },
      },
    },
    orderBy: [
      { role: { code: "asc" } },
      { team: { name: "asc" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      userStatus: true,
      role: {
        select: {
          code: true,
          name: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      outboundCallSeatBinding: {
        select: {
          id: true,
          provider: true,
          seatNo: true,
          extensionNo: true,
          displayNumber: true,
          routingGroup: true,
          enabled: true,
          lastRegisteredAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function upsertOutboundCallSeatBinding(
  actorId: string,
  rawInput: unknown,
) {
  const actor = await requireOutboundCallSettingsActor(actorId);
  const parsed = seatBindingSchema.parse(rawInput);
  const targetUser = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: {
      id: true,
      name: true,
      username: true,
    },
  });

  if (!targetUser) {
    throw new Error("坐席用户不存在。");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.outboundCallSeatBinding.findUnique({
        where: { userId: parsed.userId },
      });
      const saved = current
        ? await tx.outboundCallSeatBinding.update({
            where: { id: current.id },
            data: {
              provider: parsed.provider,
              seatNo: parsed.seatNo,
              extensionNo: nullable(parsed.extensionNo),
              displayNumber: nullable(parsed.displayNumber),
              routingGroup: nullable(parsed.routingGroup),
              enabled: parsed.enabled,
            },
            select: { id: true },
          })
        : await tx.outboundCallSeatBinding.create({
            data: {
              userId: parsed.userId,
              provider: parsed.provider,
              seatNo: parsed.seatNo,
              extensionNo: nullable(parsed.extensionNo),
              displayNumber: nullable(parsed.displayNumber),
              routingGroup: nullable(parsed.routingGroup),
              enabled: parsed.enabled,
            },
            select: { id: true },
          });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.CALL,
          action: current
            ? "outbound_call_seat_binding.updated"
            : "outbound_call_seat_binding.created",
          targetType: OperationTargetType.OUTBOUND_CALL_SEAT_BINDING,
          targetId: saved.id,
          description: `维护外呼坐席绑定：${targetUser.name} (@${targetUser.username})`,
          beforeData: current ? toJson(current) : undefined,
          afterData: toJson({
            userId: parsed.userId,
            provider: parsed.provider,
            seatNo: parsed.seatNo,
            extensionNo: nullable(parsed.extensionNo),
            displayNumber: nullable(parsed.displayNumber),
            routingGroup: nullable(parsed.routingGroup),
            enabled: parsed.enabled,
          }),
        },
      });

      return saved;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("该 provider 下的坐席号已被其他账号绑定。");
    }

    throw error;
  }
}
