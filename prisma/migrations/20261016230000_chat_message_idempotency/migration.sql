ALTER TABLE "Message"
ADD COLUMN "clientRequestId" VARCHAR(64);

CREATE UNIQUE INDEX "Message_conversationId_clientRequestId_role_key"
ON "Message"("conversationId", "clientRequestId", "role");
