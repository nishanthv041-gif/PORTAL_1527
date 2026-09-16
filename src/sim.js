const { loadEnvConfig } = require('@next/env');
loadEnvConfig('..'); // load env from parent directory
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findUnique({ where: { email: 'nishanthv041@gmail.com' } })
  .then(console.log)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
