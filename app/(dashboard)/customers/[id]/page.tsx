import { notFound, redirect } from "next/navigation";
import type { RoleCode } from "@prisma/client";
import { getParamValue } from "@/lib/action-notice";
import { CustomerDetailWorkbench } from "@/components/customers/customer-detail-workbench";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  canCreateLiveInvitation,
  canCreateSalesOrder,
  canCreateWechatRecord,
  canTransferCustomerOwner,
  canUseCustomerTags,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getEnabledCallResultOptions } from "@/lib/calls/settings";
import type { CustomerDetailTab } from "@/lib/customers/metadata";
import {
  getCustomerDetailCallsData,
  getCustomerDetailLiveData,
  getCustomerDetailLogsData,
  getCustomerDetailOrdersData,
  getCustomerOwnerTransferOptions,
  getCustomerDetailProfileData,
  getCustomerDetailShell,
  getCustomerDetailWechatData,
  parseCustomerDetailTab,
} from "@/lib/customers/queries";
import { prisma } from "@/lib/db/prisma";
import { parseMasterDataNotice } from "@/lib/master-data/metadata";
import { isOutboundCallRuntimeEnabled } from "@/lib/outbound-calls/config";
import {
  buildCustomerFinalizePreview,
  getCustomerRecycleTarget,
} from "@/lib/recycle-bin/customer-adapter";
import { getCustomerTradeOrderComposerData } from "@/lib/trade-orders/queries";
import {
  deleteImportedCustomerDirectAction,
  moveCustomerToRecycleBinAction,
  requestImportedCustomerDeletionAction,
  saveTradeOrderDraftAction,
  reviewImportedCustomerDeletionAction,
  submitTradeOrderForReviewAction,
  transferCustomerOwnerAction,
  updateCustomerProfileAction,
} from "./actions";

function getCustomerDetailNavigationContext(
  searchParams: Record<string, string | string[] | undefined> | undefined,
) {
  const source = getParamValue(searchParams?.from);
  const returnTo = getParamValue(searchParams?.returnTo);
  const modeParam = getParamValue(searchParams?.mode);
  const mode: "mobile" | "popup" | undefined =
    modeParam === "mobile" || modeParam === "popup" ? modeParam : undefined;

  if (source === "public-pool" && returnTo.startsWith("/customers/public-pool")) {
    return {
      from: "public-pool" as const,
      returnTo,
      mode,
    };
  }

  if (source === "mobile" && returnTo.startsWith("/mobile")) {
    return {
      from: "mobile" as const,
      returnTo,
      mode,
    };
  }

  return {
    returnTo: "/customers",
    mode,
  };
}

