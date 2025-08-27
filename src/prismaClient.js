const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (!globalForPrisma.prisma) {
  prisma
    .$connect()
    .then(async () => {
      await prisma.$executeRawUnsafe(`SET time_zone = '+05:30'`);
    })
    .catch(console.error);

  globalForPrisma.prisma = prisma;
}


module.exports = prisma;