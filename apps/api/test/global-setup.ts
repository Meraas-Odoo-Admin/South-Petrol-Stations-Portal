import { PrismaClient } from '@prisma/client';

// After review (19 Oct 2026): every vehicle needs a type. One test type, made
// once for the whole run; registration-fixtures' vehicleBody() uses it.
export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const type = await prisma.vehicleType.upsert({
      where: { name: 'E2E نوع مركبة' },
      create: { name: 'E2E نوع مركبة' },
      update: { isActive: true },
    });
    process.env.E2E_VEHICLE_TYPE_ID = type.id;
  } finally {
    await prisma.$disconnect();
  }
}
