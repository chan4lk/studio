-- CreateEnum
CREATE TYPE "DeckStatus" AS ENUM ('DRAFTING', 'PROPOSING_OUTLINE', 'OUTLINE_READY', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "brandKitId" TEXT,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'SQUARE',
    "designMode" "DesignMode" NOT NULL,
    "copyProviderKey" TEXT NOT NULL,
    "imageProviderKey" TEXT,
    "briefImages" JSONB,
    "proposedOutline" JSONB,
    "status" "DeckStatus" NOT NULL DEFAULT 'PROPOSING_OUTLINE',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckSlide" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");

-- CreateIndex
CREATE INDEX "Deck_campaignId_idx" ON "Deck"("campaignId");

-- CreateIndex
CREATE INDEX "Deck_teamId_idx" ON "Deck"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckSlide_draftId_key" ON "DeckSlide"("draftId");

-- CreateIndex
CREATE INDEX "DeckSlide_deckId_idx" ON "DeckSlide"("deckId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckSlide_deckId_orderIndex_key" ON "DeckSlide"("deckId", "orderIndex");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckSlide" ADD CONSTRAINT "DeckSlide_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckSlide" ADD CONSTRAINT "DeckSlide_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
