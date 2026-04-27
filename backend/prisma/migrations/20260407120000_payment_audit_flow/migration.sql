-- CreateTable
CREATE TABLE "PaymentAuditLog" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER,
    "actorId" INTEGER NOT NULL,
    "ticketId" INTEGER,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAuditLog_paymentId_createdAt_idx" ON "PaymentAuditLog"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_actorId_createdAt_idx" ON "PaymentAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_ticketId_idx" ON "PaymentAuditLog"("ticketId");

-- AddForeignKey
ALTER TABLE "PaymentAuditLog" ADD CONSTRAINT "PaymentAuditLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuditLog" ADD CONSTRAINT "PaymentAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuditLog" ADD CONSTRAINT "PaymentAuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PaymentTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
