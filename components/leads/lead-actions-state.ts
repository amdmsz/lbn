export type AssignLeadsActionState = {
  status: "idle" | "success" | "error";
  message: string;
  assignedCount: number;
  skippedCount: number;
};

export const initialAssignLeadsActionState: AssignLeadsActionState = {
  status: "idle",
  message: "",
  assignedCount: 0,
  skippedCount: 0,
};
