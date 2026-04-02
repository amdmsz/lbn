export type CreateCallRecordActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCreateCallRecordActionState: CreateCallRecordActionState = {
  status: "idle",
  message: "",
};
