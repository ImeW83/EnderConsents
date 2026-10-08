/*
  Warnings:

  - Added the required column `eventHash` to the `ConsentEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ConsentEvent" ADD COLUMN     "eventHash" TEXT NOT NULL,
ADD COLUMN     "noticeVersionId" TEXT,
ADD COLUMN     "previousEventHash" TEXT,
ADD COLUMN     "purposeVersionId" TEXT;

-- AlterTable
ALTER TABLE "ConsentState" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubjectIdentifier" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "valuePlain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectIdentifier_subjectId_idx" ON "SubjectIdentifier"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectIdentifier_type_valueHash_key" ON "SubjectIdentifier"("type", "valueHash");

-- AddForeignKey
ALTER TABLE "SubjectIdentifier" ADD CONSTRAINT "SubjectIdentifier_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_purposeVersionId_fkey" FOREIGN KEY ("purposeVersionId") REFERENCES "PurposeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_noticeVersionId_fkey" FOREIGN KEY ("noticeVersionId") REFERENCES "NoticeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