async function getActiveTabData(
  viewer: { id: string; role: RoleCode },
  customerId: string,
  activeTab: CustomerDetailTab,
) {
  switch (activeTab) {
    case "profile":
      return getCustomerDetailProfileData(viewer, customerId);
    case "calls":
      return getCustomerDetailCallsData(viewer, customerId);
    case "wechat":
      return getCustomerDetailWechatData(viewer, customerId);
    case "live":
      return getCustomerDetailLiveData(viewer, customerId);
    case "orders":
      return getCustomerDetailOrdersData(viewer, customerId);
    case "logs":
      return getCustomerDetailLogsData(viewer, customerId);
    default:
      return getCustomerDetailProfileData(viewer, customerId);
  }
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const navigationContext = getCustomerDetailNavigationContext(resolvedSearchParams);
  const activeTab = parseCustomerDetailTab(resolvedSearchParams, "profile");
  const notice = parseMasterDataNotice(resolvedSearchParams);
  const isEditingProfile =
    activeTab === "profile" && getParamValue(resolvedSearchParams?.editProfile) === "1";
  const createTradeOrder =
    getParamValue(resolvedSearchParams?.createTradeOrder) === "1";
  const tradeOrderId = getParamValue(resolvedSearchParams?.tradeOrderId);

  const shell = await getCustomerDetailShell(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
  );

  if (!shell) {
    notFound();
  }

  const tabData = await getActiveTabData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
    activeTab,
  );

  if (!tabData) {
    notFound();
  }

  const isOwnedByCurrentSales = shell.owner?.id === session.user.id;
  const isExecutionReady = Boolean(shell.owner?.id) && shell.ownershipMode !== "PUBLIC";
  const canCreateCalls =
    isExecutionReady &&
    canCreateCallRecord(session.user.role) &&
    (session.user.role !== "SALES" || isOwnedByCurrentSales);
  const canCreateSalesOrders =
    isExecutionReady &&
    canCreateSalesOrder(session.user.role) &&
    (session.user.role !== "SALES" || isOwnedByCurrentSales);
  const canEditProfile =
    session.user.role !== "SALES" || isOwnedByCurrentSales;
  const canTransferOwner = canTransferCustomerOwner(session.user.role);
  const [callResultOptions, outboundCallEnabled] = canCreateCalls
    ? await Promise.all([
        getEnabledCallResultOptions(),
        isOutboundCallRuntimeEnabled(),
      ])
    : [[], false];
  const [
    tradeOrderComposer,
    customerRecycleTarget,
    customerFinalizePreview,
    ownerTransferOptions,
  ] =
    await Promise.all([
      activeTab === "orders" && createTradeOrder && canCreateSalesOrders
        ? getCustomerTradeOrderComposerData(
            {
              id: session.user.id,
              role: session.user.role,
            },
            id,
            tradeOrderId || undefined,
          )
        : Promise.resolve(null),
      getCustomerRecycleTarget(prisma, "CUSTOMER", id),
      buildCustomerFinalizePreview(prisma, {
        targetType: "CUSTOMER",
        targetId: id,
        domain: "CUSTOMER",
      }),
      canTransferOwner
        ? getCustomerOwnerTransferOptions(
            {
              id: session.user.id,
              role: session.user.role,
            },
            id,
          )
        : Promise.resolve([]),
    ]);

  return (
    <CustomerDetailWorkbench
      shell={shell}
      navigationContext={navigationContext}
      activeTab={activeTab}
      tabData={tabData}
      callResultOptions={callResultOptions}
      notice={notice}
      canCreateCalls={canCreateCalls}
      outboundCallEnabled={outboundCallEnabled}
      canCreateWechat={
        isExecutionReady &&
        canCreateWechatRecord(session.user.role) &&
        (session.user.role !== "SALES" || isOwnedByCurrentSales)
      }
      canManageLiveInvitations={
        isExecutionReady &&
        canCreateLiveInvitation(session.user.role) &&
        (session.user.role !== "SALES" || isOwnedByCurrentSales)
      }
      canManageTags={
        isExecutionReady &&
        canUseCustomerTags(session.user.role) &&
        (session.user.role !== "SALES" || isOwnedByCurrentSales)
      }
      canEditProfile={canEditProfile}
      isEditingProfile={isEditingProfile}
      canCreateSalesOrders={canCreateSalesOrders}
      tradeOrderComposer={tradeOrderComposer}
      customerRecycleGuard={customerRecycleTarget?.guard ?? null}
      customerFinalizePreview={customerFinalizePreview}
      ownerTransferOptions={ownerTransferOptions}
      transferCustomerOwnerAction={
        canTransferOwner ? transferCustomerOwnerAction : undefined
      }
      moveCustomerToRecycleBinAction={moveCustomerToRecycleBinAction}
      updateCustomerProfileAction={updateCustomerProfileAction}
      saveTradeOrderDraftAction={saveTradeOrderDraftAction}
      submitTradeOrderForReviewAction={submitTradeOrderForReviewAction}
      requestImportedCustomerDeletionAction={requestImportedCustomerDeletionAction}
      reviewImportedCustomerDeletionAction={reviewImportedCustomerDeletionAction}
      deleteImportedCustomerDirectAction={deleteImportedCustomerDirectAction}
    />
  );
}
