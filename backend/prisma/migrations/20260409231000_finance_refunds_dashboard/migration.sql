-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OrderRefund" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PROCESSED',
    "transactionRef" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderRefund_orderId_createdAt_idx" ON "OrderRefund"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderRefund_status_refundedAt_idx" ON "OrderRefund"("status", "refundedAt");

-- CreateIndex
CREATE INDEX "OrderRefund_createdById_idx" ON "OrderRefund"("createdById");

-- CreateIndex
CREATE INDEX "OrderRefund_updatedById_idx" ON "OrderRefund"("updatedById");

-- CreateIndex
CREATE INDEX "Order_customerPaymentStatus_customerPaidAt_idx" ON "Order"("customerPaymentStatus", "customerPaidAt");

-- CreateIndex
CREATE INDEX "Order_blockId_customerPaymentStatus_customerPaidAt_idx" ON "Order"("blockId", "customerPaymentStatus", "customerPaidAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_date_idx" ON "Payment"("orderId", "status", "date");

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
