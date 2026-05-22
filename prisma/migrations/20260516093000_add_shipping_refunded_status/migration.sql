-- Add a post-delivery refunded final outcome to the fulfillment truth layer.
ALTER TABLE `shippingtask`
  MODIFY `shippingStatus` ENUM('PENDING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'REFUNDED', 'CANCELED') NOT NULL DEFAULT 'PENDING';
