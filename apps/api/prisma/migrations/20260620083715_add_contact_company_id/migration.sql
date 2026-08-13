/*
  Migration: Contact.company (string) → Contact.companyId (foreign key)

  Steps:
  1. Add companyId column
  2. Map existing company names to Company.id within the same tenant
  3. Drop old company column
  4. Add foreign key and index
*/

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "companyId" TEXT;

-- Migrate existing company names to companyId
UPDATE "Contact" c
SET "companyId" = cmp.id
FROM "Company" cmp
WHERE c."tenantId" = cmp."tenantId"
  AND c.company = cmp.name;

-- Drop old string column
ALTER TABLE "Contact" DROP COLUMN "company";

-- CreateIndex
CREATE INDEX "Contact_tenantId_companyId_idx" ON "Contact"("tenantId", "companyId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
