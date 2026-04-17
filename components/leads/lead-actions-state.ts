import {
  createInitialLeadBatchActionNoticeState,
  type LeadBatchActionNoticeState,
} from "@/lib/leads/batch-action-contract";

export type AssignLeadsActionState = LeadBatchActionNoticeState;

export const initialAssignLeadsActionState =
  createInitialLeadBatchActionNoticeState("无需重复分配");
