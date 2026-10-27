CREATE TABLE "Avatar" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "contentType" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Avatar_size_check" CHECK (octet_length("data") BETWEEN 1 AND 2097152),
  CONSTRAINT "Avatar_content_type_check" CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp'))
);
CREATE UNIQUE INDEX "Avatar_userId_key" ON "Avatar"("userId");
