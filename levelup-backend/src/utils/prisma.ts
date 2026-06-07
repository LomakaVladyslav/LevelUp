import { PrismaClient } from '@prisma/client';

// We create ONE PrismaClient instance and reuse it everywhere.
// This prevents opening too many database connections.
const prisma = new PrismaClient();

export default prisma;
