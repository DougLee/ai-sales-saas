-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "orgId" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "orgId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_tenantId_orgId_idx" ON "Lead"("tenantId", "orgId");

-- CreateIndex
CREATE INDEX "Project_tenantId_orgId_idx" ON "Project"("tenantId", "orgId");

-- CreateIndex
CREATE INDEX "Task_tenantId_orgId_idx" ON "Task"("tenantId", "orgId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_orgId_idx" ON "Visit"("tenantId", "orgId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
