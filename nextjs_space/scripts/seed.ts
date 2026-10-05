import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('EFXrZ@sp7b', 12);
  await prisma.user.upsert({
    where: { email: 'abacus-e8064c76@example.com' },
    update: {},
    create: {
      email: 'abacus-e8064c76@example.com',
      password: hash,
      displayName: 'Test Admin',
    },
  });
  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
