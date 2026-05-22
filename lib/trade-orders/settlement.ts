import { ShippingFulfillmentStatus, type Prisma } from "@prisma/client";

export const ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE = {
  salesOrders: {
    some: {
      OR: [
        { shippingTask: null },
        {
          shippingTask: {
            is: {
              shippingStatus: {
                not: ShippingFulfillmentStatus.REFUNDED,
              },
            },
          },
        },
      ],
    },
  },
} satisfies Prisma.TradeOrderWhereInput;

export const ACTIVE_SALES_ORDER_SETTLEMENT_WHERE = {
  OR: [
    { shippingTask: null },
    {
      shippingTask: {
        is: {
          shippingStatus: {
            not: ShippingFulfillmentStatus.REFUNDED,
          },
        },
      },
    },
  ],
} satisfies Prisma.SalesOrderWhereInput;
