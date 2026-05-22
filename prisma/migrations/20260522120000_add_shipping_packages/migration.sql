-- Store multi-package logistics snapshots for one shipping task.
ALTER TABLE `shippingtask`
  ADD COLUMN `shippingPackages` JSON NULL;
