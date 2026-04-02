import { OrderType, PaymentStatus, ShippingStatus, type RoleCode } from "@prisma/client";

export type OrderActor = {
  id: string;
  role: RoleCode;
};

export type CreateOrderInput = {
  customerId: string;
  type: OrderType;
  amount: number;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  sourceScene: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  trackingNumber: string;
  remark: string;
};

export type UpdateOrderInput = {
  orderId: string;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  trackingNumber: string;
};

const LEGACY_ORDER_WRITE_PATH_RETIRED_MESSAGE =
  "Legacy Order write path retired; use SalesOrder.";

export async function createOrder(
  _actor: OrderActor,
  _rawInput: CreateOrderInput,
) {
  void _actor;
  void _rawInput;
  throw new Error(LEGACY_ORDER_WRITE_PATH_RETIRED_MESSAGE);
}

export async function updateOrder(
  _actor: OrderActor,
  _rawInput: UpdateOrderInput,
) {
  void _actor;
  void _rawInput;
  throw new Error(LEGACY_ORDER_WRITE_PATH_RETIRED_MESSAGE);
}
