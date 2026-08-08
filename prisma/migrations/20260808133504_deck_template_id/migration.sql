-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "templateId" TEXT;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BrandKitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
