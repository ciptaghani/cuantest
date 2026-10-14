/*
  Warnings:

  - The primary key for the `orderfee` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `orderId` on the `orderfee` table. All the data in the column will be lost.
  - Added the required column `orderNo` to the `OrderFee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeId` to the `OrderFee` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `orderfee` DROP FOREIGN KEY `OrderFee_orderId_fkey`;

-- AlterTable
ALTER TABLE `orderfee` DROP PRIMARY KEY,
    DROP COLUMN `orderId`,
    ADD COLUMN `orderNo` VARCHAR(191) NOT NULL,
    ADD COLUMN `storeId` VARCHAR(191) NOT NULL,
    MODIFY `settledAt` DATE NULL,
    ADD PRIMARY KEY (`storeId`, `orderNo`);

-- AddForeignKey
ALTER TABLE `OrderFee` ADD CONSTRAINT `OrderFee_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
