-- CreateTable
CREATE TABLE "SchemaProbe" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaProbe_pkey" PRIMARY KEY ("id")
);
