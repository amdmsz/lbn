export type CustomerEngagementActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCustomerEngagementActionState: CustomerEngagementActionState = {
  status: "idle",
  message: "",
};
