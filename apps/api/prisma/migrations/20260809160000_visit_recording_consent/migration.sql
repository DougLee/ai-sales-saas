-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentConfirmed" BOOLEAN NOT NULL DEFAULT false;
